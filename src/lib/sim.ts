import { course, N_POINTS, STEP_M, TOTAL_M, localClockSec, stationD, climbStartD, climbEndD, nextCutoffStation, nextStation, idxAt, GRADE, type AidStation } from "@/lib/course";
import { basePace, planStopSec, raceBeta, runTimeline, timeAtDistance, distanceAtTime, climbAtIdx, STATION_IDX, type Plan } from "@/lib/plan";
import type { RunnerProfile } from "@/lib/profile";
import type { CoachAction } from "@/lib/coach/types";

export type SimEventType =
  | "race_start"
  | "climb_ahead"
  | "summit"
  | "aid_ahead"
  | "aid_arrive"
  | "finish"
  | "night_low"
  | "sunrise"
  | "heat"
  | "sunset"
  | "hp_low"
  | "bonk"
  | "shadow_pass"
  | "shadow_ahead"
  | "pace_drift"
  | "cutoff_risk"
  | "checkin"
  | "cramp"
  | "storm"
  | "missed_fuel"
  | "runner_message";

export type SimEvent = {
  type: SimEventType;
  t: number;
  d: number;
  refId?: string;
  data?: Record<string, number | string | boolean | null>;
};

export type Badge = { climbId: string; name: string; badge: string; atSec: number; climbSec: number; planSec: number; shadowSec: number };

export type SimState = {
  t: number;
  d: number;
  hp: number;
  effort: number;
  /** temporary coach effort change that expires */
  effortRestore: { at: number; value: number } | null;
  debt: number;
  stopUntil: number | null;
  stopAt: string | null;
  lastGelT: number;
  gels: number;
  skipGels: number;
  remindedFuelT: number | null;
  quickAidFor: string | null;
  cramp: { until: number; relieved: boolean } | null;
  storm: { until: number; layered: boolean } | null;
  caffeineT: number | null;
  /** habits the coach has talked the runner out of */
  coached: { start: boolean; climbs: Record<string, true> };
  climbStartT: Record<string, number>;
  badges: Badge[];
  kmTimes: number[];
  lastCoachT: number;
  shadowSign: number;
  lastDriftKm: number;
  lastCutoffCheckKm: number;
  cutoffWarnedFor: string | null;
  hpLowArmed: boolean;
  bonkArmed: boolean;
  fired: Record<string, true>;
  finished: boolean;
  trail: { t: number; d: number; hp: number }[];
};

export function initialSim(): SimState {
  return {
    t: 0,
    d: 0,
    hp: 100,
    effort: 1,
    effortRestore: null,
    debt: 0,
    stopUntil: null,
    stopAt: null,
    lastGelT: 0,
    gels: 0,
    skipGels: 0,
    remindedFuelT: null,
    quickAidFor: null,
    cramp: null,
    storm: null,
    caffeineT: null,
    coached: { start: false, climbs: {} },
    climbStartT: {},
    badges: [],
    kmTimes: [0],
    lastCoachT: 0,
    shadowSign: -1,
    lastDriftKm: 0,
    lastCutoffCheckKm: 0,
    cutoffWarnedFor: null,
    hpLowArmed: true,
    bonkArmed: true,
    fired: {},
    finished: false,
    trail: [{ t: 0, d: 0, hp: 100 }],
  };
}

export type SimContext = { plan: Plan; profile: RunnerProfile };

const has = (p: RunnerProfile, id: string) => p.patterns.some((x) => x.id === id);
const sevOf = (p: RunnerProfile, id: string) => p.patterns.find((x) => x.id === id)?.severity ?? 0;

/**
 * The runner carries the same habits as their shadow (fast start, attacking climbs)
 * unless the coach has talked them out of it. Returns a pace multiplier (<1 = faster).
 */
