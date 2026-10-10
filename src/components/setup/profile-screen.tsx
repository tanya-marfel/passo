"use client";

import { useMemo } from "react";
import { Play } from "lucide-react";
import { cn } from "cn";
import { course } from "@/lib/course";
import { buildPlan, type GoalId, type Plan } from "@/lib/plan";
import type { RunnerProfile } from "@/lib/profile";
import { fmtClock, fmtDuration, fmtHm } from "@/lib/format";
import type { PartnerStatus } from "@/hooks/use-partner-status";
import { AppHeader } from "@/components/app-header";
import { ElevationProfile } from "@/components/race/elevation-profile";
import { Button } from "@/components/ui/button";

const GOALS: { id: GoalId; label: string }[] = [
  { id: "safe", label: "Safe" },
  { id: "model", label: "Your data" },
  { id: "stretch", label: "Stretch" },
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
    () => Object.fromEntries(GOALS.map((g) => [g.id, buildPlan(profile, g.id).timeline.finishSec])) as Record<GoalId, number>,
    [profile],
  );
  const gap = plan.shadow.finishSec - plan.timeline.finishSec;
  const tight = plan.splits.filter((s) => s.marginSec !== null && s.stationId !== "finish").sort((a, b) => a.marginSec! - b.marginSec!)[0];
  const habit = profile.patterns[0];
  const limitH = Math.round(course.timeLimitSec / 3600);

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader status={status}>
        <button type="button" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={onChangeRace}>
          Different race
        </button>
        <button type="button" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={onNewData}>
          Start over
        </button>
      </AppHeader>
      <main className="mx-auto w-full max-w-xl flex-1 px-5 py-10 sm:px-6">
        <p className="text-sm text-muted-foreground">{course.startLocal}</p>
        <h1 className="mt-1 text-3xl font-medium tracking-tight">{course.shortName}</h1>
        <p className="mt-2 text-sm text-muted-foreground tabular-nums">
          {course.totalKm} km · {Math.round(course.officialGainM).toLocaleString("en-GB")} m · {limitH} h limit · {course.location}
        </p>

        <p className="mt-8 text-sm leading-relaxed">
          From {profile.activityCount} runs, a clean effort finishes around <span className="tabular-nums">{fmtDuration(plan.timeline.finishSec)}</span>. The shadow, with the mistakes in that history, takes{" "}
          <span className="tabular-nums">{fmtDuration(plan.shadow.finishSec)}</span>
          {gap > 60 ? `, about ${fmtHm(gap)} more` : ""}.
        </p>
        {habit && (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            <span className="text-foreground">{habit.title}.</span> {habit.advice}
          </p>
        )}
        {tight && tight.marginSec !== null && (
          <p className="mt-3 text-sm text-muted-foreground">
            Tightest cut-off is {tight.name}, {fmtHm(tight.marginSec)} in hand.
          </p>
        )}
        {plan.warnings.length > 0 && <p className="mt-3 text-sm text-amber-200/90">{plan.warnings[0]}</p>}

        <div className="mt-8 grid grid-cols-3 gap-2" role="radiogroup" aria-label="How hard to aim">
          {GOALS.map((g) => (
            <button
              key={g.id}
              type="button"
              role="radio"
              aria-checked={goal === g.id}
              onClick={() => onGoal(g.id)}
              className={cn("rounded-lg border px-3 py-2 text-left", goal === g.id ? "border-foreground/40" : "border-white/10")}
            >
              <div className="text-xs text-muted-foreground">{g.label}</div>
              <div className="mt-0.5 text-lg tabular-nums">{fmtDuration(finishes[g.id])}</div>
            </button>
          ))}
        </div>

        <Button className="mt-6" onClick={onStart}>
          <Play /> Simulate
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">Marmo speaks the calls. Space pauses. You can jump the course or talk back.</p>
        <p className="mt-6 text-xs text-muted-foreground">{course.source.note}</p>

        <details className="mt-8 text-sm">
          <summary className="cursor-pointer text-muted-foreground">Course and splits</summary>
          <div className="mt-4">
            <ElevationProfile plan={plan} height={120} />
          </div>
          <table className="mt-4 w-full text-xs tabular-nums">
            <thead className="text-muted-foreground">
              <tr className="text-left">
                <th className="py-1 font-medium">Station</th>
                <th className="py-1 text-right font-medium">Plan</th>
                <th className="py-1 text-right font-medium">Margin</th>
                <th className="py-1 text-right font-medium">Shadow</th>
              </tr>
            </thead>
            <tbody>
              {plan.splits
                .filter((s) => s.stationId !== "start")
                .map((s) => (
                  <tr key={s.stationId} className="border-t border-white/8">
                    <td className="py-1.5 pr-2">{s.name}</td>
                    <td className="py-1.5 text-right">{fmtClock(s.planSec, false)}</td>
                    <td className={cn("py-1.5 text-right", s.marginSec !== null && s.marginSec < 3600 ? "text-cutoff" : "text-muted-foreground")}>
                      {s.marginSec !== null ? fmtHm(s.marginSec) : ""}
                    </td>
                    <td className="py-1.5 text-right text-muted-foreground">{fmtClock(s.shadowSec, false)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {profile.patterns.length > 1 && (
            <ul className="mt-4 space-y-2 text-muted-foreground">
              {profile.patterns.slice(1).map((p) => (
                <li key={p.id}>
                  <span className="text-foreground">{p.title}.</span> {p.advice}
                </li>
              ))}
            </ul>
          )}
        </details>
      </main>
    </div>
  );
}
