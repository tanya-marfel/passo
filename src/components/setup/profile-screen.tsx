"use client";

import { useMemo } from "react";
import { AlertTriangle, ArrowRight, Mountain, Play, Timer, Upload } from "lucide-react";
import { cn } from "cn";
import { course } from "@/lib/course";
import { buildPlan, type GoalId, type Plan } from "@/lib/plan";
import type { RunnerProfile, TrainerStats } from "@/lib/profile";
import { fmtClock, fmtDuration, fmtHm } from "@/lib/format";
import type { PartnerStatus } from "@/hooks/use-partner-status";
import { AppHeader } from "@/components/app-header";
import { BadgeIcon, RunnerSprite, ShadowSprite } from "@/components/sprites";
import { ElevationProfile } from "@/components/race/elevation-profile";
import { StationBadge } from "@/components/race/station-pin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const STATS: [keyof TrainerStats, string, string][] = [
  ["speed", "SPEED", "#38bdf8"],
  ["climb", "CLIMB", "#fbbf24"],
  ["descent", "DESCENT", "#a78bfa"],
  ["stamina", "STAMINA", "#34d399"],
  ["resilience", "GRIT", "#fb7185"],
  ["night", "NIGHT", "#818cf8"],
];

const GOALS: { id: GoalId; label: string; blurb: string }[] = [
  { id: "safe", label: "Safe", blurb: "Big cut-off margins" },
  { id: "model", label: "Your data", blurb: "What your runs predict" },
  { id: "stretch", label: "Stretch", blurb: "Everything goes right" },
];

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { month: "short", year: "numeric" });

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="grid grid-cols-[70px_1fr_28px] items-center gap-2">
      <span className="font-pixel text-[7px] text-muted-foreground">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-black/40">
        <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
      <span className="text-right text-xs tabular-nums">{value}</span>
    </div>
  );
}

function TrainerCard({ profile, onRename }: { profile: RunnerProfile; onRename: (name: string) => void }) {
  const t = profile.totals;
  const longest = [...profile.activities].sort((a, b) => b.hours - a.hours).slice(0, 4);
  return (
    <Card className="gap-4">
      <CardHeader className="flex flex-row items-center gap-4">
        <div className="grid size-20 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-you/25 to-transparent ring-1 ring-you/30">
          <RunnerSprite height={60} className="animate-bob" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-pixel text-[8px] text-muted-foreground">TRAINER CARD</div>
          <div className="mt-1.5 flex items-center gap-2">
            <Input name="runner-name" autoComplete="nickname" value={profile.name} onChange={(e) => onRename(e.target.value)} className="h-8 max-w-52 text-base font-semibold" aria-label="Your name" maxLength={20} />
            <span className="font-pixel text-[9px] text-primary">Lv{profile.level}</span>
          </div>
          <div className="mt-1.5 text-sm">
            <span className="font-medium text-gym">{profile.type.name}</span> <span className="text-muted-foreground">· {profile.type.blurb}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-xs text-muted-foreground">
          {profile.source === "sample" ? "Sample history" : "Garmin history"}: {profile.activityCount} runs · {fmtDate(profile.dateRange.from)} to {fmtDate(profile.dateRange.to)} ·{" "}
          {Math.round(t.km).toLocaleString("en-GB")} km · {Math.round(t.gain).toLocaleString("en-GB")} m up · {Math.round(t.hours)} h
        </div>
        <div className="space-y-1.5">
          {STATS.map(([k, label, color]) => (
            <StatBar key={k} label={label} value={profile.stats[k]} color={color} />
          ))}
        </div>
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {profile.highlights.map((h) => (
            <li key={h} className="flex gap-2">
              <span className="text-primary">▸</span>
              {h}
            </li>
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
      <CardHeader className="flex flex-row items-center gap-3">
        <ShadowSprite height={48} />
        <div>
          <CardTitle className="font-pixel text-[10px] leading-relaxed text-shadow">YOUR SHADOW&apos;S MOVES</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Your Shadow is you on a bad day: same legs, same habits. Marmo has a counter for each move.</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {profile.patterns.length === 0 && <p className="text-sm text-muted-foreground">No clear weaknesses found. Your Shadow will just run your plan a little worse.</p>}
        {profile.patterns.map((p) => (
          <div key={p.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-pixel text-[9px] text-shadow">{p.move.toUpperCase()}</span>
              <span className="text-sm font-medium">{p.title}</span>
              <Badge variant={p.confidence === "data" ? "secondary" : "outline"} className="ml-auto text-[10px]">
                {p.confidence === "data" ? "From your runs" : "Assumption"}
              </Badge>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">Power</span>
              <div className="flex gap-0.5">
                {Array.from({ length: 5 }, (_, i) => (
                  <span key={i} className={cn("h-2 w-4 rounded-sm", i < Math.round(p.severity * 5) ? "bg-shadow" : "bg-white/10")} />
                ))}
              </div>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{p.evidence}</p>
            <p className="mt-1.5 text-sm">
              <span className="font-medium text-primary">Marmo&apos;s counter:</span> {p.advice}
            </p>
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
        <div className="font-pixel text-[8px] text-muted-foreground">YOUR NEXT RACE</div>
        <CardTitle className="mt-1 text-2xl font-semibold tracking-tight">{course.name}</CardTitle>
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
                goal === g.id ? "border-primary bg-primary/10" : "border-white/10 bg-white/[0.02] hover:border-white/25",
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
          <div className="flex flex-wrap items-center gap-3 px-2 pb-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-sm bg-gym/60" /> Gyms (big climbs)
            </span>
            <span className="flex items-center gap-1">
              <span className="size-0 border-x-4 border-t-[6px] border-x-transparent border-t-cutoff" /> Cut-off
            </span>
            <span className="ml-auto flex gap-1">
              {course.climbs.map((c) => (
                <BadgeIcon key={c.id} climbId={c.id} size={16} />
              ))}
            </span>
          </div>
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
          <div className="space-y-1 rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">
            {plan.warnings.map((w) => (
              <p key={w} className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {w}
              </p>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button size="lg" className="h-11 px-5 text-base" onClick={onStart}>
            <Play /> Start live race <ArrowRight />
          </Button>
          <p className="text-xs text-muted-foreground">
            <Timer className="mr-1 inline size-3.5" />
            Simulated race clock from Fri 23:00. Jump anywhere, inject a cramp or a storm, and talk to Marmo.
          </p>
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
          <Upload /> New data
        </Button>
      </AppHeader>
      <main className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-5">
          <TrainerCard profile={profile} onRename={onRename} />
          <ShadowMoves profile={profile} />
        </div>
        <div className="space-y-5 lg:sticky lg:top-4 lg:self-start">
          <RaceCard profile={profile} plan={plan} goal={goal} onGoal={onGoal} onStart={onStart} />
          <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <Mountain className="size-3.5" /> {course.source.note}
          </p>
        </div>
      </main>
    </div>
  );
}
