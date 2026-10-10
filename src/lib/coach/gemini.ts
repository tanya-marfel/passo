import { course } from "@/lib/course";
import { fmtClock, fmtDuration, fmtHm } from "@/lib/format";
import type { CoachAction, CoachRequest, CoachResponse, CoachStep, CoachStreamEvent } from "@/lib/coach/types";
import { TOOL_DECLARATIONS, makeToolContext, runTool } from "@/lib/coach/tools";
import { describeTrigger, offlineCoach } from "@/lib/coach/offline";

const API = "https://generativelanguage.googleapis.com/v1beta";
const MAX_ROUNDS = 4;

type Part = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
};
type Content = { role: "user" | "model"; parts: Part[] };

let cachedModel: { name: string; at: number } | null = null;

function versionOf(name: string) {
  const m = /^gemini-(\d+(?:\.\d+)?)-flash/.exec(name);
  return m ? parseFloat(m[1]) : 0;
}

export async function pickGeminiModel(key: string): Promise<string> {
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL;
  if (cachedModel && Date.now() - cachedModel.at < 3600_000) return cachedModel.name;
  let name = "gemini-2.5-flash";
  try {
    const res = await fetch(`${API}/models?pageSize=200`, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const json = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
      const names = (json.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => m.name.replace(/^models\//, ""))
        .filter((n) => /^gemini-\d+(\.\d+)?-flash(-preview)?(-[\w-]+)?$/.test(n) && !/lite|image|tts|live|audio|thinking|exp/.test(n));
      names.sort((a, b) => versionOf(b) - versionOf(a) || Number(a.includes("preview")) - Number(b.includes("preview")) || a.length - b.length);
      if (names[0]) name = names[0];
    }
  } catch {
    // keep default
  }
  cachedModel = { name, at: Date.now() };
  return name;
}

function systemPrompt(req: CoachRequest) {
  const p = req.profile;
  return [
    `You are Marmo, a cheerful marmot trail-running coach in Rival Run, a race companion styled like a retro creature-battle RPG with original characters. Never name real game franchises or their creatures.`,
    `You coach ${p.name} (${p.type.name}, level ${p.level}) live through earbuds during the ${course.name}: Cortina d'Ampezzo, start Friday 23:00, ${course.totalKm} km on the official track, about ${course.officialGainM} m of climbing, 30 hour limit.`,
    `Their rival is the Shadow: a ghost of themselves that makes their usual mistakes, built from their Garmin history.`,
    `Each turn you get one EVENT and a live SNAPSHOT. Work like a real coach:`,
    `1. Use tools to check what matters: get_race_status, get_course_ahead, get_personal_patterns, and replan whenever you want to change effort or stop time (it returns exact projected numbers).`,
    `2. End the turn with exactly one terminal tool: speak, or stay_silent when nothing is actionable. Do not nag: routine check-ins are usually silent.`,
    `When you speak: one or two short sentences, at most 40 words, personal (cite their own history briefly, like "you faded 19% in your long runs"), and only numbers that came from tools. Never invent times, distances or cut-offs.`,
    `Write for a tired runner listening, not reading: say "metres per hour" and "minutes", no markdown, no emojis, no lists. Light game flavour (gyms, badges, the Shadow) is welcome, but safety and clarity come first.`,
    `If the runner reports chest pain, dizziness, confusion or an injury beyond a cramp, tell them to walk to the next aid station and see the medical team.`,
  ].join("\n");
}

function snapshotText(req: CoachRequest) {
  const l = req.live;
  const gap = l.shadowGapSec >= 0 ? `${fmtHm(l.shadowGapSec)} behind the runner` : `${fmtHm(-l.shadowGapSec)} ahead of the runner`;
  const plan = Math.abs(l.planDeltaSec) < 60 ? "on plan" : `${fmtHm(Math.abs(l.planDeltaSec))} ${l.planDeltaSec > 0 ? "behind" : "ahead of"} plan`;
  const history = req.history
    .slice(-6)
    .map((h) => `${h.role === "coach" ? "Coach" : "Runner"}: ${h.text}`)
    .join("\n");
  return [
    `EVENT: ${describeTrigger(req)}`,
    `SNAPSHOT: km ${(l.d / 1000).toFixed(1)} of ${course.totalKm}, ${fmtClock(l.t)}, elapsed ${fmtDuration(l.t)}, HP ${Math.round(l.hp)}%, effort ${l.effort.toFixed(2)}, status ${l.status.join(", ") || "none"}, ${plan}, shadow ${gap}, projected finish ${fmtDuration(l.projectedFinishSec)}.`,
    history ? `RECENT CONVERSATION:\n${history}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function thinkingConfig(model: string) {
  if (/gemini-3/.test(model)) return { thinkingLevel: "low" };
  if (/gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 };
  return undefined;
}

async function generate(key: string, model: string, body: Record<string, unknown>) {
  const res = await fetch(`${API}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as { candidates?: { content?: { parts?: Part[] }; finishReason?: string }[] };
}

const ACTIONS = new Set(["eat", "salt", "caffeine", "layer_up", "quick_aid", "pace_climb", "easy_start"]);

export async function geminiCoach(req: CoachRequest, key: string, onEvent?: (e: CoachStreamEvent) => void): Promise<CoachResponse> {
  const t0 = Date.now();
  const model = await pickGeminiModel(key);
  onEvent?.({ type: "start", engine: "gemini", model });
  const ctx = makeToolContext(req);
  const steps: CoachStep[] = [];
  const record = (step: CoachStep) => {
    steps.push(step);
    onEvent?.({ type: "step", step });
  };
  const contents: Content[] = [{ role: "user", parts: [{ text: snapshotText(req) }] }];
  let useThinking = true;

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const last = round === MAX_ROUNDS - 1;
      const body: Record<string, unknown> = {
        systemInstruction: { parts: [{ text: systemPrompt(req) }] },
        contents,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        toolConfig: {
          functionCallingConfig: last ? { mode: "ANY", allowedFunctionNames: ["speak", "stay_silent"] } : { mode: "ANY" },
        },
        generationConfig: {
          // Gemini 3 models are tuned for the default temperature and degrade when it is lowered.
          ...(/gemini-3/.test(model) ? {} : { temperature: 0.6 }),
          maxOutputTokens: 2048,
          ...(useThinking && thinkingConfig(model) ? { thinkingConfig: thinkingConfig(model) } : {}),
        },
      };
      let json;
      try {
        json = await generate(key, model, body);
      } catch (err) {
        if (useThinking && err instanceof Error && /thinking/i.test(err.message)) {
          useThinking = false;
          round--;
          continue;
        }
        throw err;
      }
      const parts = json.candidates?.[0]?.content?.parts ?? [];
      const calls = parts.filter((p) => p.functionCall);
      if (!calls.length) {
        const text = parts
          .filter((p) => p.text && !p.thought)
          .map((p) => p.text)
          .join(" ")
          .trim();
        if (text) {
          record({ tool: "speak", args: { message: text }, result: "spoken" });
          return { engine: "gemini", model, decision: "speak", message: text, tone: "calm", actions: ctx.actions, steps, latencyMs: Date.now() - t0 };
        }
        throw new Error(`Gemini returned no tool call (${json.candidates?.[0]?.finishReason ?? "unknown"})`);
      }
      contents.push({ role: "model", parts });
      const responses: Part[] = [];
      for (const p of calls) {
        const { id, name, args = {} } = p.functionCall!;
        if (name === "speak") {
          const message = String(args.message ?? "").trim();
          const tone = (["calm", "urgent", "celebrate"].includes(String(args.tone)) ? args.tone : "calm") as CoachResponse["tone"];
          const extra = (Array.isArray(args.actions) ? args.actions : [])
            .map(String)
            .filter((a) => ACTIONS.has(a))
            .map((a) => ({ type: a }) as CoachAction);
          record({ tool: "speak", args, result: "spoken" });
          return {
            engine: "gemini",
            model,
            decision: message ? "speak" : "silent",
            message,
            tone,
            actions: [...ctx.actions, ...extra],
            steps,
            latencyMs: Date.now() - t0,
          };
        }
        if (name === "stay_silent") {
          record({ tool: "stay_silent", args, result: "ok" });
          return { engine: "gemini", model, decision: "silent", message: "", tone: "calm", actions: ctx.actions, steps, latencyMs: Date.now() - t0 };
        }
        const s0 = Date.now();
        const result = runTool(ctx, name, args);
        record({ tool: name, args, result, ms: Date.now() - s0 });
        responses.push({ functionResponse: { ...(id ? { id } : {}), name, response: { result } } });
      }
      contents.push({ role: "user", parts: responses });
    }
    throw new Error("Gemini did not finish within the tool budget");
  } catch (err) {
    const fallback = offlineCoach(req, `Gemini unavailable (${err instanceof Error ? err.message : "error"}), used offline coach.`);
    return { ...fallback, steps: [...steps, ...fallback.steps], latencyMs: Date.now() - t0 };
  }
}
