"use client";

import { useEffect, useState } from "react";
import { Brain, Check, Loader2, Mic, MicOff, Send, Sparkles, Swords, Table2, X } from "lucide-react";
import { cn } from "cn";
import { course } from "@/lib/course";
import type { Plan } from "@/lib/plan";
import type { CoachLine, CoachTurn, RaceEngine, RaceView } from "@/lib/engine";
import { describeAction, type BattleLine } from "@/lib/live";
import { fmtClock, fmtHm } from "@/lib/format";
import type { ListenState } from "@/hooks/use-voice";
import type { PartnerStatus } from "@/hooks/use-partner-status";
import { MarmoSprite } from "@/components/sprites";
import { StationBadge } from "@/components/race/station-pin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const QUICK = ["How am I doing?", "Where's my shadow?", "How far to the next aid?", "My calf is cramping", "Will I make the cut-off?", "I feel empty"];

function Typewriter({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setN((v) => (v >= text.length ? v : v + 2)), 32);
    return () => clearInterval(iv);
  }, [text]);
  const done = n >= text.length;
  return (
    <span>
      {text.slice(0, n)}
      <span className={cn("ml-0.5 inline-block text-primary", done ? "animate-caret" : "opacity-0")}>▼</span>
    </span>
  );
}

function engineLabel(engine: CoachLine["engine"] | undefined, model?: string) {
  if (engine === "gemini") return model ? model.replace(/^models\//, "") : "Gemini";
  return "Offline rules";
}

const TOOL_MOVES: Record<string, { move: string; doing: string }> = {
  get_race_status: { move: "STATUS CHECK", doing: "Checking your pace, energy and cut-off margins" },
  get_course_ahead: { move: "TRAIL SCOUT", doing: "Scouting the climbs and aid stations ahead" },
  get_personal_patterns: { move: "MEMORY DIG", doing: "Digging through your Garmin runs" },
  replan: { move: "REPLAN", doing: "Testing a new effort against the cut-offs" },
  speak: { move: "PEP TALK", doing: "Choosing the words" },
  stay_silent: { move: "QUIET FOCUS", doing: "Letting you run" },
};

function toolMove(tool: string) {
  return TOOL_MOVES[tool] ?? { move: tool.replace(/_/g, " ").toUpperCase(), doing: "Working" };
}

function ThinkingState({ turn }: { turn: CoachTurn }) {
  const last = turn.steps.at(-1);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
        <span className="truncate">
          Marmo is thinking… <span className="text-foreground">{turn.label}</span>
        </span>
      </div>
      {last ? (
        <div key={turn.steps.length} className="animate-rise">
          <p className="font-pixel text-[9px] leading-relaxed text-primary">Marmo used {toolMove(last.tool).move}!</p>
          <p className="text-xs text-muted-foreground">{toolMove(last.tool).doing}</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {turn.engine === "gemini" ? `${engineLabel("gemini", turn.model)} is choosing a tool` : "Reading the course and your live status"}
        </p>
      )}
    </div>
  );
}

export function CoachDialog({ view, idleText }: { view: RaceView; idleText: string }) {
  const line = view.line;
  const thinking = view.thinking;
  return (
    <div className="flex items-end gap-3">
      <div className="relative shrink-0">
        <MarmoSprite height={76} talking={view.speaking} />
        <span className="font-pixel absolute -bottom-1 left-1/2 -translate-x-1/2 rounded bg-primary px-1 py-0.5 text-[7px] text-primary-foreground">MARMO</span>
      </div>
      <div className="rpg-box min-h-[104px] min-w-0 flex-1 px-3.5 py-3" data-tone={line?.tone} aria-live="polite">
        {thinking ? (
          <ThinkingState turn={thinking} />
        ) : line ? (
          <>
            <div className="mb-1 flex items-center gap-2">
              <span className="font-pixel text-[7px] tracking-wide text-primary uppercase">{line.label}</span>
              <span className="text-[10px] text-muted-foreground">via {engineLabel(line.engine, line.model)}</span>
            </div>
            <p className="text-[15px] leading-snug font-medium">
              <Typewriter key={line.id} text={line.text} />
            </p>
          </>
        ) : (
          <p className="text-[15px] leading-snug text-muted-foreground">{idleText}</p>
        )}
      </div>
    </div>
  );
}