export function habitMultiplier(s: SimState, profile: RunnerProfile) {
  let m = 1;
  const fast = sevOf(profile, "fast_start");
  if (fast && !s.coached.start && s.d < 25000) m *= 1 - 0.1 * fast;
  const climbP = sevOf(profile, "climb_overreach");
  const c = climbP ? climbAtIdx(idxAt(s.d)) : null;
  if (c && c.gain >= 300 && !s.coached.climbs[c.id]) {
    const frac = (course.ele[idxAt(s.d)] - c.baseEle) / Math.max(1, c.topEle - c.baseEle);
    m *= frac < 0.5 ? 1 - 0.08 * climbP : 1 + 0.14 * climbP;
  }
  return m;
}

/** How hard the runner is actually pushing relative to the plan (1 = planned effort). */
export function intensity(s: SimState, profile: RunnerProfile) {
  return s.effort / Math.min(1, habitMultiplier(s, profile));
}

export function isDrowsy(s: SimState, profile: RunnerProfile) {
  const c = localClockSec(s.t);
  const night = c >= 2 * 3600 && c < 5 * 3600 && s.t < 12 * 3600;
  const caffeinated = s.caffeineT !== null && s.t - s.caffeineT < 3 * 3600;
  return night && !caffeinated && has(profile, "night_rookie");
}

/** Multiplier on pace from the runner's current condition (1 = as planned). */
export function conditionMultiplier(s: SimState, profile: RunnerProfile) {
  let m = habitMultiplier(s, profile) / s.effort;
  m *= 1 + 0.06 * s.debt;
  if (s.cramp && s.t < s.cramp.until) m *= s.cramp.relieved ? 1.18 : 1.45;
  if (s.storm && s.t < s.storm.until) m *= 1.12;
  if (isDrowsy(s, profile)) m *= 1.06;
  if (s.hp < 20) m *= 1 + ((20 - s.hp) / 20) * 0.4;
  return m;
}

function noise(d: number) {
  return 1 + 0.025 * Math.sin(d / 700) + 0.015 * Math.sin(d / 230 + 1.3);
}

function fuelInterval(s: SimState, profile: RunnerProfile) {
  const reminded = s.remindedFuelT !== null && s.t - s.remindedFuelT < 3 * 3600;
  return has(profile, "fuel_fade") && !reminded ? 90 * 60 : 35 * 60;
}

function runnerStopSec(s: SimState, st: AidStation, profile: RunnerProfile) {
  const base = planStopSec(st);
  if (!base) return 0;
  if (s.quickAidFor === st.id) return base;
  return has(profile, "aid_linger") ? Math.round(base * 1.8) : base;
}

function drainPerHour(s: SimState, i: number, profile: RunnerProfile) {
  const k = intensity(s, profile);
  let r = 16 * k * k;
  if (GRADE[i] > 0.05) r *= 1.15;
  if (s.cramp && s.t < s.cramp.until) r *= 1.2;
  if (s.storm && s.t < s.storm.until && !s.storm.layered) r *= 1.2;
  return r;
}

const SUNRISE_T = ((course.sunriseLocalSec - 23 * 3600 + 86400) % 86400);
const SUNSET_T = course.sunsetLocalSec + 3600;
const TIME_EVENTS: { type: SimEventType; t: number }[] = [
  { type: "night_low", t: 3.5 * 3600 },
  { type: "sunrise", t: SUNRISE_T },
  { type: "heat", t: 14 * 3600 },
  { type: "sunset", t: SUNSET_T },
];

export function shadowGapSec(s: SimState, plan: Plan) {
  return timeAtDistance(plan.shadow, s.d) - s.t;
}

