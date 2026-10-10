import { climbSpans, course, GRADE, N_POINTS, STEP_M, TOTAL_M, isNight, localClockSec, stationAtPoint, type AidStation, type Climb } from "@/lib/course";
import { clamp, fatigueFactor, paceRatio, type PaceModel } from "@/lib/cost";
import type { PatternId, RunnerProfile } from "@/lib/profile";

export type GoalId = "safe" | "model" | "stretch";

/** The parts of a runner profile the plan engine needs (safe to send to the server). */
export type PlanProfile = Pick<RunnerProfile, "model" | "stats" | "patterns" | "avgStopMin" | "fadeOnsetH">;

export type Timeline = {
  /** race seconds when each course point is reached (before any stop there) */
  arrive: number[];
  /** stop seconds by station id */
  stops: Record<string, number>;
  finishSec: number;
};

export type Split = {
  stationId: string;
  name: string;
  km: number;
  planSec: number;
  shadowSec: number;
  cutoffSec: number | null;
  marginSec: number | null;
  stopSec: number;
};

export type ShadowMove = { km: number; move: string; patternId: PatternId };

export type Plan = {
  goal: GoalId;
  effortScale: number;
  beta: number;
  modelFinishSec: number;
  timeline: Timeline;
  shadow: Timeline;
  shadowMoves: ShadowMove[];
  splits: Split[];
  warnings: string[];
};


export function planStopSec(s: AidStation) {
  const base = { start: 0, aid: 150, water: 60, checkpoint: 0, lifebase: 600, finish: 0 }[s.kind];
  return base + (s.services.includes("hot food") ? 60 : 0);
}

/**
 * Fatigue exponent for the plan. The measured long-run fade includes the runner's mistakes
 * (fast starts, under-fuelling), so the plan uses an even-effort curve scaled by resilience.
 */
export function raceBeta(profile: Pick<RunnerProfile, "stats">) {
  return clamp(0.12 + 0.06 * (1 - profile.stats.resilience / 100), 0.12, 0.19);
}

export type PaceContext = {
  model: PaceModel;
  effortScale: number;
  beta: number;
};

/** Seconds per km at point index i and race time t, before any runner-specific modifiers. */
export function basePace(ctx: PaceContext, i: number, t: number) {
  const g = GRADE[Math.min(GRADE.length - 1, Math.max(0, i))];
  const night = isNight(t) ? 1.05 : 1;
  return ctx.model.flatPace * ctx.model.trailFactor * paceRatio(g, ctx.model) * fatigueFactor(t / 3600, ctx.beta) * ctx.effortScale * night;
}

type Mult = (i: number, t: number) => number;

export function runTimeline(
  ctx: PaceContext,
  stopFor: (s: AidStation) => number,
  opts: { mult?: Mult; fromIdx?: number; fromT?: number; skipStopAtFrom?: boolean } = {},
): Timeline {
  const from = opts.fromIdx ?? 0;
  const arrive: number[] = new Array(N_POINTS).fill(NaN);
  const stops: Record<string, number> = {};
  let t = opts.fromT ?? 0;
  arrive[from] = t;
  for (let i = from; i < N_POINTS - 1; i++) {
    const st = stationAtPoint.get(i);
    if (st && !(i === from && opts.skipStopAtFrom)) {
      const s = stopFor(st);
      stops[st.id] = s;
      t += s;
    }
    const pace = basePace(ctx, i, t) * (opts.mult ? opts.mult(i, t) : 1);
    t += (pace * STEP_M) / 1000;
    arrive[i + 1] = t;
  }
  return { arrive, stops, finishSec: t };
}

const sev = (p: PlanProfile, id: PatternId) => p.patterns.find((x) => x.id === id)?.severity ?? 0;

function climbFrac(c: Climb, i: number) {
  const e = course.ele[i];
  return (e - c.baseEle) / Math.max(1, c.topEle - c.baseEle);
}

export function climbAtIdx(i: number) {
  return climbSpans.find((x) => i >= x.a && i <= x.b)?.c ?? null;
}

/** Pace multiplier for "you making your usual mistakes". */
export function shadowMultiplier(profile: PlanProfile): Mult {
  const fast = sev(profile, "fast_start");
  const climb = sev(profile, "climb_overreach");
  const fuel = sev(profile, "fuel_fade");
  const night = sev(profile, "night_rookie");
  const heat = sev(profile, "hr_drift");
  const bonkStart = (profile.fadeOnsetH ?? 3) * 3 * 3600;
  return (i, t) => {
    let m = 1;
    const km = (i * STEP_M) / 1000;
    if (km < 25) m *= 1 - 0.1 * fast;
    const c = climbAtIdx(i);
    if (c && climb && c.gain >= 300) m *= climbFrac(c, i) < 0.5 ? 1 - 0.08 * climb : 1 + 0.14 * climb;
    if (fuel) {
      if (t > bonkStart && t < bonkStart + 6000) m *= 1 + 0.32 * fuel;
      else if (t >= bonkStart + 6000) m *= 1 + 0.04 * fuel;
    }
    const clock = localClockSec(t);
    if (night && clock >= 2 * 3600 && clock < 5 * 3600) m *= 1 + 0.1 * night;
    if (heat && t > 12 * 3600 && clock >= 12 * 3600 && clock < 17 * 3600) m *= 1 + 0.07 * heat;
    return m;
  };
}

export function shadowStopSec(profile: PlanProfile, s: AidStation) {
  const plan = planStopSec(s);
  if (!plan) return 0;
  const linger = sev(profile, "aid_linger");
  const avg = profile.avgStopMin ? profile.avgStopMin * 60 : 0;
  const lingered = s.kind === "lifebase" ? Math.max(plan * 1.6, avg * 2.2) : Math.max(plan * 1.5, avg);
  return Math.round(linger ? plan + (lingered - plan) * Math.max(0.6, linger) : plan * 1.25);
}