export function AskBar({
  onAsk,
  listen,
  onMic,
  micAvailable,
  disabled,
}: {
  onAsk: (text: string) => void;
  listen: ListenState;
  onMic: () => void;
  micAvailable: boolean;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const submit = (q: string) => {
    if (!q.trim()) return;
    onAsk(q);
    setText("");
  };
  return (
    <div className="space-y-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <Button
          type="button"
          size="icon-lg"
          variant={listen === "recording" ? "destructive" : "secondary"}
          onClick={onMic}
          disabled={disabled || listen === "transcribing"}
          aria-label={listen === "recording" ? "Stop recording" : "Talk to Marmo"}
          title={micAvailable ? "Talk to Marmo" : "Voice input unavailable in this browser"}
          className={cn(listen === "recording" && "animate-pulse")}
        >
          {listen === "transcribing" ? <Loader2 className="animate-spin" /> : micAvailable ? <Mic /> : <MicOff />}
        </Button>
        <Input
          name="message"
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={listen === "recording" ? "Listening… tap the mic to send" : "Ask Marmo anything about your race"}
          className="h-9"
          disabled={disabled}
          aria-label="Message to Marmo"
        />
        <Button type="submit" size="icon-lg" disabled={disabled || !text.trim()} aria-label="Send">
          <Send />
        </Button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            disabled={disabled}
            onClick={() => submit(q)}
            className="rounded-full border border-white/12 bg-white/5 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-primary/50 hover:text-foreground disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function summarize(result: unknown): string {
  if (result === null || result === undefined) return "ok";
  if (typeof result === "string") return result;
  if (typeof result !== "object") return String(result);
  const entries = Object.entries(result as Record<string, unknown>)
    .filter(([, v]) => v !== null && (typeof v !== "object" || Array.isArray(v)))
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? `${v.length} items` : String(v)}`);
  return entries.join(" · ") || JSON.stringify(result).slice(0, 140);
}

function argText(args: Record<string, unknown>) {
  const parts = Object.entries(args)
    .filter(([k]) => k !== "message")
    .map(([k, v]) => `${k}: ${typeof v === "string" ? `"${v.length > 28 ? `${v.slice(0, 28)}…` : v}"` : JSON.stringify(v)}`);
  return parts.join(", ");
}

function TurnCard({ turn }: { turn: CoachTurn }) {
  const res = turn.response;
  const engine = res?.engine ?? turn.engine;
  return (
    <div className="animate-rise rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-xs">
      <div className="flex items-center gap-2">
        {turn.status === "thinking" ? <Loader2 className="size-3.5 animate-spin text-primary" /> : <Brain className="size-3.5 text-primary" />}
        <span className="font-medium">{turn.label}</span>
        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
          km {(turn.d / 1000).toFixed(1)} · {fmtClock(turn.t)}
        </span>
      </div>
      {turn.trigger.text && !turn.auto && <div className="mt-1 text-muted-foreground italic">“{turn.trigger.text}”</div>}
      {(engine || res) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge variant={engine === "gemini" ? "default" : "secondary"} className="h-4 px-1.5 text-[10px]">
            {engineLabel(engine, res?.model ?? turn.model)}
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            {res
              ? `${(res.latencyMs / 1000).toFixed(1)} s · ${res.steps.length} steps · ${res.decision === "speak" ? "spoke" : "stayed silent"}`
              : `${turn.steps.length} step${turn.steps.length === 1 ? "" : "s"} so far…`}
          </span>
        </div>
      )}
      {turn.steps.length > 0 && (
        <ol className="mt-1.5 space-y-1">
          {turn.steps.map((s, i) => (
            <li key={i} className="animate-rise rounded bg-black/25 px-2 py-1 font-mono text-[10.5px] leading-snug">
              <span className={cn(s.tool === "speak" ? "text-primary" : s.tool === "stay_silent" ? "text-muted-foreground" : "text-sky-300")}>{s.tool}</span>
              <span className="text-muted-foreground">({argText(s.args)})</span>
              {s.tool !== "speak" && s.tool !== "stay_silent" && <div className="truncate text-muted-foreground/80">→ {summarize(s.result)}</div>}
            </li>
          ))}
        </ol>
      )}
      {res && (
        <>
          {res.actions.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {res.actions.map((a, i) => (
                <span key={i} className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]", turn.applied ? "bg-you/15 text-you" : "bg-white/5 text-muted-foreground line-through")}>
                  {turn.applied ? <Check className="size-2.5" /> : <X className="size-2.5" />}
                  {describeAction(a)}
                </span>
              ))}
            </div>
          )}
          {res.note && <div className="mt-1 text-[10px] text-muted-foreground">{res.note}</div>}
        </>
      )}
    </div>
  );
}

const TONE_CLASS: Record<BattleLine["tone"], string> = {
  info: "text-foreground/90",
  good: "text-you",
  bad: "text-red-300",
  shadow: "text-shadow",
  system: "text-amber-200",
};

function SplitsTable({ view, plan }: { view: RaceView; plan: Plan }) {
  return (
    <table className="w-full text-[11px] tabular-nums">
      <thead className="text-muted-foreground">
        <tr className="text-left">
          <th className="py-1 font-medium">Station</th>
          <th className="py-1 text-right font-medium">Plan</th>
          <th className="py-1 text-right font-medium">You</th>
          <th className="py-1 text-right font-medium">Cut-off</th>
        </tr>
      </thead>
      <tbody>
        {plan.splits
          .filter((s) => s.stationId !== "start")
          .map((sp) => {
            const st = course.aidStations.find((s) => s.id === sp.stationId)!;
            const passed = st.km * 1000 <= view.d + 1;
            const eta = view.arrivals[sp.stationId];
            const margin = sp.cutoffSec !== null && eta !== undefined ? sp.cutoffSec - eta : null;
            return (
              <tr key={sp.stationId} className={cn("border-t border-white/5", passed && "opacity-45")}>
                <td className="py-1">
                  <span className="flex items-center gap-1.5">
                    <StationBadge kind={st.kind} className="size-3.5 [&_svg]:size-2" />
                    <span className="truncate">{st.kind === "finish" ? "Finish" : st.name}</span>
                  </span>
                </td>
                <td className="py-1 text-right text-muted-foreground">{fmtClock(sp.planSec, false)}</td>
                <td className={cn("py-1 text-right", eta !== undefined && eta > sp.planSec + 300 ? "text-amber-300" : "text-you")}>
                  {passed ? "✓" : eta !== undefined ? fmtClock(eta, false) : "–"}
                </td>
                <td className={cn("py-1 text-right", margin !== null && margin < 1800 ? "text-cutoff" : "text-muted-foreground")}>
                  {st.cutoff ? st.cutoff.replace(/^\w+ /, "") : ""}
                </td>
              </tr>
            );
          })}
      </tbody>
    </table>
  );
}

export function CoachPanel({
  view,
  engine,
  plan,
  status,
  listen,
  onMic,
  micAvailable,
  className,
}: {
  view: RaceView;
  engine: RaceEngine;
  plan: Plan;
  status: PartnerStatus | null;
  listen: ListenState;
  onMic: () => void;
  micAvailable: boolean;
  className?: string;
}) {
  const idle = view.started
    ? "Ask me anything, or keep running. I'll speak up when the course or your body needs it."
    : `I've studied your runs and the course. Plan: finish in ${fmtHm(plan.timeline.finishSec)}. Press Start when you're ready.`;
  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      <CoachDialog view={view} idleText={idle} />
      <AskBar onAsk={(q) => engine.ask(q)} listen={listen} onMic={onMic} micAvailable={micAvailable} />
      <Tabs defaultValue="agent" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="w-full">
          <TabsTrigger value="agent" className="gap-1 text-xs">
            <Sparkles className="size-3.5" /> Agent
          </TabsTrigger>
          <TabsTrigger value="log" className="gap-1 text-xs">
            <Swords className="size-3.5" /> Battle log
          </TabsTrigger>
          <TabsTrigger value="splits" className="gap-1 text-xs">
            <Table2 className="size-3.5" /> Splits
          </TabsTrigger>
        </TabsList>
        <TabsContent value="agent" className="min-h-0 flex-1">
          <ScrollArea className="h-full max-h-[52vh] pr-2 lg:max-h-none">
            <div className="space-y-2 pb-2">
              <div className="rounded-lg border border-dashed border-white/10 px-2.5 py-2 text-[11px] text-muted-foreground">
                {status?.gemini ? (
                  <>
                    Marmo runs on <span className="text-foreground">Gemini</span> with function calling: it reads the course, your patterns and your live status, can replan, then decides to speak or stay silent.
                  </>
                ) : (
                  <>
                    Marmo is running on <span className="text-foreground">offline rules</span> using the same tools. Add a <code className="text-foreground">GEMINI_API_KEY</code> to let Gemini drive the tool calls.
                  </>
                )}
              </div>
              {view.turns.length === 0 && <div className="py-6 text-center text-xs text-muted-foreground">Agent decisions and tool calls appear here.</div>}
              {view.turns.map((t) => (
                <TurnCard key={t.id} turn={t} />
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
        <TabsContent value="log" className="min-h-0 flex-1">
          <ScrollArea className="h-full max-h-[52vh] pr-2 lg:max-h-none">
            <ul className="space-y-1 pb-2 font-mono text-[11.5px]">
              {view.log.length === 0 && <li className="py-6 text-center font-sans text-xs text-muted-foreground">Race events appear here as battle text.</li>}
              {view.log.map((l) => (
                <li key={l.id} className="animate-rise flex gap-2">
                  <span className="shrink-0 text-muted-foreground/70 tabular-nums">{fmtClock(l.t, false)}</span>
                  <span className={TONE_CLASS[l.tone]}>{l.text}</span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </TabsContent>
        <TabsContent value="splits" className="min-h-0 flex-1">
          <ScrollArea className="h-full max-h-[52vh] pr-2 lg:max-h-none">
            <SplitsTable view={view} plan={plan} />
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
