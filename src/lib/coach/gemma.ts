import path from "node:path";
import { course } from "@/lib/course";
import { describeTrigger, offlineCoach } from "@/lib/coach/offline";
import type { CoachRequest, CoachResponse, CoachStreamEvent } from "@/lib/coach/types";

export const GEMMA_MODEL_ID = "onnx-community/gemma-3-1b-it-ONNX";
export const GEMMA_LABEL = "gemma-3-1b-it";

type ChatTurn = { role: string; content?: string };
type Generator = (
  messages: { role: string; content: string }[],
  options: { max_new_tokens: number; do_sample: boolean },
) => Promise<{ generated_text?: string | ChatTurn[] }[]>;

let loading: Promise<Generator> | null = null;
let ready = false;

export function gemmaReady() {
  return ready;
}

/** Start the download and load without blocking the caller. */
export function warmupGemma() {
  void loadGemma().catch(() => undefined);
}

async function loadGemma(): Promise<Generator> {
  if (!loading) {
    loading = (async () => {
      const { env, pipeline } = await import("@huggingface/transformers");
      env.cacheDir = path.join(process.cwd(), ".cache/transformers");
      const generator = await pipeline("text-generation", GEMMA_MODEL_ID, { dtype: "q4f16", device: "cpu" });
      ready = true;
      return generator as Generator;
    })().catch((err) => {
      loading = null;
      ready = false;
      throw err;
    });
  }
  return loading;
}

function situation(req: CoachRequest) {
  let text = describeTrigger(req);
  const blob = `${course.name} ${course.shortName} ${course.location}`.toLowerCase();
  if (!blob.includes("cortina")) text = text.replace(/\bin Cortina\b/gi, `at ${course.location}`);
  if (!blob.includes("dolomit")) text = text.replace(/\bover the Dolomites\b/gi, "ahead");
  return text;
}

export function cleanSpeech(raw: string, fallback: string) {
  const text = raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:marmo|coach|message|idea)\s*:\s*/i, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();
  if (text.length < 12 || text.length > 420) return fallback;
  if (/\b(rewrite|preamble|as an ai|i am ready|i'm ready|here(?:'|’)s|let me)\b/i.test(text)) return fallback;
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept: string[] = [];
  let words = 0;
  for (const sentence of sentences) {
    const count = sentence.split(/\s+/).filter(Boolean).length;
    if (kept.length && words + count > 45) break;
    kept.push(sentence);
    words += count;
    if (kept.length === 3) break;
  }
  const spoken = kept.join(" ").trim();
  return spoken.length >= 12 ? spoken : fallback;
}

function textOf(output: { generated_text?: string | ChatTurn[] }[] | undefined) {
  const generated = output?.[0]?.generated_text;
  if (typeof generated === "string") return generated;
  const last = Array.isArray(generated) ? generated.at(-1) : undefined;
  return typeof last?.content === "string" ? last.content : "";
}

export async function phraseWithGemma(idea: string, situationText: string) {
  const generator = await loadGemma();
  const output = await generator(
    [
      {
        role: "system",
        content:
          "You are Marmo, speaking into a runner's ear. Reply with one or two spoken sentences only.",
      },
      { role: "user", content: `${situationText} ${idea} What do you say? Include the practical advice.` },
    ],
    { max_new_tokens: 60, do_sample: false },
  );
  return textOf(output);
}

export async function gemmaCoach(req: CoachRequest, onEvent?: (e: CoachStreamEvent) => void): Promise<CoachResponse> {
  const t0 = Date.now();
  onEvent?.({ type: "start", engine: "gemma", model: GEMMA_LABEL });
  const base = offlineCoach(req);
  for (const step of base.steps) {
    if (step.tool !== "speak") onEvent?.({ type: "step", step });
  }
  if (base.decision !== "speak" || !base.message) {
    return { ...base, engine: "gemma", model: GEMMA_LABEL, latencyMs: Date.now() - t0, note: "Gemma 3 1B on this machine." };
  }
  let message = base.message;
  let fellBack = false;
  try {
    const raw = await phraseWithGemma(base.message, `Race: ${course.shortName}, ${course.location}. ${situation(req)}`);
    message = cleanSpeech(raw, base.message);
    fellBack = message === base.message;
  } catch (err) {
    return {
      ...base,
      latencyMs: Date.now() - t0,
      note: `Gemma unavailable (${err instanceof Error ? err.message : "error"}), using the built-in coach.`,
    };
  }
  const steps = base.steps.map((step) => (step.tool === "speak" ? { ...step, args: { ...step.args, message }, result: "spoken by Gemma" } : step));
  const speak = steps.find((step) => step.tool === "speak");
  if (speak) onEvent?.({ type: "step", step: speak });
  return {
    ...base,
    engine: "gemma",
    model: GEMMA_LABEL,
    message,
    steps,
    latencyMs: Date.now() - t0,
    note: fellBack ? "Gemma 3 1B on this machine. The line kept the built-in wording." : "Gemma 3 1B on this machine.",
  };
}
