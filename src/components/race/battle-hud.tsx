import { Clock, Flag, Gauge } from "lucide-react";
import { cn } from "cn";
import { course, TOTAL_M, climbAt, type AidStation } from "@/lib/course";
import type { Plan } from "@/lib/plan";
import type { RunnerProfile } from "@/lib/profile";
import type { RaceView } from "@/lib/engine";
import type { StatusId } from "@/lib/live";
import { fmtClock, fmtDuration, fmtHm } from "@/lib/format";
import { ShadowSprite, RunnerSprite } from "@/components/sprites";
import { StationBadge } from "@/components/race/station-pin";

const STATUS: Record<StatusId, { label: string; className: string }> = {
  cramp: { label: "CRAMP", className: "bg-red-500/90 text-white" },
  storm: { label: "STORM", className: "bg-sky-500/90 text-white" },
  drowsy: { label: "DROWSY", className: "bg-indigo-500/90 text-white" },
  bonk: { label: "BONK", className: "bg-red-600 text-white" },
  caffeine: { label: "CAFFEINE", className: "bg-amber-400 text-slate-950" },
  resting: { label: "AT AID", className: "bg-slate-200 text-slate-900" },
};

export function hpColor(hp: number) {
  return hp > 50 ? "#34d399" : hp > 25 ? "#fbbf24" : "#f87171";
}

export function HpBar({ hp, className }: { hp: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <span className="font-pixel text-[8px] text-amber-300">HP</span>
      <div className="hp-track h-3 flex-1">
        <div className="hp-fill" style={{ width: `${Math.max(0, Math.min(100, hp))}%`, backgroundColor: hpColor(hp) }} />
      </div>
    </div>
  );
}

function trainerName(profile: RunnerProfile) {
  const n = profile.name.trim();
  return !n || n.toLowerCase() === "you" ? "YOU" : n.toUpperCase().slice(0, 12);
}

function gapText(gapSec: number) {
  const a = Math.abs(gapSec);
  if (a < 60) return "Side by side";
  return gapSec > 0 ? `${fmtHm(a)} behind you` : `${fmtHm(a)} ahead of you`;
}

export function ShadowBox({ view, profile, plan, className }: { view: RaceView; profile: RunnerProfile; plan: Plan; className?: string }) {
  const km = view.shadowD / 1000;
  const move = [...plan.shadowMoves].reverse().find((m) => m.km <= km && km - m.km < 4);
  const ahead = view.shadowGapSec < -60;
  return (
    <div className={cn("hud-box flex items-center gap-3 px-3 py-2", className)}>
      <ShadowSprite height={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-pixel truncate text-[9px] text-shadow">SHADOW {trainerName(profile)}</span>
          <span className="font-pixel text-[8px] text-muted-foreground">Lv{profile.level}</span>
        </div>
        <div className={cn("mt-1 text-sm font-semibold tabular-nums", ahead ? "text-shadow" : "text-you")}>
          {view.started ? gapText(view.shadowGapSec) : "Waiting at the start"}
        </div>
        <div className="truncate text-[11px] text-muted-foreground">
          {move ? (
            <>
              used <span className="font-medium text-shadow">{move.move}</span> · km {km.toFixed(1)}
            </>
          ) : (
            <>Your usual mistakes · km {km.toFixed(1)}</>
          )}
        </div>
      </div>
    </div>
  );
}

export function PlayerBox({ view, profile, className }: { view: RaceView; profile: RunnerProfile; className?: string }) {
  const climb = climbAt(view.d);
  const behind = view.planDeltaSec > 60;
  const ahead = view.planDeltaSec < -60;
  return (
    <div className={cn("hud-box px-3 py-2", className)}>
      <div className="flex items-center gap-3">
        <RunnerSprite height={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-pixel truncate text-[9px] text-you">{trainerName(profile)}</span>
            <span className="font-pixel text-[8px] text-muted-foreground">Lv{profile.level}</span>
          </div>
          <HpBar hp={view.hp} className="mt-1.5" />
          <div className="mt-1 flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
            <span>
              {Math.round(view.hp)}/100 · {view.gels} gels
            </span>
            <span>
              km <span className="font-semibold text-foreground">{(view.d / 1000).toFixed(1)}</span> / {(TOTAL_M / 1000).toFixed(1)}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {climb && <span className="font-pixel rounded bg-gym px-1.5 py-0.5 text-[7px] text-slate-950">GYM: {climb.name.toUpperCase()}</span>}
        {view.status.map((s) => (
          <span key={s} className={cn("font-pixel rounded px-1.5 py-0.5 text-[7px]", STATUS[s].className)}>
            {STATUS[s].label}
          </span>
        ))}
        <span className={cn("ml-auto text-[11px] font-medium tabular-nums", behind ? "text-amber-300" : ahead ? "text-you" : "text-muted-foreground")}>
          {Math.abs(view.planDeltaSec) < 60 ? "On plan" : `${fmtHm(Math.abs(view.planDeltaSec))} ${behind ? "behind" : "ahead of"} plan`}
        </span>
      </div>
    </div>
  );
}

export function RaceClock({ view, className }: { view: RaceView; className?: string }) {
  return (
    <div className={cn("hud-box flex items-center gap-3 px-3 py-1.5 text-xs tabular-nums", className)}>
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
  const st: AidStation | undefined = course.aidStations.find((s) => s.km * 1000 > view.d + 1 && s.kind !== "checkpoint" && s.kind !== "start");
  if (!st) return null;
  const eta = view.arrivals[st.id];
  const margin = st.cutoffSec !== null && eta !== undefined ? st.cutoffSec - eta : null;
  return (
    <div className={cn("hud-box flex items-center gap-2.5 px-3 py-2 text-xs", className)}>
      <StationBadge kind={st.kind} className="size-6 [&_svg]:size-3.5" />
      <div className="min-w-0">
        <div className="truncate font-semibold">
          {st.kind === "finish" ? "Finish line" : st.name} <span className="font-normal text-muted-foreground">in {((st.km * 1000 - view.d) / 1000).toFixed(1)} km</span>
        </div>
        <div className="flex flex-wrap gap-x-2 text-muted-foreground tabular-nums">
          {eta !== undefined && <span>ETA {fmtClock(eta)}</span>}
          {st.cutoff && (
            <span className={cn(margin !== null && margin < 30 * 60 ? "text-cutoff" : "text-muted-foreground")}>
              cut-off {st.cutoff.replace(/^\w+ /, "")}
              {margin !== null && ` · ${margin >= 0 ? `${fmtHm(margin)} margin` : `${fmtHm(-margin)} late`}`}
            </span>
          )}
          {!st.cutoff && st.services.length > 0 && <span>{st.services.join(", ")}</span>}
        </div>
      </div>
      <Gauge className="ml-auto hidden size-4 text-muted-foreground sm:block" />
    </div>
  );
}
