"use client";

import { useMemo } from "react";
import { Play, RotateCcw } from "lucide-react";
import { cn } from "cn";
import { course } from "@/lib/course";
import { buildPlan, type GoalId, type Plan } from "@/lib/plan";
import type { RunnerProfile, TrainerStats } from "@/lib/profile";
import { fmtClock, fmtDuration, fmtHm } from "@/lib/format";
import type { PartnerStatus } from "@/hooks/use-partner-status";
import { AppHeader } from "@/components/app-header";
import { ElevationProfile } from "@/components/race/elevation-profile";
import { StationBadge } from "@/components/race/station-pin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const STATS: [keyof TrainerStats, string][] = [
  ["speed", "Speed"],
  ["climb", "Climb"],
  ["descent", "Descent"],
  ["stamina", "Stamina"],
  ["resilience", "Grit"],
  ["night", "Night"],
];

const GOALS: { id: GoalId; label: string; blurb: string }[] = [
  { id: "safe", label: "Safe", blurb: "Big cut-off margins" },
  { id: "model", label: "Your data", blurb: "What your runs predict" },
  { id: "stretch", label: "Stretch", blurb: "Everything goes right" },
];

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { month: "short", year: "numeric" });

function StatBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr_1.75rem] items-center gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="h-px bg-white/15">
        <div className="h-px bg-foreground/70" style={{ width: `${value}%` }} />
      </div>
      <span className="text-right text-xs text-muted-foreground tabular-nums">{value}</span>
    </div>
  );
}

