"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Clock,
  Mountain,
  Play,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { cn } from "cn";
import { course } from "@/lib/course";
import { buildPlan, type GoalId, type Plan } from "@/lib/plan";
import type { RunnerProfile } from "@/lib/profile";
import { fmtClock, fmtDuration, fmtHm } from "@/lib/format";
import type { PartnerStatus } from "@/hooks/use-partner-status";
import { AppHeader } from "@/components/app-header";
import { ElevationProfile } from "@/components/race/elevation-profile";
import { BadgeIcon, MarmoSprite, RunnerSprite, ShadowSprite } from "@/components/sprites";
import { Button } from "@/components/ui/button";

const GOALS: { id: GoalId; label: string; tag: string; desc: string }[] = [
  { id: "safe", label: "Safe", tag: "Conservative", desc: "Builds a larger cut-off buffer for tough climbs" },
  { id: "model", label: "Your Data", tag: "Calibrated", desc: "Direct fit to your historical Garmin pace" },
  { id: "stretch", label: "Stretch", tag: "Aggressive", desc: "Demands strict climbing cadence & quick aid stops" },
];

export function ProfileScreen({
  profile,
  plan,
  goal,
  status,
  onGoal,
  onStart,
  onNewData,
  onChangeRace,
}: {
  profile: RunnerProfile;
  plan: Plan;
  goal: GoalId;
  status: PartnerStatus | null;
  onGoal: (g: GoalId) => void;
  onStart: () => void;
  onNewData: () => void;
  onChangeRace: () => void;
}) {
  const finishes = useMemo(
    () =>
      Object.fromEntries(
        GOALS.map((g) => [g.id, buildPlan(profile, g.id).timeline.finishSec])
      ) as Record<GoalId, number>,
    [profile]
  );

  const gap = plan.shadow.finishSec - plan.timeline.finishSec;
  const tight = useMemo(() => {
    return plan.splits
      .filter((s) => s.marginSec !== null && s.stationId !== "finish")
      .sort((a, b) => a.marginSec! - b.marginSec!)[0];
  }, [plan.splits]);

  const habit = profile.patterns[0];
  const limitH = Math.round(course.timeLimitSec / 3600);

  function goalDelta(id: GoalId) {
    if (id === "model") return "Baseline";
    const diff = finishes[id] - finishes.model;
    if (diff > 0) return `+${fmtHm(diff)}`;
    return `-${fmtHm(Math.abs(diff))}`;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[#0d0d0c] text-foreground">
      <AppHeader status={status}>
        <button
          type="button"
          className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          onClick={onChangeRace}
        >
          Change race
        </button>
        <button
          type="button"
          className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          onClick={onNewData}
        >
          Reset data
        </button>
      </AppHeader>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {/* Top Hero Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/8 pb-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-amber-300">
              <Mountain className="size-3.5" />
              <span>{course.location}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">Starts {course.startLocal}</span>
            </div>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {course.shortName || course.name}
            </h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 font-medium tabular-nums text-foreground">
                {course.totalKm} km
              </span>
              <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 font-medium tabular-nums text-foreground">
                {Math.round(course.officialGainM).toLocaleString("en-GB")} m ascent
              </span>
              <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 font-medium tabular-nums text-foreground">
                {limitH}h cut-off
              </span>
              <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-300">
                8 Mountain Passes
              </span>
              <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 font-medium text-muted-foreground">
                Fitted from {profile.activityCount} runs
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              size="lg"
              onClick={onStart}
              className="h-11 gap-2 bg-emerald-600 px-5 text-sm font-semibold text-white shadow-lg shadow-emerald-950/40 transition hover:bg-emerald-500 active:scale-95"
            >
              <Play className="size-4 fill-current" />
              <span>Start Simulation</span>
            </Button>
          </div>
        </div>

        {/* 2-Column Dashboard Grid */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column (7 cols): The Duel Matchup & Pacing Strategy */}
          <div className="space-y-6 lg:col-span-7">
            {/* The Duel Matchup Card */}
            <div className="rpg-box relative overflow-hidden rounded-2xl border border-white/12 bg-black/40 p-5 shadow-xl">
              <div className="flex items-center justify-between border-b border-white/8 pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  The Pacing Duel
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Your Clean Plan vs. Historical Tendencies
                </span>
              </div>

              <div className="mt-4 grid grid-cols-11 items-center gap-2">
                {/* Clean Runner */}
                <div className="col-span-5 flex flex-col items-center rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-center">
                  <div className="flex size-12 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 shadow">
                    <RunnerSprite height={34} />
                  </div>
                  <span className="mt-2 text-xs font-semibold text-foreground">
                    {profile.name?.trim() || "You (Target Plan)"}
                  </span>
                  <span className="mt-0.5 text-xl font-bold tracking-tight text-emerald-400 tabular-nums">
                    {fmtDuration(plan.timeline.finishSec)}
                  </span>
                  <span className="mt-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                    Clean Execution
                  </span>
                </div>

                {/* VS / Delta Badge */}
                <div className="col-span-1 flex flex-col items-center justify-center">
                  <span className="text-xs font-black uppercase text-muted-foreground/60">VS</span>
                </div>

                {/* Shadow Rival */}
                <div className="col-span-5 flex flex-col items-center rounded-xl border border-purple-500/25 bg-purple-500/5 p-3 text-center">
                  <div className="flex size-12 items-center justify-center rounded-xl border border-purple-500/30 bg-purple-500/10 shadow">
                    <ShadowSprite height={34} />
                  </div>
                  <span className="mt-2 text-xs font-semibold text-shadow">Shadow Rival</span>
                  <span className="mt-0.5 text-xl font-bold tracking-tight text-purple-300 tabular-nums">
                    {fmtDuration(plan.shadow.finishSec)}
                  </span>
                  <span className="mt-1 rounded bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-medium text-purple-300">
                    {gap > 60 ? `+${fmtHm(gap)} habit penalty` : "Historical Average"}
                  </span>
                </div>
              </div>

              <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
                The <span className="font-semibold text-shadow">Shadow Rival</span> embodies your past Garmin mistakes (fast starts, late fades, and climb surges). Follow Marmo’s live calls to finish ahead.
              </p>
            </div>

            {/* Target Strategy Selector */}
            <div className="rounded-2xl border border-white/8 bg-black/30 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Select Pacing Target
                </span>
                <span className="text-xs text-muted-foreground">
                  Calibrated to your fitness
                </span>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3" role="radiogroup">
                {GOALS.map((g) => {
                  const active = goal === g.id;
                  const delta = goalDelta(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => onGoal(g.id)}
                      className={cn(
                        "relative flex flex-col rounded-xl border p-3.5 text-left transition",
                        active
                          ? "border-emerald-500/50 bg-emerald-500/10 shadow-md shadow-emerald-950/30"
                          : "border-white/8 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className={cn("text-xs font-semibold", active ? "text-emerald-300" : "text-muted-foreground")}>
                          {g.label}
                        </span>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-mono tabular-nums",
                            active
                              ? "bg-emerald-500/20 text-emerald-200"
                              : "bg-white/5 text-muted-foreground"
                          )}
                        >
                          {delta}
                        </span>
                      </div>
                      <div className="mt-1 text-lg font-bold tracking-tight text-foreground tabular-nums">
                        {fmtDuration(finishes[g.id])}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground leading-tight">
                        {g.desc}
                      </p>
                      {active && (
                        <div className="absolute top-2.5 right-2.5 size-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Course Topography & 8 Mountain Passes */}
            <div className="rounded-2xl border border-white/8 bg-black/30 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Course Topography & 8 Mountain Passes
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {course.climbs.length} climb badges
                </span>
              </div>

              <div className="mt-3 overflow-hidden rounded-xl border border-white/8 bg-black/20 p-2">
                <ElevationProfile plan={plan} height={100} />
              </div>

              {/* 8 Mountain Badges Preview */}
              <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
                {course.climbs.map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-col items-center rounded-lg border border-white/6 bg-white/[0.02] p-1.5 text-center"
                    title={`${c.name}: +${Math.round(c.gain)}m climb`}
                  >
                    <BadgeIcon climbId={c.id} earned size={22} />
                    <span className="mt-1 text-[10px] font-medium text-foreground truncate w-full">
                      {c.name.replace(/^(Passo|Forcella|Rifugio|Col)\s+/, "")}
                    </span>
                    <span className="text-[9px] text-muted-foreground tabular-nums">
                      +{Math.round(c.gain)}m
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column (5 cols): Marmo's Scouting Report & Launch */}
          <div className="space-y-6 lg:col-span-5">
            {/* Marmo's Scouting Report Card */}
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.04] p-5 shadow-xl">
              <div className="flex items-center gap-3 border-b border-amber-500/15 pb-3">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10">
                  <MarmoSprite height={36} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-300">
                      Marmo&apos;s Scouting Report
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Autonomous tactical coach · Powered by Gemini
                  </p>
                </div>
              </div>

              {/* Top Habit Detected */}
              {habit && (
                <div className="mt-4 rounded-xl border border-amber-500/20 bg-black/40 p-3.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                    <Zap className="size-3.5" />
                    <span>Top Detected Habit: {habit.title}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    <span className="font-medium text-foreground/90">Evidence:</span> {habit.evidence}
                  </p>
                  <div className="mt-2.5 rounded-lg border border-amber-500/15 bg-amber-500/5 px-2.5 py-2 text-xs text-amber-200/90 leading-relaxed">
                    <span className="font-semibold text-amber-300">Marmo&apos;s Strategy:</span> {habit.advice}
                  </div>
                </div>
              )}

              {/* Critical Cut-off Safety Margin */}
              {tight && tight.marginSec !== null && (
                <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-white/8 bg-black/30 p-3 text-xs">
                  <ShieldCheck className="mt-0.5 size-4 text-emerald-400 shrink-0" />
                  <div>
                    <span className="font-semibold text-foreground">Critical Cut-off Watch</span>
                    <p className="mt-0.5 text-muted-foreground leading-tight">
                      Tightest checkpoint is <span className="font-medium text-foreground">{tight.name}</span> with{" "}
                      <span className="font-semibold text-emerald-300 tabular-nums">
                        {fmtHm(tight.marginSec)}
                      </span>{" "}
                      safety buffer.
                    </p>
                  </div>
                </div>
              )}

              {/* Race Warnings */}
              {plan.warnings.length > 0 && (
                <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-200">
                  <AlertTriangle className="mt-0.5 size-4 text-red-400 shrink-0" />
                  <p className="leading-tight">{plan.warnings[0]}</p>
                </div>
              )}
            </div>

            {/* Launch Card */}
            <div className="rounded-2xl border border-white/12 bg-black/50 p-5 shadow-2xl">
              <Button
                size="lg"
                className="h-13 w-full gap-2.5 bg-emerald-600 text-base font-semibold text-white shadow-xl shadow-emerald-950/50 transition hover:bg-emerald-500 active:scale-[0.98]"
                onClick={onStart}
              >
                <Play className="size-5 fill-current" />
                <span>Start Race Simulation</span>
              </Button>

              <div className="mt-3 space-y-1.5 text-center text-xs text-muted-foreground">
                <p>
                  Press <kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-[10px]">Space</kbd> anytime to pause · Click profile to jump
                </p>
                <p className="text-[11px] text-muted-foreground/80">
                  Marmo speaks calls live via Gradium. Ask questions via voice anytime.
                </p>
              </div>

              <div className="mt-4 border-t border-white/6 pt-3 text-center text-[10px] text-muted-foreground/70">
                <span className="font-medium text-foreground/80">Garmin Connect IQ Prototype</span>
                <p className="mt-0.5">
                  Simulating on-wrist telemetry & audio coaching for the hackathon.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Collapsible Detailed Splits Table */}
        <div className="mt-8">
          <details className="group rounded-2xl border border-white/8 bg-black/20 p-4 transition">
            <summary className="flex cursor-pointer items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
              <div className="flex items-center gap-2">
                <Clock className="size-3.5" />
                <span>View Full Course Timetable & Aid Station Cut-offs ({plan.splits.length - 1} stations)</span>
              </div>
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
            </summary>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs tabular-nums">
                <thead className="border-b border-white/8 text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-2 font-medium">Aid Station</th>
                    <th className="py-2 text-right font-medium">Distance</th>
                    <th className="py-2 text-right font-medium">Target Plan</th>
                    <th className="py-2 text-right font-medium">Cut-off Margin</th>
                    <th className="py-2 text-right font-medium">Shadow Rival</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  {plan.splits
                    .filter((s) => s.stationId !== "start")
                    .map((s) => (
                      <tr key={s.stationId} className="hover:bg-white/[0.02]">
                        <td className="py-2 font-medium text-foreground">{s.name}</td>
                        <td className="py-2 text-right text-muted-foreground">{s.km} km</td>
                        <td className="py-2 text-right font-medium text-emerald-400">
                          {fmtClock(s.planSec, false)}
                        </td>
                        <td
                          className={cn(
                            "py-2 text-right font-medium",
                            s.marginSec !== null && s.marginSec < 3600
                              ? "text-rose-400"
                              : "text-emerald-300"
                          )}
                        >
                          {s.marginSec !== null ? `${fmtHm(s.marginSec)} buffer` : "No limit"}
                        </td>
                        <td className="py-2 text-right text-purple-300">
                          {fmtClock(s.shadowSec, false)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {profile.patterns.length > 1 && (
              <div className="mt-5 border-t border-white/8 pt-4">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Secondary Tendencies Detected
                </span>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {profile.patterns.slice(1).map((p) => (
                    <div
                      key={p.id}
                      className="rounded-lg border border-white/6 bg-white/[0.02] p-2.5 text-xs"
                    >
                      <span className="font-semibold text-foreground">{p.title}</span>
                      <p className="mt-0.5 text-muted-foreground">{p.advice}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </details>

          {course.source?.note && (
            <p className="mt-4 text-center text-[11px] text-muted-foreground/60">
              {course.source.note}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
