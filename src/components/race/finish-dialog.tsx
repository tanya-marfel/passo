"use client";

import { RotateCcw, Trophy, Undo2 } from "lucide-react";
import { course } from "@/lib/course";
import type { Plan } from "@/lib/plan";
import type { RunnerProfile } from "@/lib/profile";
import type { RaceView } from "@/lib/engine";
import { fmtDuration, fmtHm } from "@/lib/format";
import { BadgeIcon } from "@/components/sprites";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function FinishDialog({
  view,
  plan,
  profile,
  onClose,
  onRestart,
  onBack,
}: {
  view: RaceView;
  plan: Plan;
  profile: RunnerProfile;
  onClose: () => void;
  onRestart: () => void;
  onBack: () => void;
}) {
  const vsPlan = view.t - plan.timeline.finishSec;
  const vsShadow = plan.shadow.finishSec - view.t;
  const has = (id: string) => profile.patterns.some((p) => p.id === id);
  const stopped: string[] = [];
  if (has("fast_start") && view.coachedStart)
    stopped.push("Fast Start: You let the Shadow sprint off and held your target pace.");
  if (has("climb_overreach") && view.coachedClimbs.length)
    stopped.push(`Reckless Climb: Paced ${view.coachedClimbs.length} of ${course.climbs.length} gym climbs cleanly from the base.`);
  if (has("fuel_fade"))
    stopped.push(`Empty Tank: Consumed ${view.gels} gels on schedule instead of skipping nutrition.`);
  if (has("aid_linger"))
    stopped.push("Aid Camp: In and out of the aid stations with purpose and plan.");

  const beatShadow = vsShadow >= 0;

  return (
    <Dialog open={view.showFinish} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg border border-white/15 bg-black/90 backdrop-blur-xl">
        <DialogHeader className="text-center sm:text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-amber-400/10 text-amber-300 mb-2">
            <Trophy className="size-6" />
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
            Race Completed!
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {course.shortName} · {course.totalKm} km · Cortina d'Ampezzo
          </DialogDescription>
        </DialogHeader>

        {/* Big Finish Time */}
        <div className="text-center py-2">
          <div className="text-5xl font-extrabold tracking-tight tabular-nums text-foreground">
            {fmtDuration(view.t)}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Official Simulation Time</p>

          <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-left">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[11px] text-muted-foreground">vs Planned Goal ({fmtDuration(plan.timeline.finishSec)})</div>
              <div className={vsPlan <= 0 ? "mt-0.5 font-bold text-emerald-400" : "mt-0.5 font-bold text-amber-300"}>
                {Math.abs(vsPlan) < 60 ? "Spot on target" : `${fmtHm(Math.abs(vsPlan))} ${vsPlan < 0 ? "faster" : "slower"}`}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[11px] text-muted-foreground">vs Shadow Rival ({fmtDuration(plan.shadow.finishSec)})</div>
              <div className={beatShadow ? "mt-0.5 font-bold text-emerald-400" : "mt-0.5 font-bold text-purple-300"}>
                {beatShadow ? `Beat it by ${fmtHm(vsShadow)}` : `Lost by ${fmtHm(-vsShadow)}`}
              </div>
            </div>
          </div>
        </div>

        {/* Climbs Conquered */}
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Gym Climbs Conquered</span>
            <span>{view.badges.length} of {course.climbs.length} cleared</span>
          </div>
          <div className="grid grid-cols-8 gap-2">
            {course.climbs.map((c, i) => {
              const won = view.badges.some((b) => b.climbId === c.id);
              return (
                <div
                  key={c.id}
                  className="flex flex-col items-center gap-1"
                  title={`${c.badge} · ${c.name} (${won ? "Cleared" : "Missed"})`}
                >
                  <BadgeIcon
                    climbId={c.id}
                    earned={won}
                    size={28}
                    className={won ? "animate-badge drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" : "opacity-30"}
                  />
                  <span className="text-[9px] text-muted-foreground tabular-nums">G{i + 1}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Coached Improvements */}
        {stopped.length > 0 && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3">
            <div className="mb-1.5 text-xs font-semibold text-emerald-300">Habits You Overcame with Marmo</div>
            <ul className="space-y-1 text-xs">
              {stopped.map((s) => (
                <li key={s} className="flex items-start gap-2 text-foreground/90 leading-snug">
                  <span className="text-emerald-400 font-bold shrink-0">✓</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-center pt-2">
          <Button variant="outline" onClick={onBack} className="border-white/10">
            <Undo2 className="size-4" />
            <span>Back to Plan</span>
          </Button>
          <Button onClick={onRestart}>
            <RotateCcw className="size-4" />
            <span>Race Again</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