function TrainerCard({ profile, onRename }: { profile: RunnerProfile; onRename: (name: string) => void }) {
  const t = profile.totals;
  const longest = [...profile.activities].sort((a, b) => b.hours - a.hours).slice(0, 4);
  return (
    <Card className="gap-4">
      <CardHeader>
        <div className="text-xs text-muted-foreground">You</div>
        <div className="mt-2 flex items-center gap-3">
          <Input name="runner-name" autoComplete="nickname" value={profile.name} onChange={(e) => onRename(e.target.value)} className="h-8 max-w-52 text-base" aria-label="Your name" maxLength={20} />
          <span className="text-sm text-muted-foreground">Level {profile.level}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {profile.type.name}. {profile.type.blurb}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-xs text-muted-foreground">
          {profile.source === "sample" ? "Sample history" : profile.source === "garmin-connect" ? "Synced from Garmin Connect" : "Garmin history"}: {profile.activityCount} runs · {fmtDate(profile.dateRange.from)} to {fmtDate(profile.dateRange.to)} ·{" "}
          {Math.round(t.km).toLocaleString("en-GB")} km · {Math.round(t.gain).toLocaleString("en-GB")} m up · {Math.round(t.hours)} h
        </div>
        <div className="space-y-1.5">
          {STATS.map(([k, label]) => (
            <StatBar key={k} label={label} value={profile.stats[k]} />
          ))}
        </div>
        <ul className="space-y-1 text-sm text-muted-foreground">
          {profile.highlights.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
        {longest.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Longest runs analysed</summary>
            <table className="mt-2 w-full tabular-nums">
              <tbody>
                {longest.map((a) => (
                  <tr key={a.id} className="border-t border-white/5">
                    <td className="max-w-40 truncate py-1 pr-2">{a.name}</td>
                    <td className="py-1 text-right text-muted-foreground">{a.km.toFixed(1)} km</td>
                    <td className="py-1 text-right text-muted-foreground">{fmtDuration(a.hours * 3600)}</td>
                    <td className="py-1 text-right text-muted-foreground">{Math.round(a.gain)} m</td>
                    <td className="py-1 text-right">{a.fadePct !== null ? <span className={a.fadePct > 8 ? "text-amber-300" : "text-you"}>fade {Math.round(a.fadePct)}%</span> : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function ShadowMoves({ profile }: { profile: RunnerProfile }) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle>Habits</CardTitle>
        <p className="text-sm text-muted-foreground">The shadow runs these the way your history usually does.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {profile.patterns.length === 0 && <p className="text-sm text-muted-foreground">No clear pattern. The shadow follows the plan, a little slower.</p>}
        {profile.patterns.map((p) => (
          <div key={p.id} className="border-t border-white/8 pt-3 first:border-0 first:pt-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-sm font-medium">{p.title}</span>
              <Badge variant="outline" className="ml-auto text-[10px] font-normal">
                {p.confidence === "data" ? "From your runs" : "Assumption"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{p.evidence}</p>
            <p className="mt-1 text-sm">{p.advice}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RaceCard({ profile, plan, goal, onGoal, onStart }: { profile: RunnerProfile; plan: Plan; goal: GoalId; onGoal: (g: GoalId) => void; onStart: () => void }) {
  const finishes = useMemo(
    () => Object.fromEntries(GOALS.map((g) => [g.id, buildPlan(profile, g.id).timeline.finishSec])) as Record<GoalId, number>,
    [profile],
  );
  const tightest = plan.splits.filter((s) => s.marginSec !== null && s.stationId !== "finish").reduce((m, s) => Math.min(m, s.marginSec!), Infinity);
  const gap = plan.shadow.finishSec - plan.timeline.finishSec;
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-xl font-medium tracking-tight">{course.name}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {course.startLocal} · {course.location} · {course.totalKm} km · {course.trackGainM.toLocaleString("en-GB")} m up (GPS) · 30 h limit
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Race goal">
          {GOALS.map((g) => (
            <button
              key={g.id}
              type="button"
              role="radio"
              aria-checked={goal === g.id}
              onClick={() => onGoal(g.id)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left transition",
                goal === g.id ? "border-foreground/40 bg-white/[0.04]" : "border-white/10 hover:border-white/20",
              )}
            >
              <div className="text-xs text-muted-foreground">{g.label}</div>
              <div className="text-lg font-semibold tabular-nums">{fmtDuration(finishes[g.id])}</div>
              <div className="text-[11px] text-muted-foreground">{g.blurb}</div>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg bg-you/10 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Your plan</div>
            <div className="font-semibold text-you tabular-nums">{fmtDuration(plan.timeline.finishSec)}</div>
          </div>
          <div className="rounded-lg bg-shadow/10 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Your Shadow</div>
            <div className="font-semibold text-shadow tabular-nums">{fmtDuration(plan.shadow.finishSec)}</div>
          </div>
          <div className="rounded-lg bg-white/5 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Mistakes cost</div>
            <div className="font-semibold tabular-nums">{fmtHm(gap)}</div>
          </div>
          <div className="rounded-lg bg-white/5 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Tightest cut-off</div>
            <div className={cn("font-semibold tabular-nums", tightest < 3600 ? "text-cutoff" : "")}>{Number.isFinite(tightest) ? fmtHm(tightest) : "–"}</div>
          </div>
        </div>

        <div className="rounded-lg border border-white/8 bg-black/20 px-1 pt-1">
          <ElevationProfile plan={plan} height={150} />
          <p className="px-2 pb-2 text-xs text-muted-foreground">Bars mark the long climbs. Triangles mark cut-offs.</p>
        </div>

        <div className="max-h-72 overflow-auto rounded-lg border border-white/8">
          <table className="w-full text-xs tabular-nums">
            <thead className="sticky top-0 bg-card text-muted-foreground">
              <tr className="text-left">
                <th className="px-2 py-1.5 font-medium">Aid station</th>
                <th className="px-2 py-1.5 text-right font-medium">km</th>
                <th className="px-2 py-1.5 text-right font-medium">Plan</th>
                <th className="px-2 py-1.5 text-right font-medium">Cut-off</th>
                <th className="px-2 py-1.5 text-right font-medium">Margin</th>
                <th className="px-2 py-1.5 text-right font-medium">Shadow</th>
              </tr>
            </thead>
            <tbody>
              {plan.splits
                .filter((s) => s.stationId !== "start")
                .map((s) => {
                  const st = course.aidStations.find((x) => x.id === s.stationId)!;
                  return (
                    <tr key={s.stationId} className="border-t border-white/5">
                      <td className="px-2 py-1.5">
                        <span className="flex items-center gap-1.5">
                          <StationBadge kind={st.kind} />
                          {st.kind === "finish" ? "Finish, Cortina" : st.name}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right text-muted-foreground">{s.km.toFixed(1)}</td>
                      <td className="px-2 py-1.5 text-right">{fmtClock(s.planSec)}</td>
                      <td className="px-2 py-1.5 text-right text-muted-foreground">{st.cutoff ?? ""}</td>
                      <td className={cn("px-2 py-1.5 text-right", s.marginSec !== null && s.marginSec < 3600 ? "text-cutoff" : "text-you")}>
                        {s.marginSec !== null ? fmtHm(s.marginSec) : ""}
                      </td>
                      <td className="px-2 py-1.5 text-right text-shadow">{fmtClock(s.shadowSec)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {plan.warnings.length > 0 && (
          <div className="space-y-1 text-sm text-amber-200/90">
            {plan.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button onClick={onStart}>
            <Play /> Start the race
          </Button>
          <p className="text-xs text-muted-foreground">Friday 23:00. Pause, jump the course, or talk to Marmo.</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function ProfileScreen({
  profile,
  plan,
  goal,
  status,
  onGoal,
  onRename,
  onStart,
  onNewData,
}: {
  profile: RunnerProfile;
  plan: Plan;
  goal: GoalId;
  status: PartnerStatus | null;
  onGoal: (g: GoalId) => void;
  onRename: (name: string) => void;
  onStart: () => void;
  onNewData: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader status={status}>
        <Button variant="ghost" size="sm" onClick={onNewData}>
          <RotateCcw /> Start over
        </Button>
      </AppHeader>
      <main className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,1fr)] gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-5">
          <TrainerCard profile={profile} onRename={onRename} />
          <ShadowMoves profile={profile} />
        </div>
        <div className="space-y-5 lg:sticky lg:top-4 lg:self-start">
          <RaceCard profile={profile} plan={plan} goal={goal} onGoal={onGoal} onStart={onStart} />
          <p className="px-1 text-xs text-muted-foreground">{course.source.note}</p>
        </div>
      </main>
      <div className="sticky bottom-0 z-20 flex items-center gap-3 border-t border-white/10 bg-background/90 px-4 py-3 backdrop-blur lg:hidden">
        <div className="min-w-0 flex-1 text-xs leading-tight">
          <div className="truncate font-medium">{course.name}</div>
          <div className="text-muted-foreground tabular-nums">
            Plan <span className="text-you">{fmtDuration(plan.timeline.finishSec)}</span> · Shadow <span className="text-shadow">{fmtDuration(plan.shadow.finishSec)}</span>
          </div>
        </div>
        <Button onClick={onStart}>
          <Play /> Start
        </Button>
      </div>
    </div>
  );
}
