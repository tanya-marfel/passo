import {
  course,
  N_POINTS,
  STEP_M,
  terrainAhead,
  nextStation,
  nextCutoffStation,
  climbAt,
  nextClimb,
  eleAt,
  gradeAt,
  isNight,
  stationD,
  climbStartD,
  climbEndD,
  legNoteAt,
} from "@/lib/course";
import { buildPlan, timeAtDistance, runTimeline, raceBeta, planStopSec, type Plan } from "@/lib/plan";
import { fmtClock, fmtDuration, fmtHm, fmtPace } from "@/lib/format";
import { clamp } from "@/lib/cost";
import type { PatternId } from "@/lib/profile";
import type { CoachAction, CoachRequest } from "@/lib/coach/types";

export type ToolContext = {
  req: CoachRequest;
  plan: Plan;
  actions: CoachAction[];
};

export function makeToolContext(req: CoachRequest, plan?: Plan): ToolContext {
  return { req, plan: plan ?? buildPlan(req.profile, req.goal, req.targetSec), actions: [] };
}

const km1 = (m: number) => Math.round(m / 100) / 10;

function relTime(sec: number) {
  const a = Math.abs(Math.round(sec / 60));
  if (a < 1) return "level";
  return `${fmtHm(a * 60)} ${sec > 0 ? "behind" : "ahead"}`;
}

export function projectFromLive(ctx: ToolContext, effort?: number, extraStopSec = 0) {
  const { live, profile } = ctx.req;
  const i = Math.min(N_POINTS - 1, Math.ceil(live.d / STEP_M));
  const e = clamp(effort ?? live.effort, 0.7, 1.3);
  let cond = (1 / e) * (1 + 0.06 * live.debt);
  if (live.hp < 20) cond *= 1 + ((20 - live.hp) / 20) * 0.4;
  if (live.status.includes("cramp")) cond *= 1.06;
  const next = nextStation(live.d, (s) => s.kind !== "checkpoint");
  const tl = runTimeline(
    { model: profile.model, effortScale: ctx.plan.effortScale * cond, beta: raceBeta(profile) },
    (st) => (st.id === live.stopAt ? 0 : planStopSec(st) + (next && st.id === next.id ? extraStopSec : 0)),
    { fromIdx: i, fromT: live.t, skipStopAtFrom: live.stopAt !== null },
  );
  const arrivals: Record<string, number> = {};
  for (const st of course.aidStations) {
    const idx = Math.round((st.km * 1000) / STEP_M);
    if (idx >= i) arrivals[st.id] = tl.arrive[idx];
  }
  return { finishSec: tl.finishSec, arrivals };
}

function cutoffOutlook(ctx: ToolContext, arrivals: Record<string, number>, count = 2) {
  const out: { station: string; cutoff: string; eta: string; margin: string; margin_min: number }[] = [];
  for (const st of course.aidStations) {
    if (st.cutoffSec === null || arrivals[st.id] === undefined) continue;
    const m = st.cutoffSec - arrivals[st.id];
    out.push({ station: st.name, cutoff: st.cutoff ?? "", eta: fmtClock(arrivals[st.id]), margin: fmtHm(Math.max(0, m)), margin_min: Math.round(m / 60) });
    if (out.length >= count) break;
  }
  return out;
}