/** Advance the simulation by dt race-seconds. Mutates and returns emitted events. */
export function stepSim(s: SimState, dt: number, ctx: SimContext, opts: { checkins: boolean }): SimEvent[] {
  const ev: SimEvent[] = [];
  if (s.finished) return ev;
  const { plan, profile } = ctx;
  const pctx = { model: profile.model, effortScale: plan.effortScale, beta: raceBeta(profile) };
  let remaining = dt;
  const prevT = s.t;
  const prevD = s.d;

  while (remaining > 0 && !s.finished) {
    if (s.effortRestore && s.t >= s.effortRestore.at) {
      s.effort = s.effortRestore.value;
      s.effortRestore = null;
    }
    if (s.stopUntil !== null) {
      const wait = Math.min(remaining, s.stopUntil - s.t);
      s.t += wait;
      remaining -= wait;
      s.hp = Math.min(100, s.hp + (wait / 3600) * 4);
      if (s.t >= s.stopUntil - 1e-6) {
        s.stopUntil = null;
        s.stopAt = null;
      }
      continue;
    }
    const i = idxAt(s.d);
    const pace = basePace(pctx, i, s.t) * conditionMultiplier(s, profile) * noise(s.d);
    const speed = 1000 / pace;
    const sub = Math.min(remaining, 30);
    let nd = s.d + speed * sub;
    let used = sub;
    const nextSt = course.aidStations.find((st) => stationD(st) > s.d + 0.5 && stationD(st) <= nd);
    if (nextSt) {
      nd = stationD(nextSt);
      used = (nd - s.d) / speed;
    }
    if (nd >= TOTAL_M) {
      nd = TOTAL_M;
      used = (nd - s.d) / speed;
    }
    const hours = used / 3600;
    s.hp = Math.max(0, s.hp - drainPerHour(s, i, profile) * hours);
    const k = intensity(s, profile);
    s.debt = Math.max(0, s.debt + (k > 1 ? (k - 1) * hours * 2.5 : -(1 - k) * hours));
    s.d = nd;
    s.t += used;
    remaining -= used;

    if (s.t - s.lastGelT >= fuelInterval(s, profile)) {
      s.lastGelT = s.t;
      if (s.skipGels > 0) s.skipGels--;
      else {
        s.gels++;
        s.hp = Math.min(100, s.hp + 5);
      }
    }

    if (nextSt) {
      if (nextSt.kind === "finish") {
        s.finished = true;
        ev.push({ type: "finish", t: s.t, d: s.d, refId: nextSt.id, data: { sec: Math.round(s.t) } });
        break;
      }
      const stop = runnerStopSec(s, nextSt, profile);
      const shadowArr = timeAtDistance(plan.shadow, s.d);
      const planArr = timeAtDistance(plan.timeline, s.d);
      ev.push({
        type: "aid_arrive",
        t: s.t,
        d: s.d,
        refId: nextSt.id,
        data: { stopSec: stop, planSec: Math.round(planArr), shadowSec: Math.round(shadowArr), cutoffSec: nextSt.cutoffSec },
      });
      if (stop > 0) {
        s.stopUntil = s.t + stop;
        s.stopAt = nextSt.id;
        if (nextSt.services.includes("food")) s.hp = Math.min(100, s.hp + 12 + (nextSt.services.includes("hot food") ? 5 : 0));
        if (nextSt.services.includes("water")) s.hp = Math.min(100, s.hp + 2);
      }
      s.quickAidFor = null;
    }
  }

  // Distance-crossing events.
  for (const c of course.climbs) {
    const ahead = climbStartD(c) - 700;
    if (c.gain >= 240 && prevD < ahead && s.d >= ahead && ahead > 0) ev.push({ type: "climb_ahead", t: s.t, d: s.d, refId: c.id });
    if (prevD < climbStartD(c) + 1 && s.d >= climbStartD(c) + 1) s.climbStartT[c.id] = s.t;
    if (prevD < climbEndD(c) && s.d >= climbEndD(c)) {
      const startT = s.climbStartT[c.id] ?? timeAtDistance(plan.timeline, climbStartD(c));
      const badge: Badge = {
        climbId: c.id,
        name: c.name,
        badge: c.badge,
        atSec: s.t,
        climbSec: s.t - startT,
        planSec: timeAtDistance(plan.timeline, climbEndD(c)) - timeAtDistance(plan.timeline, climbStartD(c)),
        shadowSec: timeAtDistance(plan.shadow, climbEndD(c)) - timeAtDistance(plan.shadow, climbStartD(c)),
      };
      s.badges.push(badge);
      ev.push({ type: "summit", t: s.t, d: s.d, refId: c.id, data: { climbSec: Math.round(badge.climbSec), planSec: Math.round(badge.planSec), shadowSec: Math.round(badge.shadowSec) } });
    }
  }
  for (const st of course.aidStations) {
    if (st.kind === "start" || st.kind === "finish" || st.kind === "checkpoint") continue;
    const ahead = stationD(st) - 1200;
    const important = st.cutoffSec !== null || st.kind === "lifebase" || st.services.includes("hot food") || st.services.includes("food");
    if (important && prevD < ahead && s.d >= ahead) ev.push({ type: "aid_ahead", t: s.t, d: s.d, refId: st.id });
  }
  for (let km = Math.floor(prevD / 1000) + 1; km <= Math.floor(s.d / 1000); km++) s.kmTimes[km] = s.t;

  // Time events.
  for (const te of TIME_EVENTS) {
    if (prevT < te.t && s.t >= te.t && !s.fired[te.type]) {
      s.fired[te.type] = true;
      ev.push({ type: te.type, t: s.t, d: s.d });
    }
  }

  // Energy.
  if (s.hp < 35 && s.hpLowArmed) {
    s.hpLowArmed = false;
    ev.push({ type: "hp_low", t: s.t, d: s.d, data: { hp: Math.round(s.hp) } });
  } else if (s.hp > 55) s.hpLowArmed = true;
  if (s.hp < 18 && s.bonkArmed) {
    s.bonkArmed = false;
    ev.push({ type: "bonk", t: s.t, d: s.d, data: { hp: Math.round(s.hp) } });
  } else if (s.hp > 40) s.bonkArmed = true;

  // Shadow position.
  const gap = shadowGapSec(s, plan);
  const sign = gap > 30 ? 1 : gap < -30 ? -1 : s.shadowSign;
  if (sign !== s.shadowSign && s.d > 1500) {
    ev.push({ type: sign > 0 ? "shadow_pass" : "shadow_ahead", t: s.t, d: s.d, data: { gapSec: Math.round(gap) } });
  }
  s.shadowSign = sign;

  // Pacing drift every 3 km.
  const kmNow = Math.floor(s.d / 1000);
  if (kmNow >= 3 && kmNow % 3 === 0 && kmNow !== s.lastDriftKm && s.kmTimes[kmNow - 3] !== undefined) {
    s.lastDriftKm = kmNow;
    const mine = s.kmTimes[kmNow] - s.kmTimes[kmNow - 3];
    const planned = timeAtDistance(plan.timeline, kmNow * 1000) - timeAtDistance(plan.timeline, (kmNow - 3) * 1000);
    const ratio = mine / planned;
    if (ratio < 0.93 || ratio > 1.1) {
      ev.push({ type: "pace_drift", t: s.t, d: s.d, data: { ratioPct: Math.round((ratio - 1) * 100), fromKm: kmNow - 3, toKm: kmNow } });
    }
  }

  // Cut-off projection every 2 km.
  if (kmNow - s.lastCutoffCheckKm >= 2) {
    s.lastCutoffCheckKm = kmNow;
    const st = nextCutoffStation(s.d);
    if (st && st.cutoffSec !== null && st.id !== s.cutoffWarnedFor && s.d > 5000) {
      const proj = projectRace(s, ctx);
      const eta = proj.arrivals[st.id];
      const planMargin = st.cutoffSec - timeAtDistance(plan.timeline, stationD(st));
      const margin = eta !== undefined ? st.cutoffSec - eta : Infinity;
      if (margin < 10 * 60 || margin < Math.min(45 * 60, planMargin - 15 * 60)) {
        s.cutoffWarnedFor = st.id;
        ev.push({ type: "cutoff_risk", t: s.t, d: s.d, refId: st.id, data: { marginSec: Math.round(st.cutoffSec - eta), etaSec: Math.round(eta) } });
      }
    }
  }

  if (opts.checkins && s.t - s.lastCoachT > 55 * 60 && !s.stopUntil) {
    s.lastCoachT = s.t;
    ev.push({ type: "checkin", t: s.t, d: s.d });
  }

  if (s.trail.length === 0 || s.t - s.trail[s.trail.length - 1].t >= 300) s.trail.push({ t: s.t, d: s.d, hp: s.hp });
  return ev;
}

