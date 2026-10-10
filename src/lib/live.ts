import { course, localClockSec, stationD, climbStartD, nextStation, type AidStation } from "@/lib/course";
import { timeAtDistance, type GoalId } from "@/lib/plan";
import type { RunnerProfile } from "@/lib/profile";
import { isDrowsy, projectRace, shadowGapSec, type SimContext, type SimEvent, type SimEventType, type SimState } from "@/lib/sim";
import type { CoachAction, CoachProfile, CoachRequest, CoachTrigger, LiveSnapshot } from "@/lib/coach/types";
import { fmtHm } from "@/lib/format";

export type StatusId = "cramp" | "storm" | "drowsy" | "bonk" | "caffeine" | "resting";

export function statusList(s: SimState, profile: RunnerProfile): StatusId[] {
  const out: StatusId[] = [];
  if (s.cramp && s.t < s.cramp.until) out.push("cramp");
  if (s.storm && s.t < s.storm.until) out.push("storm");
  if (isDrowsy(s, profile)) out.push("drowsy");
  if (s.hp < 20) out.push("bonk");
  if (s.caffeineT !== null && s.t - s.caffeineT < 3 * 3600) out.push("caffeine");
  if (s.stopUntil !== null) out.push("resting");
  return out;
}

export function coachProfile(p: RunnerProfile): CoachProfile {
  return {
    name: p.name,
    type: p.type,
    level: p.level,
    totals: p.totals,
    highlights: p.highlights,
    hrDriftPct: p.hrDriftPct,
    model: p.model,
    stats: p.stats,
    patterns: p.patterns,
    avgStopMin: p.avgStopMin,
    fadeOnsetH: p.fadeOnsetH,
  };
}

export function liveSnapshot(s: SimState, ctx: SimContext): LiveSnapshot {
  const proj = projectRace(s, ctx);
  return {
    t: s.t,
    d: s.d,
    hp: s.hp,
    effort: s.effort,
    debt: s.debt,
    status: statusList(s, ctx.profile).filter((x) => x !== "caffeine" && x !== "resting"),
    gels: s.gels,
    lastGelAgoMin: (s.t - s.lastGelT) / 60,
    shadowGapSec: shadowGapSec(s, ctx.plan),
    planDeltaSec: s.t - timeAtDistance(ctx.plan.timeline, s.d),
    projectedFinishSec: proj.finishSec,
    arrivals: proj.arrivals,
    badges: s.badges.map((b) => b.badge),
    stopAt: s.stopAt,
  };
}

export function buildCoachRequest(
  trigger: CoachTrigger,
  s: SimState,
  ctx: SimContext,
  goal: GoalId,
  history: CoachRequest["history"],
): CoachRequest {
  return { trigger, live: liveSnapshot(s, ctx), profile: coachProfile(ctx.profile), goal, history: history.slice(-6) };
}

/** 0 = must speak now and hold the race, 1 = speak and hold, 2 = background (no hold, droppable). */
export function triggerPriority(e: Pick<SimEvent, "type" | "refId">): 0 | 1 | 2 | null {
  switch (e.type) {
    case "runner_message":
    case "cramp":
    case "storm":
    case "bonk":
    case "cutoff_risk":
    case "finish":
    case "race_start":
      return 0;
    case "climb_ahead":
    case "shadow_pass":
    case "shadow_ahead":
    case "hp_low":
    case "missed_fuel":
    case "night_low":
    case "sunrise":
    case "summit":
    case "pace_drift":
      return 1;
    case "aid_ahead": {
      const st = course.aidStations.find((x) => x.id === e.refId);
      return st && (st.cutoffSec !== null || st.kind === "lifebase") ? 1 : 2;
    }
    case "aid_arrive": {
      const st = course.aidStations.find((x) => x.id === e.refId);
      return st?.kind === "lifebase" ? 1 : 2;
    }
    case "checkin":
    case "heat":
    case "sunset":
      return 2;
    default:
      return null;
  }
}

export const TRIGGER_LABEL: Record<SimEventType, string> = {
  race_start: "Race start",
  climb_ahead: "Gym ahead",
  summit: "Gym cleared",
  aid_ahead: "Aid station ahead",
  aid_arrive: "Aid station",
  finish: "Finish",
  night_low: "Night low",
  sunrise: "Sunrise",
  heat: "Midday heat",
  sunset: "Sunset",
  hp_low: "Low energy",
  bonk: "Bonk",
  shadow_pass: "Shadow passed",
  shadow_ahead: "Shadow ahead",
  pace_drift: "Pace drift",
  cutoff_risk: "Cut-off risk",
  checkin: "Check-in",
  cramp: "Cramp",
  storm: "Thunderstorm",
  missed_fuel: "Missed fuel",
  runner_message: "You asked",
};

export type BattleTone = "info" | "good" | "bad" | "shadow" | "system";

export type BattleLine = { id: number; t: number; d: number; text: string; tone: BattleTone };

const stationName = (id?: string) => course.aidStations.find((s) => s.id === id)?.name ?? "the aid station";
const climbOf = (id?: string) => course.climbs.find((c) => c.id === id);