export function getCourseAhead(ctx: ToolContext, args: { distance_km?: number }) {
  const { live } = ctx.req;
  const dist = clamp(Number(args.distance_km) || 5, 1, 25);
  const d = live.d;
  const terrain = terrainAhead(d, dist * 1000).slice(0, 6);
  const aid = nextStation(d, (s) => s.kind !== "checkpoint");
  const proj = projectFromLive(ctx);
  const gym = climbAt(d) ?? nextClimb(d);
  const res: Record<string, unknown> = {
    position: {
      km: km1(d),
      elevation_m: Math.round(eleAt(d)),
      grade_pct: Math.round(gradeAt(d) * 1000) / 10,
      clock: fmtClock(live.t),
      dark: isNight(live.t),
    },
    terrain_ahead: terrain.map((c) => ({
      kind: c.kind,
      from_km: c.fromKm,
      to_km: c.toKm,
      gain_m: c.gain,
      loss_m: c.loss,
      avg_grade_pct: c.avgGradePct,
    })),
    section_note: legNoteAt(d),
  };
  if (aid) {
    res.next_aid = {
      name: aid.name,
      km_away: km1(stationD(aid) - d),
      services: aid.services,
      crew_access: aid.crew,
      drop_bag: aid.dropBag,
      cutoff: aid.cutoff,
      planned_arrival: fmtClock(timeAtDistance(ctx.plan.timeline, stationD(aid))),
      projected_arrival: proj.arrivals[aid.id] ? fmtClock(proj.arrivals[aid.id]) : null,
      planned_stop_min: Math.round(planStopSec(aid) / 60),
    };
  }
  const cut = nextCutoffStation(d);
  if (cut && proj.arrivals[cut.id] !== undefined && cut.cutoffSec !== null) {
    res.next_cutoff = {
      name: cut.name,
      cutoff: cut.cutoff,
      projected_arrival: fmtClock(proj.arrivals[cut.id]),
      margin_min: Math.round((cut.cutoffSec - proj.arrivals[cut.id]) / 60),
    };
  }
  if (gym) {
    const inside = d >= climbStartD(gym);
    res.gym = {
      name: gym.name,
      badge: gym.badge,
      status: inside ? `on it, ${km1(climbEndD(gym) - d)} km to the top` : `starts in ${km1(climbStartD(gym) - d)} km`,
      gain_m: gym.gain,
      length_km: gym.lengthKm,
      avg_grade_pct: gym.avgGrade,
      max_grade_pct: gym.maxGrade,
      top_elevation_m: gym.topEle,
      plan_climb_time: fmtHm(timeAtDistance(ctx.plan.timeline, climbEndD(gym)) - timeAtDistance(ctx.plan.timeline, climbStartD(gym))),
      shadow_climb_time: fmtHm(timeAtDistance(ctx.plan.shadow, climbEndD(gym)) - timeAtDistance(ctx.plan.shadow, climbStartD(gym))),
      target_vertical_m_per_h: targetVam(ctx, gym.gain),
    };
  }
  return res;
}

export function targetVam(ctx: ToolContext, gain: number) {
  const { model } = ctx.req.profile;
  const fatigue = Math.pow(1 + ctx.req.live.t / 3600 / 2, raceBeta(ctx.req.profile));
  const v = (model.vamSteep / fatigue / ctx.plan.effortScale) * (gain > 600 ? 0.9 : 0.95);
  return Math.round(v / 10) * 10;
}

const TOPICS: Record<string, PatternId[]> = {
  pacing: ["fast_start", "late_fade", "ultra_rookie"],
  climbing: ["climb_overreach"],
  descending: ["cautious_descent"],
  fueling: ["fuel_fade", "hr_drift"],
  aid_stations: ["aid_linger"],
  night: ["night_rookie"],
};

export function getPersonalPatterns(ctx: ToolContext, args: { topic?: string }) {
  const { profile } = ctx.req;
  const topic = String(args.topic ?? "all");
  const ids = TOPICS[topic];
  const patterns = profile.patterns
    .filter((p) => !ids || ids.includes(p.id))
    .map((p) => ({
      pattern: p.title,
      shadow_move: p.move,
      severity: Math.round(p.severity * 100) / 100,
      source: p.confidence === "data" ? "measured in Garmin history" : "inferred (no data yet)",
      evidence: p.evidence,
      advice: p.advice,
    }));
  return {
    runner: profile.name,
    type: profile.type.name,
    numbers: {
      flat_long_run_pace: `${fmtPace(profile.model.flatPace)}/km`,
      steep_climb_vertical_speed: `${Math.round(profile.model.vamSteep)} m/h`,
      descent_vs_typical: `${Math.round((profile.model.descentFactor - 1) * 100)}%`,
      longest_run: `${profile.totals.longestKm.toFixed(0)} km in ${fmtDuration(profile.totals.longestH * 3600)}`,
      fade_onset: profile.fadeOnsetH ? fmtDuration(profile.fadeOnsetH * 3600) : null,
    },
    patterns: patterns.length ? patterns : [{ pattern: "none", evidence: `No ${topic} problems found in the Garmin history.` }],
  };
}

export function getRaceStatus(ctx: ToolContext) {
  const { live } = ctx.req;
  const proj = projectFromLive(ctx);
  return {
    clock: fmtClock(live.t),
    elapsed: fmtDuration(live.t),
    km: km1(live.d),
    km_to_go: km1(course.totalKm * 1000 - live.d),
    energy_hp: Math.round(live.hp),
    status_effects: live.status,
    effort_setting: Math.round(live.effort * 100) / 100,
    fatigue_debt: Math.round(live.debt * 100) / 100,
    vs_plan: relTime(live.planDeltaSec),
    shadow: live.shadowGapSec >= 0 ? `${fmtHm(live.shadowGapSec)} behind you` : `${fmtHm(-live.shadowGapSec)} ahead of you`,
    gels_eaten: live.gels,
    last_gel_min_ago: Math.round(live.lastGelAgoMin),
    projected_finish: `${fmtDuration(proj.finishSec)} (${fmtClock(proj.finishSec)})`,
    plan_finish: fmtDuration(ctx.plan.timeline.finishSec),
    shadow_finish: fmtDuration(ctx.plan.shadow.finishSec),
    time_limit: "30:00 (Sun 05:00)",
    cutoffs: cutoffOutlook(ctx, proj.arrivals),
    badges: live.badges,
  };
}