/** Projects the rest of the race from the runner's current state and condition. */
export function projectRace(s: SimState, ctx: SimContext) {
  const { plan, profile } = ctx;
  const i = Math.min(N_POINTS - 1, Math.ceil(s.d / STEP_M));
  const cond = (1 / s.effort) * (1 + 0.06 * s.debt) * (s.hp < 20 ? 1 + ((20 - s.hp) / 20) * 0.4 : 1);
  const startT = s.t + (i * STEP_M - s.d) / 1000 * basePace({ model: profile.model, effortScale: plan.effortScale, beta: raceBeta(profile) }, idxAt(s.d), s.t) * cond + (s.stopUntil ? s.stopUntil - s.t : 0);
  const tl = runTimeline(
    { model: profile.model, effortScale: plan.effortScale * cond, beta: raceBeta(profile) },
    (st) => (st.id === s.stopAt ? 0 : runnerStopSec(s, st, profile)),
    { fromIdx: i, fromT: startT, skipStopAtFrom: s.stopAt !== null || STATION_IDX.get(i) === undefined },
  );
  const arrivals: Record<string, number> = {};
  for (const st of course.aidStations) {
    const idx = Math.round((st.km * 1000) / STEP_M);
    if (idx >= i) arrivals[st.id] = tl.arrive[idx];
  }
  return { finishSec: tl.finishSec, arrivals };
}

