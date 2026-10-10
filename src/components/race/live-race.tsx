"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Flag, Play } from "lucide-react";
import { course } from "@/lib/course";
import type { GoalId, Plan } from "@/lib/plan";
import type { RunnerProfile } from "@/lib/profile";
import { fmtClock, fmtDuration, fmtHm } from "@/lib/format";
import type { PartnerStatus } from "@/hooks/use-partner-status";
import { useListener, useSpeaker } from "@/hooks/use-voice";
import { useRaceEngine } from "@/hooks/use-race-engine";
import { Logo, PartnerPills } from "@/components/app-header";
import { RaceMapClient } from "@/components/race/race-map-client";
import { NextAidCard, PlayerBox, ShadowBox } from "@/components/race/battle-hud";
import { ElevationProfile } from "@/components/race/elevation-profile";
import { SimControls } from "@/components/race/sim-controls";
import { CoachPanel } from "@/components/race/coach-panel";
import { FinishDialog } from "@/components/race/finish-dialog";
import { BadgeIcon } from "@/components/sprites";
import { Button } from "@/components/ui/button";

export function LiveRace({
  profile,
  plan,
  goal,
  status,
  onExit,
}: {
  profile: RunnerProfile;
  plan: Plan;
  goal: GoalId;
  status: PartnerStatus | null;
  onExit: () => void;
}) {
  const gradium = Boolean(status?.gradium);
  const { speak, stop } = useSpeaker(gradium);
  const speaker = useMemo(() => ({ speak, stop }), [speak, stop]);
  const { engine, view } = useRaceEngine(profile, plan, goal, speaker);
  const listener = useListener(gradium, (text) => engine.ask(text));
  const [follow, setFollow] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.code === "Space") {
        e.preventDefault();
        engine.togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine]);

  const earned = view.badges.map((b) => b.climbId);

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/8 px-3 py-2 sm:px-4">
        <Button variant="ghost" size="sm" onClick={onExit} aria-label="Back to the plan">
          <ChevronLeft /> Plan
        </Button>
        <Logo className="hidden md:flex" />
        <div className="flex items-center gap-3 text-sm tabular-nums">
          <span className="font-semibold">{fmtClock(view.t)}</span>
          <span className="text-muted-foreground">{fmtDuration(view.t, true)}</span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <Flag className="size-3.5 text-primary" /> ETA <span className="font-semibold text-foreground">{fmtDuration(view.projectedFinishSec)}</span>
          </span>
        </div>
        <div className="hidden items-center gap-1 xl:flex" aria-label="Badges earned">
          {course.climbs.map((c) => (
            <BadgeIcon key={c.id} climbId={c.id} earned={earned.includes(c.id)} size={20} className={earned.includes(c.id) ? "animate-badge" : undefined} />
          ))}
        </div>
        <PartnerPills status={status} className="ml-auto" />
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_420px]">
        <main className="flex min-h-0 min-w-0 flex-col">
          <div className="relative h-[52vh] min-h-[340px] lg:h-auto lg:flex-1">
            <RaceMapClient getFrame={engine.getFrame} runnerD={view.d} shadowD={view.shadowD} follow={follow} onFollowChange={setFollow} />
            <ShadowBox view={view} profile={profile} plan={plan} className="absolute top-3 left-3 w-[min(19rem,calc(100%-4.5rem))]" />
            <div className="absolute right-3 bottom-3 left-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-end sm:justify-between">
              <NextAidCard view={view} className="sm:max-w-sm" />
              <PlayerBox view={view} profile={profile} className="sm:w-80" />
            </div>
            {!view.started && (
              <div className="absolute inset-0 z-10 grid place-items-center bg-black/50 p-4">
                <div className="rpg-box max-w-sm px-6 py-5 text-center">
                  <p className="text-xs text-muted-foreground">
                    {course.startLocal}
                    {course.location ? ` · ${course.location}` : ""}
                  </p>
                  <h2 className="mt-2 text-xl font-medium tracking-tight">{course.shortName}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Plan {fmtDuration(plan.timeline.finishSec)}. Shadow {fmtDuration(plan.shadow.finishSec)}.
                  </p>
                  <Button className="mt-4" onClick={() => engine.start()}>
                    <Play /> Start
                  </Button>
                  <p className="mt-3 text-xs text-muted-foreground">Space pauses. Click the profile to jump.</p>
                </div>
              </div>
            )}
          </div>
          <div className="border-t border-white/8 px-2 pt-1 sm:px-3">
            <ElevationProfile plan={plan} runnerD={view.d} shadowD={view.shadowD} planD={view.started ? view.planD : undefined} earned={earned} onSeek={(d) => engine.seek(d)} height={128} />
          </div>
          <div className="border-t border-white/8 px-3 py-2.5 sm:px-4">
            <SimControls view={view} engine={engine} />
          </div>
        </main>
        <aside className="flex min-h-0 flex-col border-t border-white/8 p-3 sm:p-4 lg:border-t-0 lg:border-l">
          <CoachPanel
            view={view}
            engine={engine}
            plan={plan}
            status={status}
            listen={listener.state}
            onMic={listener.toggle}
            micAvailable={listener.available}
            className="min-h-0 flex-1"
          />
          {view.finished && !view.showFinish && (
            <div className="mt-2 rounded-lg bg-you/10 px-3 py-2 text-sm text-you">
              Finished in {fmtHm(view.t)}. {view.badges.length} badges.
            </div>
          )}
        </aside>
      </div>

      <FinishDialog
        view={view}
        plan={plan}
        profile={profile}
        onClose={() => engine.closeFinish()}
        onRestart={() => engine.reset()}
        onBack={onExit}
      />
    </div>
  );
}
