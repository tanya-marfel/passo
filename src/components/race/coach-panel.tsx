"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Mic,
  MicOff,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "cn";
import { course } from "@/lib/course";
import type { Plan } from "@/lib/plan";
import type { CoachLine, CoachTurn, RaceEngine, RaceView } from "@/lib/engine";
import { describeAction, type BattleLine } from "@/lib/live";
import { fmtClock, fmtDuration, fmtHm } from "@/lib/format";
import type { ListenState } from "@/hooks/use-voice";
import type { PartnerStatus } from "@/hooks/use-partner-status";
import { StationBadge } from "@/components/race/station-pin";
import { MarmoSprite } from "@/components/sprites";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const QUICK = [
  { text: "How am I doing?", icon: "📊" },
  { text: "Where's my shadow?", icon: "👻" },
  { text: "How far to next aid?", icon: "🥤" },
  { text: "My calf is cramping", icon: "⚡" },
  { text: "Will I make the cut-off?", icon: "⏱️" },
  { text: "I feel empty", icon: "🪫" },
];

function engineLabel(engine: CoachLine["engine"] | undefined, model?: string) {
  if (engine === "gemini") return model ? model.replace(/^models\//, "") : "Gemini";
  if (engine === "gemma") return model ?? "Gemma";
  return "Offline rules";
}

const TOOL_MOVES: Record<string, { move: string; doing: string }> = {
  get_race_status: { move: "STATUS CHECK", doing: "Checking your pace, energy, and cut-off margins" },
  get_course_ahead: { move: "TRAIL SCOUT", doing: "Scouting upcoming climbs and aid stations" },
  get_personal_patterns: { move: "MEMORY DIG", doing: "Analyzing your Garmin history and habits" },
  replan: { move: "REPLAN", doing: "Recalculating target effort against course cut-offs" },
  speak: { move: "PEP TALK", doing: "Crafting real-time audio guidance" },
  stay_silent: { move: "QUIET FOCUS", doing: "Letting you focus on running" },
};

function toolMove(tool: string) {
  return TOOL_MOVES[tool] ?? { move: tool.replace(/_/g, " ").toUpperCase(), doing: "Thinking" };
}

function ThinkingState({ turn }: { turn: CoachTurn }) {
  const steps = turn.steps ?? [];
  const last = steps.at(-1);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs text-primary font-medium">
        <Loader2 className="size-3.5 shrink-0 animate-spin" />
        <span className="truncate">Marmo is evaluating…</span>
        <span className="ml-auto rounded bg-primary/15 px-1.5 py-0.2 text-[10px] text-primary">{turn.label}</span>
      </div>
      {last ? (
        <div key={steps.length} className="animate-rise">
          <p className="text-xs text-muted-foreground">{toolMove(last.tool).doing}</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {turn.engine === "gemini"
            ? "Consulting Gemini with your live telemetry…"
            : turn.engine === "gemma"
              ? "Gemma is writing the call on this machine…"
              : "Evaluating course rules and split times…"}
        </p>
      )}
    </div>
  );
}