export function planDistanceAt(plan: Plan, t: number) {
  return distanceAtTime(plan.timeline, t);
}

export function shadowDistanceAt(plan: Plan, t: number) {
  return distanceAtTime(plan.shadow, t);
}

/** Fast-forward without a coach, e.g. when jumping to a later point of the race. */
export function fastForward(s: SimState, ctx: SimContext, targetD: number) {
  let guard = 0;
  while (s.d < targetD && !s.finished && guard++ < 20000) {
    stepSim(s, 60, ctx, { checkins: false });
  }
  s.lastCoachT = s.t;
}

/** The simulated runner follows the coach: effort changes, food, salt, caffeine, layers, quick stops. */
export function applyCoachActions(s: SimState, actions: CoachAction[]) {
  for (const a of actions) {
    switch (a.type) {
      case "set_effort": {
        const base = s.effortRestore?.value ?? s.effort;
        s.effort = Math.max(0.75, Math.min(1.2, a.value));
        s.effortRestore = a.durationMin ? { at: s.t + a.durationMin * 60, value: base } : null;
        break;
      }
      case "eat":
        s.hp = Math.min(100, s.hp + 5);
        s.gels++;
        s.lastGelT = s.t;
        s.remindedFuelT = s.t;
        break;
      case "caffeine":
        s.caffeineT = s.t;
        break;
      case "salt":
        if (s.cramp) s.cramp.relieved = true;
        break;
      case "layer_up":
        if (s.storm) s.storm.layered = true;
        break;
      case "quick_aid":
        s.quickAidFor = a.stationId ?? nextStation(s.d)?.id ?? null;
        break;
      case "pace_climb": {
        const c = a.climbId ? course.climbs.find((x) => x.id === a.climbId) : climbAtIdx(idxAt(s.d)) ?? course.climbs.find((x) => climbStartD(x) > s.d);
        if (c) s.coached.climbs[c.id] = true;
        break;
      }
      case "easy_start":
        s.coached.start = true;
        break;
    }
  }
}