export function shadowBeta(profile: PlanProfile) {
  const base = raceBeta(profile);
  const measured = Math.max(0, profile.model.fadeBeta - base) * 0.35;
  const habits = 0.015 * sev(profile, "fast_start") + 0.02 * sev(profile, "late_fade") + 0.015 * sev(profile, "ultra_rookie");
  return base + clamp(Math.max(measured, habits), 0.02, 0.05);
}

function timelineFor(profile: PlanProfile, effortScale: number) {
  return runTimeline({ model: profile.model, effortScale, beta: raceBeta(profile) }, planStopSec);
}

function solveEffort(profile: PlanProfile, targetSec: number) {
  let lo = 0.5;
  let hi = 2;
  for (let k = 0; k < 28; k++) {
    const mid = (lo + hi) / 2;
    if (timelineFor(profile, mid).finishSec > targetSec) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export function goalTarget(goal: GoalId, modelFinish: number) {
  const raw = goal === "safe" ? modelFinish * 1.06 : goal === "stretch" ? modelFinish * 0.95 : modelFinish;
  return Math.round(raw / 900) * 900;
}

export function buildPlan(profile: PlanProfile, goal: GoalId = "model", customTargetSec?: number): Plan {
  const model = timelineFor(profile, 1);
  const target = customTargetSec ?? goalTarget(goal, model.finishSec);
  const effortScale = solveEffort(profile, target);
  const beta = raceBeta(profile);
  const timeline = runTimeline({ model: profile.model, effortScale, beta }, planStopSec);
  // The shadow is the same runner at the same intended effort, making their usual mistakes.
  const shadow = runTimeline(
    { model: profile.model, effortScale, beta: shadowBeta(profile) },
    (s) => shadowStopSec(profile, s),
    { mult: shadowMultiplier(profile) },
  );

  const splits: Split[] = course.aidStations.map((s) => {
    const idx = Math.round((s.km * 1000) / STEP_M);
    const planSec = timeline.arrive[idx];
    return {
      stationId: s.id,
      name: s.name,
      km: s.km,
      planSec,
      shadowSec: shadow.arrive[idx],
      cutoffSec: s.cutoffSec,
      marginSec: s.cutoffSec !== null ? s.cutoffSec - planSec : null,
      stopSec: timeline.stops[s.id] ?? 0,
    };
  });

  const moves: ShadowMove[] = [];
  if (sev(profile, "fast_start")) moves.push({ km: 0.5, move: "Fast Start", patternId: "fast_start" });
  if (sev(profile, "climb_overreach"))
    for (const c of course.climbs.filter((c) => c.gain >= 300)) moves.push({ km: c.startKm + 0.3, move: "Reckless Climb", patternId: "climb_overreach" });
  if (sev(profile, "fuel_fade")) {
    const bonkStart = (profile.fadeOnsetH ?? 3) * 3 * 3600;
    const i = shadow.arrive.findIndex((t) => t >= bonkStart);
    if (i > 0) moves.push({ km: (i * STEP_M) / 1000, move: "Empty Tank", patternId: "fuel_fade" });
  }
  if (sev(profile, "aid_linger")) moves.push({ km: course.aidStations.find((s) => s.kind === "lifebase")?.km ?? 67, move: "Aid Camp", patternId: "aid_linger" });
  if (sev(profile, "night_rookie")) {
    const i = shadow.arrive.findIndex((t) => localClockSec(t) >= 2 * 3600 && t < 12 * 3600);
    if (i > 0) moves.push({ km: (i * STEP_M) / 1000, move: "Sleepwalk", patternId: "night_rookie" });
  }
  moves.sort((a, b) => a.km - b.km);

  const warnings: string[] = [];
  for (const sp of splits) {
    if (sp.marginSec !== null && sp.marginSec < 1800) warnings.push(`Only ${Math.round(sp.marginSec / 60)} min margin at ${sp.name} (${sp.cutoffSec ? "cut-off" : ""}).`);
  }
  if (timeline.finishSec > course.timeLimitSec) warnings.push(`This target is past the ${Math.round(course.timeLimitSec / 3600)} hour limit.`);

  return {
    goal,
    effortScale,
    beta,
    modelFinishSec: model.finishSec,
    timeline,
    shadow,
    shadowMoves: moves,
    splits,
    warnings,
  };
}

/** Distance (m) reached at race time t along a timeline, honouring stops. */
export function distanceAtTime(tl: Timeline, t: number) {
  const a = tl.arrive;
  if (t <= 0) return 0;
  if (t >= tl.finishSec) return TOTAL_M;
  let lo = 0;
  let hi = N_POINTS - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (a[mid] <= t) lo = mid;
    else hi = mid;
  }
  const st = stationAtPoint.get(lo);
  const depart = a[lo] + (st ? tl.stops[st.id] ?? 0 : 0);
  if (t <= depart) return lo * STEP_M;
  const frac = (t - depart) / Math.max(1e-6, a[lo + 1] - depart);
  return (lo + clamp(frac, 0, 1)) * STEP_M;
}

/** Race time when a timeline reaches distance d (before stopping there). */
export function timeAtDistance(tl: Timeline, d: number) {
  const x = clamp(d, 0, TOTAL_M) / STEP_M;
  const i = Math.min(N_POINTS - 2, Math.floor(x));
  const st = stationAtPoint.get(i);
  const depart = tl.arrive[i] + (st ? tl.stops[st.id] ?? 0 : 0);
  const frac = x - i;
  if (frac <= 0) return tl.arrive[i];
  return depart + (tl.arrive[i + 1] - depart) * frac;
}
