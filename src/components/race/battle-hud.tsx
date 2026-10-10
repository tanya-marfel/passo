"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  Cookie,
  Flag,
} from "lucide-react";
import { cn } from "cn";
import { course, TOTAL_M, climbAt, type AidStation } from "@/lib/course";
import type { Plan } from "@/lib/plan";
import type { RunnerProfile } from "@/lib/profile";
import type { RaceView } from "@/lib/engine";
import type { StatusId } from "@/lib/live";
import { fmtClock, fmtDuration, fmtHm } from "@/lib/format";
import { StationBadge } from "@/components/race/station-pin";
import { RunnerSprite, ShadowSprite } from "@/components/sprites";

const STATUS: Record<StatusId, { label: string; className: string; bg: string }> = {
  cramp: { label: "Cramp", className: "text-red-300", bg: "bg-red-500/15 border-red-500/30" },
  storm: { label: "Storm", className: "text-sky-300", bg: "bg-sky-500/15 border-sky-500/30" },
  drowsy: { label: "Drowsy", className: "text-indigo-200", bg: "bg-indigo-500/15 border-indigo-500/30" },
  bonk: { label: "Empty Tank", className: "text-red-300", bg: "bg-red-500/15 border-red-500/30" },
  caffeine: { label: "Caffeine", className: "text-amber-200", bg: "bg-amber-500/15 border-amber-500/30" },
  resting: { label: "At Aid Station", className: "text-emerald-200", bg: "bg-emerald-500/15 border-emerald-500/30" },
};

export function hpColor(hp: number) {
  return hp > 50 ? "oklch(0.85 0.16 142)" : hp > 25 ? "oklch(0.78 0.14 75)" : "oklch(0.66 0.2 28)";
}

