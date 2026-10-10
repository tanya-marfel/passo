"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Flag, Moon, Mountain, Play, Sun, Trophy } from "lucide-react";
import { course } from "@/lib/course";
import type { GoalId, Plan } from "@/lib/plan";
import type { RunnerProfile } from "@/lib/profile";
import { fmtClock, fmtDuration, fmtHm } from "@/lib/format";
import { nightness } from "@/lib/live";
import type { PartnerStatus } from "@/hooks/use-partner-status";
import { useListener, useSpeaker } from "@/hooks/use-voice";
import { useRaceEngine } from "@/hooks/use-race-engine";
import { Logo, PartnerPills } from "@/components/app-header";
import { RaceMapClient } from "@/components/race/race-map-client";
import { BattleDuelHUD, NextAidCard } from "@/components/race/battle-hud";
import { ElevationProfile } from "@/components/race/elevation-profile";
import { SimControls } from "@/components/race/sim-controls";
import { CoachPanel } from "@/components/race/coach-panel";
import { FinishDialog } from "@/components/race/finish-dialog";
import { BadgeIcon, MarmoSprite, RunnerSprite, ShadowSprite } from "@/components/sprites";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
  // Unknown status still tries Gradium. Treating "not loaded yet" as off speaks the browser voice first.
  const gradium = status?.gradium !== false;
  const { speak, stop, pause, resume, unlock } = useSpeaker(gradium);
  const speaker = useMemo(() => ({ speak, stop, pause, resume, unlock }), [speak, stop, pause, resume, unlock]);
  const { engine, view } = useRaceEngine(profile, plan, goal, speaker);
  const listener = useListener(gradium, (text) => engine.ask(text));
  const [follow, setFollow] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.code !== "Space" || e.repeat) return;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      // A focused button already activates on Space. Handling it here too toggles twice, so Resume lands back on paused.
      if (el?.closest("button, a, select")) return;
      e.preventDefault();
      engine.togglePlay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine]);

  const earned = view.badges.map((b) => b.climbId);
  const isNight = nightness(view.t) > 0.5;

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      {/* Top Application Header */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white/8 bg-black/40 px-3 py-2 backdrop-blur-sm sm:px-4">
        {/* Left: Back & Race Info */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onExit}
            aria-label="Back to the plan"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            <span>Plan</span>
          </Button>
          <div className="h-4 w-px bg-white/10 hidden sm:block" />
          <Logo className="hidden md:flex text-xs font-semibold tracking-tight" />
          <span className="hidden lg:inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
            {course.shortName} · {course.totalKm} km
          </span>
        </div>

        {/* Center: Race Clock & Badges */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1 text-xs tabular-nums">
            {/* Day / Night Indicator */}
            {isNight ? (
              <Moon className="size-3.5 text-indigo-300" title="Night running (Headlamp on)" />
            ) : (
              <Sun className="size-3.5 text-amber-300" title="Daylight" />
            )}
            <span className="font-semibold text-foreground">{fmtClock(view.t)}</span>
            <span className="text-muted-foreground">({fmtDuration(view.t, true)})</span>
            <span className="h-3 w-px bg-white/10" />
            <span className="flex items-center gap-1 text-muted-foreground">
              <Flag className="size-3 text-primary" />
              <span className="hidden sm:inline">ETA</span>
              <span className="font-semibold text-foreground">{fmtDuration(view.projectedFinishSec)}</span>
            </span>
          </div>

          {/* Badges Progress Pill / List */}
          <div className="hidden xl:flex items-center gap-1" aria-label="Badges earned">
            {course.climbs.map((c) => {
              const won = earned.includes(c.id);
              return (
                <Tooltip key={c.id}>
                  <TooltipTrigger asChild>
                    <div className="cursor-help">
                      <BadgeIcon
                        climbId={c.id}
                        earned={won}
                        size={20}
                        className={won ? "animate-badge drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]" : "opacity-35"}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-muted-foreground">{won ? "Gym cleared!" : `Climb ahead · +${c.gain} m`}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          <div className="flex xl:hidden items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-muted-foreground">
            <Trophy className="size-3 text-amber-300" />
            <span>{earned.length}/{course.climbs.length}</span>
          </div>
        </div>

        {/* Right: Partner AI & Audio Status */}
        <PartnerPills status={status} className="ml-auto sm:ml-0" />
      </header>

      {/* Main Simulation Workspace Grid */}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* Left: 3D Map, Elevation Profile & Playback Controls */}
        <main className="flex min-h-0 min-w-0 flex-col">
          {/* Map Viewport with Telemetry Overlays */}
          <div className="relative h-[52vh] min-h-[340px] lg:h-auto lg:flex-1">
            <RaceMapClient
              getFrame={engine.getFrame}
              runnerD={view.d}
              shadowD={view.shadowD}
              follow={follow}
              onFollowChange={setFollow}
            />

            {/* Unified Top Telemetry Bar */}
            <BattleDuelHUD
              view={view}
              profile={profile}
              plan={plan}
              className="absolute top-3 left-3 w-[min(28rem,calc(100%-4.5rem))]"
            />

            {/* Next Aid Station Alert */}
            <div className="absolute left-3 bottom-3 z-10 max-w-sm">
              <NextAidCard view={view} />
            </div>

            {/* Pre-Race Briefing Card (shown before start) */}
            {!view.started && (
              <div className="absolute inset-0 z-20 grid place-items-center bg-black/60 p-4 backdrop-blur-sm animate-rise">
                <div className="rpg-box max-w-md w-full rounded-2xl border border-white/15 bg-black/85 px-6 py-6 text-center shadow-2xl">
                  <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                    <Mountain className="size-3.5" />
                    <span>{course.startLocal} · {course.location}</span>
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                    {course.shortName}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    {course.totalKm} km · {Math.round(course.officialGainM).toLocaleString("en-GB")} m ascent · 8 gym climbs
                  </p>

                  {/* Pokemon Trainer Matchup */}
                  <div className="my-3 flex items-center justify-center gap-4 rounded-xl border border-white/8 bg-white/[0.02] p-2.5">
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex size-13 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 shadow-lg">
                        <RunnerSprite height={34} />
                      </div>
                      <span className="text-[11px] font-semibold text-foreground">{profile.name?.trim() || "You"}</span>
                    </div>

                    <div className="flex flex-col items-center gap-0.5 px-1">
                      <MarmoSprite height={30} />
                      <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-amber-300">Coach</span>
                    </div>

                    <div className="flex flex-col items-center gap-1">
                      <div className="flex size-13 items-center justify-center rounded-xl border border-purple-500/30 bg-purple-500/10 shadow-lg">
                        <ShadowSprite height={34} />
                      </div>
                      <span className="text-[11px] font-semibold text-shadow">Shadow Rival</span>
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 text-left">
                    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-2.5">
                      <div className="text-[11px] text-muted-foreground">Planned Finish</div>
                      <div className="text-base font-semibold tabular-nums text-foreground">
                        {fmtDuration(plan.timeline.finishSec)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-2.5">
                      <div className="text-[11px] text-muted-foreground">Shadow Rival</div>
                      <div className="text-base font-semibold tabular-nums text-shadow">
                        {fmtDuration(plan.shadow.finishSec)}
                      </div>
                    </div>
                  </div>

                  <Button
                    size="lg"
                    className="mt-5 w-full font-medium shadow-md transition active:scale-[0.99]"
                    onClick={() => engine.start()}
                  >
                    <Play className="fill-current" />
                    <span>Start Race Simulation</span>
                  </Button>

                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Press <kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-[10px]">Space</kbd> anytime to pause · Click profile below to scrub
                  </p>

                  <div className="mt-3 border-t border-white/8 pt-2.5 text-[10px] text-muted-foreground/75">
                    <span className="font-medium text-foreground/90">Garmin Connect IQ Prototype</span> · Simulating the 48 km race digital twin so you can test Marmo&apos;s live agent calls without running the Dolomites today.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Interactive Elevation Profile */}
          <div className="border-t border-white/8 bg-black/20 px-3 py-2">
            <ElevationProfile
              plan={plan}
              runnerD={view.d}
              shadowD={view.shadowD}
              planD={view.started ? view.planD : undefined}
              earned={earned}
              onSeek={(d) => engine.seek(d)}
              height={120}
            />
          </div>

          {/* Simulation Controls Mission Bar */}
          <div className="border-t border-white/8 bg-black/40 px-3 py-2.5 sm:px-4">
            <SimControls view={view} engine={engine} />
          </div>
        </main>

        {/* Right Sidebar: AI Companion & Coach Panel */}
        <aside className="flex min-h-0 flex-col border-t border-white/8 bg-black/30 p-3 sm:p-4 lg:border-t-0 lg:border-l">
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
            <div className="mt-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-300 animate-rise">
              <span className="font-semibold">Race Finished!</span> Completed in {fmtHm(view.t)} with {view.badges.length}/{course.climbs.length} climb badges earned.
            </div>
          )}
        </aside>
      </div>

      {/* Race Finish Dialog Modal */}
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