export function replan(
  ctx: ToolContext,
  args: { reason?: string; effort_change_pct?: number; extra_stop_min?: number; duration_min?: number },
) {
  const pct = clamp(Number(args.effort_change_pct) || 0, -20, 15);
  const duration = clamp(Number(args.duration_min) || 30, 5, 240);
  const extra = clamp(Number(args.extra_stop_min) || 0, 0, 30) * 60;
  const before = projectFromLive(ctx);
  const effort = clamp(ctx.req.live.effort * (1 + pct / 100), 0.75, 1.2);
  const after = projectFromLive(ctx, effort, extra);
  if (pct !== 0)
    ctx.actions.push({ type: "set_effort", value: Math.round(effort * 100) / 100, reason: String(args.reason ?? ""), durationMin: duration });
  return {
    reason: args.reason ?? "",
    new_effort: Math.round(effort * 100) / 100,
    for_minutes: pct !== 0 ? duration : 0,
    projected_finish_before: fmtDuration(before.finishSec),
    projected_finish_after: fmtDuration(after.finishSec),
    change: `${after.finishSec >= before.finishSec ? "+" : "-"}${fmtHm(Math.abs(after.finishSec - before.finishSec))}`,
    cutoffs_after: cutoffOutlook(ctx, after.arrivals),
    within_time_limit: after.finishSec < course.timeLimitSec,
  };
}

export const TOOL_DECLARATIONS = [
  {
    name: "get_course_ahead",
    description:
      "Terrain, next aid station, next cut-off and the next climb ('gym') ahead of the runner on the Lavaredo course, with planned and projected arrival times.",
    parameters: {
      type: "object",
      properties: { distance_km: { type: "number", description: "How far ahead to look, 1-25 km." } },
    },
  },
  {
    name: "get_personal_patterns",
    description:
      "The runner's habits and weaknesses measured from their Garmin history (with evidence), plus key numbers like flat pace and climbing speed.",
    parameters: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          enum: ["pacing", "climbing", "descending", "fueling", "aid_stations", "night", "all"],
        },
      },
      required: ["topic"],
    },
  },
  {
    name: "get_race_status",
    description: "Live status: clock, energy (HP), status effects, gap to plan and to the shadow rival, projected finish and cut-off margins.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "replan",
    description:
      "Recompute the projected finish and cut-off margins if the runner changes effort (percent) or adds stop time. Applies the new effort if the runner follows advice.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string" },
        effort_change_pct: { type: "number", description: "-20 to +15. Negative = ease off." },
        duration_min: { type: "number", description: "How long the effort change lasts, 5-240 minutes (default 30)." },
        extra_stop_min: { type: "number", description: "Extra minutes at the next aid station." },
      },
      required: ["reason"],
    },
  },
  {
    name: "speak",
    description: "Say something to the runner through their earbuds. Ends your turn.",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "One or two short spoken sentences, max 40 words, concrete numbers, no markdown." },
        tone: { type: "string", enum: ["calm", "urgent", "celebrate"] },
        actions: {
          type: "array",
          items: { type: "string", enum: ["eat", "salt", "caffeine", "layer_up", "quick_aid", "pace_climb", "easy_start"] },
          description:
            "What you are telling the runner to do now. pace_climb = climb the next gym evenly instead of attacking it; easy_start = hold back in the first 25 km; quick_aid = short stop at the next aid station.",
        },
      },
      required: ["message", "tone"],
    },
  },
  {
    name: "stay_silent",
    description: "Decide not to interrupt the runner because nothing needs attention. Ends your turn.",
    parameters: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
    },
  },
];

export function runTool(ctx: ToolContext, name: string, args: Record<string, unknown>) {
  switch (name) {
    case "get_course_ahead":
      return getCourseAhead(ctx, args as { distance_km?: number });
    case "get_personal_patterns":
      return getPersonalPatterns(ctx, args as { topic?: string });
    case "get_race_status":
      return getRaceStatus(ctx);
    case "replan":
      return replan(ctx, args as { reason?: string; effort_change_pct?: number; extra_stop_min?: number; duration_min?: number });
    default:
      return { error: `unknown tool ${name}` };
  }
}