export function HpBar({ hp, className }: { hp: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, hp));
  const color = hpColor(clamped);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-[11px] font-medium text-muted-foreground">Energy</span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/10 ring-1 ring-white/10">
        <div
          className="h-full rounded-full transition-all duration-400 ease-out"
          style={{ width: `${clamped}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-8 text-right text-[11px] font-semibold tabular-nums" style={{ color }}>
        {Math.round(clamped)}%
      </span>
    </div>
  );
}

function trainerName(profile: RunnerProfile) {
  const n = profile.name.trim();
  return !n || n.toLowerCase() === "you" ? "You" : n.slice(0, 18);
}

function gapText(gapSec: number) {
  const a = Math.abs(gapSec);
  if (a < 60) return "Side by side";
  return gapSec > 0 ? `${fmtHm(a)} ahead of shadow` : `${fmtHm(a)} behind shadow`;
}

/**
 * Unified Battle Duel HUD combining the runner's telemetry and the shadow rival's status
 * into a single, clean glassmorphic card on the map.
 */
export function BattleDuelHUD({
  view,
  profile,
  plan,
  className,
}: {
  view: RaceView;
  profile: RunnerProfile;
  plan: Plan;
  className?: string;
}) {
  const [minimized, setMinimized] = useState(false);
  const climb = climbAt(view.d);
  const behind = view.planDeltaSec > 60;
  const ahead = view.planDeltaSec < -60;

  const shadowKm = view.shadowD / 1000;
  const move = [...plan.shadowMoves].reverse().find((m) => m.km <= shadowKm && shadowKm - m.km < 4);
  const shadowLeading = view.shadowGapSec < -60;
  const runnerKm = view.d / 1000;
  const totalKm = TOTAL_M / 1000;
  const progressPct = Math.min(100, (view.d / TOTAL_M) * 100);

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className={cn(
          "hud-box group flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground/90 transition hover:border-white/30",
          className,
        )}
        aria-label="Expand race telemetry"
      >
        <div className="flex items-center -space-x-1.5 shrink-0">
          <div className="flex size-5 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/20 overflow-hidden">
            <RunnerSprite height={16} />
          </div>
          <div className="flex size-5 items-center justify-center rounded-full border border-purple-500/40 bg-purple-500/20 overflow-hidden">
            <ShadowSprite height={16} />
          </div>
        </div>
        <span className="font-semibold tabular-nums">km {runnerKm.toFixed(1)}</span>
        <span className="text-muted-foreground">·</span>
        <span className={shadowLeading ? "text-shadow" : "text-emerald-300"}>
          {view.started ? gapText(view.shadowGapSec) : "At start"}
        </span>
        <ChevronDown className="size-3 text-muted-foreground transition group-hover:text-foreground" />
      </button>
    );
  }

  return (
    <div
      className={cn(
        "hud-box rounded-xl border border-white/12 bg-black/75 p-3 shadow-2xl backdrop-blur-md transition-all sm:p-3.5",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 overflow-hidden shrink-0 shadow-inner">
            <RunnerSprite height={22} />
          </div>
          <span className="text-xs font-semibold tracking-tight text-foreground">{trainerName(profile)}</span>
          <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest px-0.5">vs</span>
          <div className="flex items-center gap-1.5 text-xs text-shadow">
            <div className="flex size-7 items-center justify-center rounded-lg border border-purple-500/30 bg-purple-500/10 overflow-hidden shrink-0 shadow-inner">
              <ShadowSprite height={22} />
            </div>
            <span className="font-semibold">Shadow Rival</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10.5px] font-semibold tabular-nums tracking-wide uppercase",
              shadowLeading ? "bg-purple-500/20 text-purple-300" : "bg-emerald-500/20 text-emerald-300",
            )}
          >
            {view.started ? gapText(view.shadowGapSec) : "At the start line"}
          </span>
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="rounded p-0.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
            aria-label="Minimize telemetry HUD"
            title="Minimize HUD"
          >
            <ChevronUp className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {/* Runner Column */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium tabular-nums text-foreground">
              km {runnerKm.toFixed(1)} <span className="text-muted-foreground">/ {totalKm.toFixed(0)}</span>
              <span className="ml-1 text-[10px] text-muted-foreground/80">({progressPct.toFixed(0)}%)</span>
            </span>
          </div>
          <HpBar hp={view.hp} />
          <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Cookie className="size-3 text-amber-300" />
              <span className="tabular-nums font-medium text-foreground">{view.gels}</span> gels
            </span>
            <span
              className={cn(
                "tabular-nums font-medium",
                behind ? "text-amber-300" : ahead ? "text-emerald-300" : "text-muted-foreground",
              )}
            >
              {Math.abs(view.planDeltaSec) < 60
                ? "On plan pace"
                : `${fmtHm(Math.abs(view.planDeltaSec))} ${behind ? "behind" : "ahead of"} plan`}
            </span>
          </div>
        </div>

        {/* Rival Column */}
        <div className="space-y-1.5 rounded-lg border border-white/5 bg-white/[0.02] p-2 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Shadow Position</span>
            <span className="font-medium tabular-nums text-shadow">km {shadowKm.toFixed(1)}</span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            {move ? (
              <span className="flex items-center gap-1 truncate">
                <span className="rounded bg-purple-500/15 px-1 py-0.2 text-[10px] font-medium text-purple-300">
                  {move.move}
                </span>
                <span className="truncate">pattern active</span>
              </span>
            ) : (
              <span className="truncate text-muted-foreground/80">Running your historical baseline</span>
            )}
          </div>
          {climb && (
            <div className="flex items-center gap-1 truncate text-[10.5px] text-gym">
              <Compass className="size-3 shrink-0" />
              <span className="truncate">{climb.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Status Tags */}
      {view.status.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-white/8 pt-2">
          {view.status.map((s) => (
            <span
              key={s}
              className={cn("rounded-md border px-2 py-0.5 text-[10.5px] font-medium", STATUS[s].bg, STATUS[s].className)}
            >
              {STATUS[s].label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ShadowBox({
  view,
  profile,
  plan,
  className,
}: {
  view: RaceView;
  profile: RunnerProfile;
  plan: Plan;
  className?: string;
}) {
  const km = view.shadowD / 1000;
  const move = [...plan.shadowMoves].reverse().find((m) => m.km <= km && km - m.km < 4);
  const ahead = view.shadowGapSec < -60;
  return (
    <div className={cn("hud-box rounded-xl border border-white/12 bg-black/75 p-3 shadow-xl backdrop-blur-md", className)}>
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-shadow">
            <div className="flex size-5 items-center justify-center rounded-md border border-purple-500/30 bg-purple-500/10 overflow-hidden shrink-0 shadow-inner">
              <ShadowSprite height={16} />
            </div>
            Shadow · {trainerName(profile)}
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums">km {km.toFixed(1)}</span>
        </div>
        <div className={cn("mt-1 text-sm font-semibold tabular-nums", ahead ? "text-shadow" : "text-emerald-300")}>
          {view.started ? gapText(view.shadowGapSec) : "Waiting at the start"}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {move ? (
            <>
              used <span className="font-medium text-shadow">{move.move}</span> · km {km.toFixed(1)}
            </>
          ) : (
            <>Running historical baseline</>
          )}
        </div>
      </div>
    </div>
  );
}

export function PlayerBox({
  view,
  profile,
  className,
}: {
  view: RaceView;
  profile: RunnerProfile;
  className?: string;
}) {
  const climb = climbAt(view.d);
  const behind = view.planDeltaSec > 60;
  const ahead = view.planDeltaSec < -60;
  return (
    <div className={cn("hud-box rounded-xl border border-white/12 bg-black/75 p-3 shadow-xl backdrop-blur-md", className)}>
      <div>
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <div className="flex size-5 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10 overflow-hidden shrink-0 shadow-inner">
                <RunnerSprite height={16} />
              </div>
              {trainerName(profile)}
            </span>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              km <span className="font-semibold text-foreground">{(view.d / 1000).toFixed(1)}</span> / {(TOTAL_M / 1000).toFixed(1)}
            </span>
          </div>
          <HpBar hp={view.hp} className="mt-1.5" />
          <div className="mt-1.5 flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
            <span className="flex items-center gap-1">
              <Cookie className="size-3 text-amber-300" />
              <span>{view.gels} gels</span>
            </span>
            <span className={cn("font-medium", behind ? "text-amber-300" : ahead ? "text-emerald-300" : "text-muted-foreground")}>
              {Math.abs(view.planDeltaSec) < 60 ? "On plan" : `${fmtHm(Math.abs(view.planDeltaSec))} ${behind ? "behind" : "ahead"}`}
            </span>
          </div>
        </div>
      </div>
      {(climb || view.status.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-white/8 pt-1.5">
          {climb && <span className="text-[11px] text-gym font-medium truncate">{climb.name}</span>}
          {view.status.map((s) => (
            <span key={s} className={cn("rounded border px-1.5 py-0.2 text-[10px]", STATUS[s].bg, STATUS[s].className)}>
              {STATUS[s].label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function RaceClock({ view, className }: { view: RaceView; className?: string }) {
  return (
    <div className={cn("hud-box flex items-center gap-3 rounded-lg px-3 py-1.5 text-xs tabular-nums backdrop-blur-md", className)}>
      <span className="flex items-center gap-1">
        <Clock className="size-3.5 text-primary" />
        <span className="font-semibold">{fmtClock(view.t)}</span>
      </span>
      <span className="text-muted-foreground">{fmtDuration(view.t, true)} elapsed</span>
      <span className="flex items-center gap-1">
        <Flag className="size-3.5 text-primary" /> ETA <span className="font-semibold">{fmtDuration(view.projectedFinishSec)}</span>
      </span>
    </div>
  );
}

export function NextAidCard({ view, className }: { view: RaceView; className?: string }) {
  const [minimized, setMinimized] = useState(false);
  const st: AidStation | undefined = course.aidStations.find(
    (s) => s.km * 1000 > view.d + 1 && s.kind !== "checkpoint" && s.kind !== "start",
  );
  if (!st) return null;

  const eta = view.arrivals[st.id];
  const margin = st.cutoffSec !== null && eta !== undefined ? st.cutoffSec - eta : null;
  const distKm = ((st.km * 1000 - view.d) / 1000).toFixed(1);

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className={cn(
          "hud-box group flex items-center gap-2 rounded-lg border border-white/12 bg-black/75 px-2.5 py-1.5 text-xs shadow-lg backdrop-blur-md transition hover:border-white/30",
          className,
        )}
        aria-label="Expand next aid station details"
      >
        <StationBadge kind={st.kind} className="size-4 [&_svg]:size-2.5" />
        <span className="font-medium text-foreground">{st.kind === "finish" ? "Finish" : st.name}</span>
        <span className="text-muted-foreground tabular-nums">in {distKm} km</span>
        <ChevronUp className="size-3 text-muted-foreground transition group-hover:text-foreground" />
      </button>
    );
  }

  return (
    <div
      className={cn(
        "hud-box flex items-center gap-3 rounded-xl border border-white/12 bg-black/75 px-3 py-2.5 text-xs shadow-xl backdrop-blur-md",
        className,
      )}
    >
      <StationBadge kind={st.kind} className="size-7 [&_svg]:size-4" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-semibold text-foreground">
            {st.kind === "finish" ? "Finish line" : st.name}
          </span>
          <span className="text-[11px] font-medium text-muted-foreground tabular-nums">in {distKm} km</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground tabular-nums">
          {eta !== undefined && <span>ETA {fmtClock(eta)}</span>}
          {st.cutoff && (
            <span
              className={cn(
                "rounded px-1 py-0.2 font-medium",
                margin !== null && margin < 1800
                  ? "bg-red-500/20 text-red-300"
                  : margin !== null && margin < 3600
                    ? "bg-amber-500/20 text-amber-300"
                    : "bg-emerald-500/20 text-emerald-300",
              )}
            >
              cut-off {st.cutoff.replace(/^\w+ /, "")}
              {margin !== null && ` · ${margin >= 0 ? `${fmtHm(margin)} margin` : `${fmtHm(-margin)} late`}`}
            </span>
          )}
          {!st.cutoff && st.services.length > 0 && <span>{st.services.join(", ")}</span>}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setMinimized(true)}
        className="rounded p-0.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
        aria-label="Minimize next station card"
        title="Minimize"
      >
        <ChevronDown className="size-3.5" />
      </button>
    </div>
  );
}
