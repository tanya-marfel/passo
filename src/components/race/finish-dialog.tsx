"use client";

import { RotateCcw, Undo2 } from "lucide-react";
import { course } from "@/lib/course";
import type { Plan } from "@/lib/plan";
import type { RunnerProfile } from "@/lib/profile";
import type { RaceView } from "@/lib/engine";
import { fmtDuration, fmtHm } from "@/lib/format";
import { BadgeIcon } from "@/components/sprites";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  if (has("fast_start") && view.coachedStart) stopped.push("Fast Start: you let the Shadow sprint off and held your pace");
  if (has("climb_overreach") && view.coachedClimbs.length) stopped.push(`Reckless Climb: paced ${view.coachedClimbs.length} of ${course.climbs.length} gyms from the bottom`);
  if (has("fuel_fade")) stopped.push(`Empty Tank: ${view.gels} gels on schedule instead of skipping`);
  if (has("aid_linger")) stopped.push("Aid Camp: in and out of the aid stations with a plan");
  return (
    <Dialog open={view.showFinish} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="text-center sm:text-center">
          <DialogTitle className="text-lg font-medium">Finished</DialogTitle>
          <DialogDescription>
            Cortina · {course.totalKm} km · {fmtHm(view.t)}
          </DialogDescription>
        </DialogHeader>
        <div className="text-center">
          <div className="text-5xl font-semibold tracking-tight tabular-nums">{fmtDuration(view.t)}</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-white/5 px-3 py-2">
              <div className="text-xs text-muted-foreground">vs your plan {fmtDuration(plan.timeline.finishSec)}</div>
              <div className={vsPlan <= 0 ? "font-semibold text-you" : "font-semibold text-amber-300"}>
                {Math.abs(vsPlan) < 60 ? "Spot on" : `${fmtHm(Math.abs(vsPlan))} ${vsPlan < 0 ? "faster" : "slower"}`}
              </div>
            </div>
            <div className="rounded-lg bg-white/5 px-3 py-2">
              <div className="text-xs text-muted-foreground">vs your Shadow {fmtDuration(plan.shadow.finishSec)}</div>
              <div className={vsShadow >= 0 ? "font-semibold text-you" : "font-semibold text-shadow"}>
                {vsShadow >= 0 ? `Beat it by ${fmtHm(vsShadow)}` : `Lost by ${fmtHm(-vsShadow)}`}
              </div>
            </div>
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs text-muted-foreground">
            Climbs {view.badges.length}/{course.climbs.length}
          </div>
          <div className="grid grid-cols-8 gap-1.5">
            {course.climbs.map((c, i) => {
              const won = view.badges.some((b) => b.climbId === c.id);
              return (
                <div key={c.id} className="flex flex-col items-center gap-1" title={`${c.badge} · ${c.name}`}>
                  <BadgeIcon climbId={c.id} earned={won} size={32} className={won ? "animate-badge" : undefined} />
                  <span className="text-[9px] text-muted-foreground">G{i + 1}</span>
                </div>
              );
            })}
          </div>
        </div>
        {stopped.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-1.5 text-xs text-muted-foreground">What held</div>
            <ul className="space-y-1 text-sm">
              {stopped.map((s) => (
                <li key={s} className="flex gap-2">
                  <span className="text-you">✓</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}
        <DialogFooter className="gap-2 sm:justify-center">
          <Button variant="secondary" onClick={onBack}>
            <Undo2 /> Back to the plan
          </Button>
          <Button onClick={onRestart}>
            <RotateCcw /> Race again
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