export function CoachDialog({ view, idleText }: { view: RaceView; idleText: string }) {
  const line = view.line;
  const thinking = view.thinking;
  const isTalking = Boolean(view.speaking || (line && !thinking));

  return (
    <div
      className={cn(
        "relative rounded-xl border border-white/12 bg-black/60 p-3.5 shadow-lg backdrop-blur-md transition-all",
        line?.tone === "urgent" && "border-red-500/50 bg-red-950/20",
        line?.tone === "celebrate" && "border-amber-400/50 bg-amber-950/20",
      )}
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        {/* Marmo Avatar */}
        <div className="relative shrink-0 pt-0.5">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-1.5 shadow-md">
            <MarmoSprite height={42} talking={isTalking} />
          </div>
          {thinking && (
            <span className="absolute -bottom-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
              <Loader2 className="size-2.5 animate-spin" />
            </span>
          )}
        </div>

        {/* Message Content */}
        <div className="min-w-0 flex-1">
          {thinking ? (
            <ThinkingState turn={thinking} />
          ) : line ? (
            <>
              <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground flex items-center gap-1">
                  Marmo
                  <span className="text-muted-foreground font-normal">· {line.label}</span>
                </span>
                <span className="rounded bg-white/5 px-1.5 py-0.2 text-[10px]">
                  {engineLabel(line.engine, line.model)}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-foreground font-medium">{line.text}</p>
            </>
          ) : (
            <>
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                <span>Marmo</span>
                <span className="text-[10px] text-muted-foreground font-normal">AI Trail Coach</span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{idleText}</p>
            </>
          )}
        </div>
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
        className="relative flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <Button
          type="button"
          size="icon-sm"
          variant={listen === "recording" ? "destructive" : "secondary"}
          onClick={onMic}
          disabled={disabled || listen === "transcribing"}
          aria-label={listen === "recording" ? "Stop recording voice" : "Talk to Marmo"}
          title={micAvailable ? "Talk to Marmo" : "Voice input unavailable"}
          className={cn("size-8 shrink-0", listen === "recording" && "animate-pulse ring-2 ring-red-500/50")}
        >
          {listen === "transcribing" ? <Loader2 className="size-3.5 animate-spin" /> : micAvailable ? <Mic className="size-3.5" /> : <MicOff className="size-3.5" />}
        </Button>
        <Input
          name="message"
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={listen === "recording" ? "Listening… click mic to send" : "Ask Marmo anything about your race…"}
          className="h-8 text-xs border-white/10 bg-white/[0.04] pr-8 focus-visible:ring-1"
          disabled={disabled}
          aria-label="Message to Marmo"
        />
        <Button
          type="submit"
          size="icon-sm"
          disabled={disabled || !text.trim()}
          aria-label="Send message"
          className="size-8 shrink-0"
        >
          <Send className="size-3.5" />
        </Button>
      </form>

      {/* Suggested Prompt Chips */}
      <div className="flex flex-wrap gap-1">
        {QUICK.map((q) => (
          <button
            key={q.text}
            type="button"
            disabled={disabled}
            onClick={() => submit(q.text)}
            className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10.5px] text-muted-foreground transition hover:border-white/25 hover:bg-white/[0.07] hover:text-foreground disabled:opacity-50 active:scale-95"
          >
            <span className="text-[10px]">{q.icon}</span>
            <span>{q.text}</span>
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

/**
 * Clean, human-first Coach Decision Card.
 * Highlights the coach's spoken advice and applied adjustments first,
 * with an optional expandable accordion to inspect underlying AI tool calls.
 */
function TurnCard({ turn }: { turn: CoachTurn }) {
  const [showTools, setShowTools] = useState(false);
  const res = turn.response;
  const engine = res?.engine ?? turn.engine;
  const steps = turn.steps ?? res?.steps ?? [];
  const km = (turn.d / 1000).toFixed(1);

  return (
    <div className="animate-rise rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-1.5">
        <div className="flex items-center gap-1.5">
          {turn.status === "thinking" ? (
            <Loader2 className="size-3.5 animate-spin text-primary" />
          ) : (
            <Sparkles className="size-3 text-primary" />
          )}
          <span className="font-semibold text-foreground">{turn.label}</span>
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          km {km} · {fmtClock(turn.t)}
        </span>
      </div>

      {/* Trigger question if asked by runner */}
      {turn.trigger.text && !turn.auto && (
        <div className="rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-xs text-foreground/90 italic">
          “{turn.trigger.text}”
        </div>
      )}

      {/* Advice Note / Speech */}
      {res && (
        <div className="space-y-1.5">
          {res.decision === "speak" && res.message ? (
            <p className="text-xs leading-relaxed text-foreground font-medium">“{res.message}”</p>
          ) : res.decision === "stay_silent" ? (
            <p className="text-[11px] text-muted-foreground italic flex items-center gap-1">
              <span>🤫</span> Marmo observed conditions and stayed silent so you can focus.
            </p>
          ) : null}

          {res.note && <p className="text-[11px] text-muted-foreground">{res.note}</p>}
        </div>
      )}

      {/* Applied Actions (Pill Badges) */}
      {res && res.actions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          {res.actions.map((a, i) => (
            <span
              key={i}
              className={cn(
                "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium",
                turn.applied
                  ? "border border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                  : "bg-white/5 text-muted-foreground line-through",
              )}
            >
              {turn.applied ? <Check className="size-2.5" /> : <X className="size-2.5" />}
              {describeAction(a)}
            </span>
          ))}
        </div>
      )}

      {/* Expandable Agent Reasoning Section */}
      {steps.length > 0 && (
        <div className="border-t border-white/5 pt-1.5">
          <button
            type="button"
            onClick={() => setShowTools((v) => !v)}
            className="flex items-center justify-between w-full text-[10.5px] text-muted-foreground hover:text-foreground transition"
          >
            <span className="flex items-center gap-1">
              <Badge variant={engine === "gemini" || engine === "gemma" ? "default" : "secondary"} className="h-3.5 px-1 text-[9px]">
                {engineLabel(engine, res?.model ?? turn.model)}
              </Badge>
              <span>{steps.length} tool {steps.length === 1 ? "call" : "calls"} {res ? `· ${(res.latencyMs / 1000).toFixed(1)}s` : ""}</span>
            </span>
            <span className="flex items-center gap-0.5">
              <span>{showTools ? "Hide details" : "Show details"}</span>
              {showTools ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            </span>
          </button>

          {showTools && (
            <ol className="mt-2 space-y-1 animate-rise">
              {steps.map((s, i) => (
                <li key={i} className="rounded bg-black/40 p-1.5 font-mono text-[10px] leading-snug">
                  <div className="flex items-center justify-between">
                    <span className={cn("font-semibold", s.tool === "speak" ? "text-primary" : s.tool === "stay_silent" ? "text-muted-foreground" : "text-sky-300")}>
                      {s.tool}
                    </span>
                    <span className="text-[9px] text-muted-foreground/70">{toolMove(s.tool).move}</span>
                  </div>
                  {Object.keys(s.args).length > 0 && (
                    <div className="text-muted-foreground truncate mt-0.5">({argText(s.args)})</div>
                  )}
                  {s.tool !== "speak" && s.tool !== "stay_silent" && s.result !== undefined && (
                    <div className="truncate text-muted-foreground/80 mt-0.5">→ {summarize(s.result)}</div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

const TONE_STYLE: Record<BattleLine["tone"], { text: string; icon: string }> = {
  info: { text: "text-foreground", icon: "ℹ️" },
  good: { text: "text-emerald-300", icon: "✨" },
  bad: { text: "text-red-300", icon: "⚠️" },
  shadow: { text: "text-purple-300", icon: "👻" },
  system: { text: "text-amber-200", icon: "☀️" },
};

function SplitsTable({ view, plan }: { view: RaceView; plan: Plan }) {
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[1fr_56px_56px_74px] gap-2 px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        <span>Station</span>
        <span className="text-right">Plan</span>
        <span className="text-right">You</span>
        <span className="text-right">Cut-off</span>
      </div>

      <div className="space-y-1">
        {plan.splits
          .filter((s) => s.stationId !== "start")
          .map((sp) => {
            const st = course.aidStations.find((s) => s.id === sp.stationId)!;
            const passed = st.km * 1000 <= view.d + 1;
            const eta = view.arrivals[sp.stationId];
            const margin = sp.cutoffSec !== null && eta !== undefined ? sp.cutoffSec - eta : null;

            return (
              <div
                key={sp.stationId}
                className={cn(
                  "grid grid-cols-[1fr_56px_56px_74px] items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-xs transition",
                  passed && "opacity-45 bg-transparent",
                  !passed && eta !== undefined && "border-white/15 bg-white/[0.04]",
                )}
              >
                {/* Station Name & Icon */}
                <div className="flex items-center gap-2 min-w-0">
                  <StationBadge kind={st.kind} className="size-4 [&_svg]:size-2.5 shrink-0" />
                  <div className="truncate">
                    <div className="truncate font-medium text-foreground">
                      {st.kind === "finish" ? "Finish" : st.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">km {st.km.toFixed(1)}</div>
                  </div>
                </div>

                {/* Plan Time */}
                <div className="text-right text-[11px] tabular-nums text-muted-foreground font-mono">
                  {fmtClock(sp.planSec, false)}
                </div>

                {/* Actual / Projected ETA */}
                <div
                  className={cn(
                    "text-right text-[11px] tabular-nums font-mono font-medium",
                    passed
                      ? "text-emerald-400"
                      : eta !== undefined && eta > sp.planSec + 300
                        ? "text-amber-300"
                        : "text-emerald-300",
                  )}
                >
                  {passed ? "✓ Done" : eta !== undefined ? fmtClock(eta, false) : "–"}
                </div>

                {/* Cut-off Safety Margin */}
                <div className="text-right text-[10.5px] tabular-nums">
                  {margin !== null ? (
                    <span
                      className={cn(
                        "rounded px-1 py-0.2 font-medium",
                        margin < 1800
                          ? "bg-red-500/20 text-red-300"
                          : margin < 3600
                            ? "bg-amber-500/20 text-amber-300"
                            : "bg-emerald-500/20 text-emerald-300",
                      )}
                    >
                      {margin >= 0 ? `+${fmtHm(margin)}` : `-${fmtHm(-margin)}`}
                    </span>
                  ) : st.cutoff ? (
                    <span className="text-muted-foreground">{st.cutoff.replace(/^\w+ /, "")}</span>
                  ) : (
                    <span className="text-muted-foreground/60">–</span>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
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
    ? "Ask about pace, the next climb, or how you feel."
    : `Target finish ${fmtHm(plan.timeline.finishSec)}. Start when ready.`;

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      {/* Marmo Speaking Box */}
      <CoachDialog view={view} idleText={idle} />

      {/* Ask / Mic Input Bar */}
      <AskBar
        onAsk={(q) => engine.ask(q)}
        listen={listen}
        onMic={onMic}
        micAvailable={micAvailable}
      />

      {/* Sidebar Tabs */}
      <Tabs defaultValue="agent" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="w-full grid grid-cols-3 border border-white/10 bg-white/[0.04]">
          <TabsTrigger value="agent" className="text-xs">
            Coach ({view.turns.length})
          </TabsTrigger>
          <TabsTrigger value="log" className="text-xs">
            Feed ({view.log.length})
          </TabsTrigger>
          <TabsTrigger value="splits" className="text-xs">
            Splits
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Coach Decisions */}
        <TabsContent value="agent" className="min-h-0 flex-1 mt-2">
          <ScrollArea className="h-full max-h-[52vh] pr-2 lg:max-h-none">
            <div className="space-y-2 pb-2">
              <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
                <span>
                  {status?.coach === "gemini"
                    ? "Live decisions powered by Gemini."
                    : status?.coach === "gemma"
                      ? "Live lines are spoken by Gemma 3 1B on this machine."
                      : "Decisions use the built-in coach."}
                </span>
              </div>
              {view.turns.length === 0 && (
                <div className="py-10 text-center text-xs text-muted-foreground">
                  Coaching advice and tactical calls will appear here as you run.
                </div>
              )}
              {view.turns.map((t) => (
                <TurnCard key={t.id} turn={t} />
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Tab 2: Race Event Feed */}
        <TabsContent value="log" className="min-h-0 flex-1 mt-2">
          <ScrollArea className="h-full max-h-[52vh] pr-2 lg:max-h-none">
            <ul className="space-y-1.5 pb-2 text-xs">
              {view.log.length === 0 && (
                <li className="py-10 text-center text-xs text-muted-foreground">
                  Race milestones, gym clears, and course events appear here.
                </li>
              )}
              {view.log.map((l) => (
                <li
                  key={l.id}
                  className="animate-rise flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-2 leading-relaxed"
                >
                  <span className="shrink-0 text-[10px] text-muted-foreground/70 tabular-nums font-mono pt-0.5">
                    {fmtClock(l.t, false)}
                  </span>
                  <span className={cn("flex-1", TONE_STYLE[l.tone].text)}>{l.text}</span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </TabsContent>

        {/* Tab 3: Splits Table */}
        <TabsContent value="splits" className="min-h-0 flex-1 mt-2">
          <ScrollArea className="h-full max-h-[52vh] pr-2 lg:max-h-none">
            <SplitsTable view={view} plan={plan} />
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