/** Short battle-text line for an event, or null to keep the log quiet. */
export function battleText(e: SimEvent, profile: RunnerProfile): { text: string; tone: BattleTone } | null {
  const d = e.data ?? {};
  switch (e.type) {
    case "race_start":
      return { text: "The race begins in Cortina! Headlamps on.", tone: "system" };
    case "climb_ahead": {
      const c = climbOf(e.refId);
      return c ? { text: `A wild climb appeared! ${c.name} gym: ${c.gain} m up in ${c.lengthKm.toFixed(1)} km.`, tone: "info" } : null;
    }
    case "summit": {
      const c = climbOf(e.refId);
      if (!c) return null;
      const mine = Number(d.climbSec);
      const shadow = Number(d.shadowSec);
      return {
        text: `You cleared the ${c.name} gym and earned the ${c.badge}! ${fmtHm(mine)} (shadow ${fmtHm(shadow)}).`,
        tone: "good",
      };
    }
    case "aid_arrive": {
      const st = course.aidStations.find((s) => s.id === e.refId);
      if (!st) return null;
      const stop = Number(d.stopSec);
      const potion = st.services.includes("food") ? " Potion used: energy restored." : st.services.includes("water") ? " Bottles refilled." : "";
      return { text: `Reached ${st.name}.${stop ? ` Stop ${Math.round(stop / 60)} min.` : ""}${potion}`, tone: "info" };
    }
    case "aid_ahead":
      return { text: `${stationName(e.refId)} is 1.2 km ahead.`, tone: "info" };
    case "shadow_pass":
      return { text: "You overtook your Shadow!", tone: "good" };
    case "shadow_ahead":
      return { text: "Your Shadow pulled ahead!", tone: "shadow" };
    case "hp_low":
      return { text: `Energy is low (${d.hp} HP).`, tone: "bad" };
    case "bonk":
      return { text: `Critical! You're bonking at ${d.hp} HP.`, tone: "bad" };
    case "pace_drift": {
      const pct = Number(d.ratioPct);
      return { text: `Pace drift: km ${d.fromKm} to ${d.toKm} were ${Math.abs(pct)}% ${pct < 0 ? "faster" : "slower"} than plan.`, tone: pct < 0 ? "bad" : "info" };
    }
    case "cutoff_risk":
      return { text: `Cut-off danger at ${stationName(e.refId)}: only ${Math.round(Number(d.marginSec) / 60)} min margin.`, tone: "bad" };
    case "night_low":
      return { text: "02:30. The night is at its darkest.", tone: "system" };
    case "sunrise":
      return { text: "The sun rises over the Dolomites.", tone: "system" };
    case "heat":
      return { text: "Midday heat: the valley is baking.", tone: "system" };
    case "sunset":
      return { text: "The sun sets. Headlamps back on.", tone: "system" };
    case "cramp":
      return { text: "Ouch! A calf cramp. Speed fell sharply.", tone: "bad" };
    case "storm":
      return { text: "A thunderstorm rolls over the ridge!", tone: "bad" };
    case "missed_fuel":
      return { text: "You skipped your gels.", tone: "bad" };
    case "finish":
      return { text: `FINISH! Lavaredo conquered in ${fmtHm(Number(d.sec))}.`, tone: "good" };
    case "runner_message":
    case "checkin":
      return null;
  }
  void profile;
  return null;
}

export function describeAction(a: CoachAction): string {
  switch (a.type) {
    case "set_effort": {
      const pct = Math.round((a.value - 1) * 100);
      return `Effort ${pct > 0 ? "+" : ""}${pct}%${a.durationMin ? ` for ${a.durationMin} min` : ""}`;
    }
    case "eat":
      return "Eat now";
    case "salt":
      return "Salt + fluids";
    case "caffeine":
      return "Caffeine";
    case "layer_up":
      return "Jacket on";
    case "quick_aid":
      return `Quick stop${a.stationId ? ` at ${stationName(a.stationId)}` : ""}`;
    case "pace_climb": {
      const c = climbOf(a.climbId);
      return `Pace the climb${c ? `: ${c.name}` : ""}`;
    }
    case "easy_start":
      return "Easy start";
  }
}

/** 0 = full daylight, 1 = full night, with a 40 minute twilight ramp. */
export function nightness(raceSec: number) {
  const c = localClockSec(raceSec);
  const ramp = 40 * 60;
  const rise = course.sunriseLocalSec;
  const set = course.sunsetLocalSec;
  if (c >= rise + ramp && c <= set - ramp) return 0;
  if (c > rise - ramp && c < rise + ramp) return 1 - (c - (rise - ramp)) / (2 * ramp);
  if (c > set - ramp && c < set + ramp) return (c - (set - ramp)) / (2 * ramp);
  return 1;
}

export type JumpTarget = { id: string; label: string; detail: string; d: number };

export const JUMP_TARGETS: JumpTarget[] = [
  { id: "start", label: "Start in Cortina", detail: "km 0 · Fri 23:00", d: 0 },
  ...course.climbs.map((c, i) => ({
    id: c.id,
    label: `Gym ${i + 1}: ${c.name}`,
    detail: `km ${c.startKm.toFixed(1)} · ${c.gain} m up`,
    d: Math.max(0, climbStartD(c) - 900),
  })),
  ...course.aidStations
    .filter((s) => s.kind === "lifebase")
    .map((s) => ({ id: s.id, label: `${s.name} life base`, detail: `km ${s.km.toFixed(1)} · drop bags`, d: stationD(s) - 1500 })),
  { id: "final", label: "Final descent", detail: "km 111 · Croda da Lago", d: 110950 },
].sort((a, b) => a.d - b.d);

export function nextAidInfo(s: SimState, arrivals: Record<string, number>) {
  const st: AidStation | null = nextStation(s.d, (x) => x.kind !== "checkpoint" && x.kind !== "start");
  if (!st) return null;
  const eta = arrivals[st.id];
  return {
    station: st,
    distM: stationD(st) - s.d,
    etaSec: eta,
    marginSec: st.cutoffSec !== null && eta !== undefined ? st.cutoffSec - eta : null,
  };
}
