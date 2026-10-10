import { course, nextStation, stationD, climbStartD, climbEndD, rangeStats, localClockSec, TOTAL_M } from "@/lib/course";
import { timeAtDistance, distanceAtTime, type Plan } from "@/lib/plan";
import { fmtDuration, fmtHm, fmtPace } from "@/lib/format";
import type { CoachAction, CoachRequest, CoachResponse, CoachStep } from "@/lib/coach/types";
import {
  getCourseAhead,
  getPersonalPatterns,
  getRaceStatus,
  makeToolContext,
  replan,
  targetVam,
  type ToolContext,
} from "@/lib/coach/tools";

export function describeTrigger(req: CoachRequest) {
  const { trigger, live } = req;
  const station = course.aidStations.find((s) => s.id === trigger.refId);
  const climb = course.climbs.find((c) => c.id === trigger.refId);
  const d = trigger.data ?? {};
  switch (trigger.type) {
    case "race_start":
      return "The race just started in Cortina at 23:00. Give the opening briefing.";
    case "climb_ahead":
      return `The ${climb?.name} climb (gym) starts in about ${((climbStartD(climb!) - live.d) / 1000).toFixed(1)} km.`;
    case "summit":
      return `The runner just topped the ${climb?.name} climb and earned the ${climb?.badge}. Climb took ${fmtHm(Number(d.climbSec))}; plan ${fmtHm(Number(d.planSec))}; shadow ${fmtHm(Number(d.shadowSec))}.`;
    case "aid_ahead":
      return `Approaching the ${station?.name} aid station in about 1.2 km.`;
    case "aid_arrive":
      return `Arrived at ${station?.name}${station?.cutoff ? ` (cut-off ${station.cutoff})` : ""}.`;
    case "pace_drift":
      return `The last 3 km (km ${d.fromKm}-${d.toKm}) were ${Math.abs(Number(d.ratioPct))}% ${Number(d.ratioPct) < 0 ? "faster" : "slower"} than the plan.`;
    case "hp_low":
      return `Energy (HP) dropped to ${d.hp}%.`;
    case "bonk":
      return `Energy (HP) is critical at ${d.hp}%. The runner is bonking.`;
    case "cramp":
      return "The runner reports a calf cramp.";
    case "storm":
      return "A thunderstorm is building over the ridge ahead.";
    case "missed_fuel":
      return "The runner just skipped a planned gel.";
    case "shadow_pass":
      return "The runner just overtook their shadow rival (themselves making their usual mistakes).";
    case "shadow_ahead":
      return "The shadow rival just moved ahead of the runner.";
    case "cutoff_risk":
      return `Projected margin at the ${station?.name} cut-off is only ${Math.round(Number(d.marginSec) / 60)} minutes.`;
    case "night_low":
      return "It is 02:30, the low point of the night.";
    case "sunrise":
      return "The sun is rising over the Dolomites.";
    case "heat":
      return "It is 13:00 on Saturday, the hottest part of the day.";
    case "sunset":
      return "The sun is setting on Saturday evening.";
    case "checkin":
      return "Routine check-in. Only speak if something needs attention.";
    case "finish":
      return `The runner crossed the finish line in ${fmtDuration(Number(d.sec))}.`;
    case "runner_message":
      return `The runner says: "${trigger.text ?? ""}"`;
    default:
      return trigger.type;
  }
}

type Draft = { message: string; tone: CoachResponse["tone"]; actions?: CoachAction[]; silent?: boolean };

const pct = (v: number) => `${Math.round(Math.abs(v) * 100)}%`;

function pick<T>(seed: string, options: T[]): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return options[h % options.length];
}

function call<T>(steps: CoachStep[], tool: string, args: Record<string, unknown>, fn: () => T): T {
  const t0 = Date.now();
  const result = fn();
  steps.push({ tool, args, result, ms: Date.now() - t0 });
  return result;
}

function patternOf(ctx: ToolContext, id: string) {
  return ctx.req.profile.patterns.find((p) => p.id === id) ?? null;
}

function decide(ctx: ToolContext, steps: CoachStep[]): Draft {
  const { req, plan } = ctx;
  const { trigger, live, profile } = req;
  const station = course.aidStations.find((s) => s.id === trigger.refId);
  const climb = course.climbs.find((c) => c.id === trigger.refId);
  const d = trigger.data ?? {};
  const fast = patternOf(ctx, "fast_start");
  const climbP = patternOf(ctx, "climb_overreach");
  const fuel = patternOf(ctx, "fuel_fade");
  const linger = patternOf(ctx, "aid_linger");

  switch (trigger.type) {
    case "race_start": {
      call(steps, "get_personal_patterns", { topic: "pacing" }, () => getPersonalPatterns(ctx, { topic: "pacing" }));
      call(steps, "get_course_ahead", { distance_km: 8 }, () => getCourseAhead(ctx, { distance_km: 8 }));
      const pace = fmtPace(profile.model.flatPace * plan.effortScale * 1.08);
      if (fast) ctx.actions.push({ type: "easy_start" });
      return {
        message: fast
          ? `Lavaredo is on. Your shadow will sprint off with Fast Start, so let it go. Flats at ${pace} or slower and hike the Night Ridge. Gel every 35 minutes.`
          : `Lavaredo is on. First hour should feel too easy: flats at ${pace}, hike the Night Ridge, and a gel every 35 minutes.`,
        tone: "calm",
      };
    }
    case "climb_ahead": {
      if (!climb) break;
      const ahead = call(steps, "get_course_ahead", { distance_km: Math.ceil(climb.lengthKm + 1) }, () =>
        getCourseAhead(ctx, { distance_km: Math.ceil(climb.lengthKm + 1) }),
      );
      call(steps, "get_personal_patterns", { topic: "climbing" }, () => getPersonalPatterns(ctx, { topic: "climbing" }));
      const vam = targetVam(ctx, climb.gain);
      const planT = fmtHm(timeAtDistance(plan.timeline, climbEndD(climb)) - timeAtDistance(plan.timeline, climbStartD(climb)));
      void ahead;
      if (climbP) {
        ctx.actions.push({ type: "pace_climb", climbId: climb.id });
        return {
          message: `${climb.name} gym ahead: ${climb.gain} metres up over ${climb.lengthKm.toFixed(1)} km. You usually attack climbs and stall, so hold ${vam} metres per hour and hike the steep ramps. Plan: ${planT} to the top.`,
          tone: "calm",
        };
      }
      return {
        message: `${climb.name} gym ahead: ${climb.gain} metres up, max ${Math.round(climb.maxGrade)}%. Settle at about ${vam} metres per hour; plan has you on top in ${planT}.`,
        tone: "calm",
      };
    }
    case "summit": {
      if (!climb) break;
      const status = call(steps, "get_race_status", {}, () => getRaceStatus(ctx));
      const climbSec = Number(d.climbSec);
      const shadowSec = Number(d.shadowSec);
      const diff = shadowSec - climbSec;
      void status;
      const down = rangeStats(live.d, live.d + 6000);
      const nextAid = nextStation(live.d, (x) => x.services.includes("food"));
      const tail =
        down.loss > 400
          ? `${Math.round(down.loss)} metres of descent next: quick light steps, save the quads.`
          : nextAid && stationD(nextAid) - live.d < 4000
            ? `${nextAid.name} is ${((stationD(nextAid) - live.d) / 1000).toFixed(1)} km away, eat there.`
            : pick(climb.id, ["Back to steady effort and drink.", "Shake out the arms, then steady again.", "Gel now while the legs recover."]);
      return {
        message: `${climb.badge} earned! ${climb.name} in ${fmtHm(climbSec)}${diff > 120 ? `, ${fmtHm(diff)} faster than your shadow` : diff < -120 ? `, but your shadow was ${fmtHm(-diff)} quicker` : ""}. ${tail}`,
        tone: "celebrate",
      };
    }
    case "aid_ahead": {
      if (!station) break;
      call(steps, "get_course_ahead", { distance_km: 2 }, () => getCourseAhead(ctx, { distance_km: 2 }));
      if (linger) call(steps, "get_personal_patterns", { topic: "aid_stations" }, () => getPersonalPatterns(ctx, { topic: "aid_stations" }));
      ctx.actions.push({ type: "quick_aid", stationId: station.id });
      const stop = station.kind === "lifebase" ? 10 : station.services.includes("food") ? 3 : 1;
      if (station.kind === "lifebase") {
        return {
          message: `Cimabanche life base in a kilometre. Drop bag: fresh socks, sunglasses and cap, stash the headlamp, eat a real meal. Out in ${stop} minutes.`,
          tone: "calm",
        };
      }
      const proj = (ctx.req.live.arrivals ?? {})[station.id];
      const cutBit =
        station.cutoffSec !== null && proj !== undefined ? ` Cut-off ${station.cutoff}, you're ${fmtHm(Math.max(0, station.cutoffSec - proj))} ahead.` : "";
      const food = station.services.includes("hot food")
        ? "Hot soup there, take it in a cup and walk out."
        : pick(station.id, [
            "Bottles open before you arrive, grab salty food and eat it walking out.",
            "Refill both flasks, take two handfuls of food, eat on the move.",
            "Bottles out on arrival, something salty and something sweet, then go.",
          ]);
      const lingerBit = linger ? ` You usually stay ${Math.round(profile.avgStopMin ?? 6)} minutes; today ${stop}.` : ` Out in ${stop} minutes.`;
      return {
        message: `${station.name} in 1.2 km. ${food}${lingerBit}${cutBit}`,
        tone: "calm",
      };
    }
    case "aid_arrive": {
      if (!station) break;
      const status = call(steps, "get_race_status", {}, () => getRaceStatus(ctx));
      const cut = status.cutoffs.find((c) => c.station === station.name);
      const planSec = Number(d.planSec);
      const delta = live.t - planSec;
      if (station.cutoffSec !== null) {
        const margin = station.cutoffSec - live.t;
        return {
          message: `${station.name}: ${fmtHm(margin)} ahead of the ${station.cutoff} cut-off, ${Math.abs(delta) < 300 ? "right on plan" : `${fmtHm(Math.abs(delta))} ${delta > 0 ? "behind" : "ahead of"} plan`}. ${margin < 3600 ? "No sitting down." : "Eat, refill, go."}`,
          tone: margin < 3600 ? "urgent" : "calm",
        };
      }
      void cut;
      return { message: "", tone: "calm", silent: true };
    }
    case "pace_drift": {
      const ratio = Number(d.ratioPct);
      call(steps, "get_race_status", {}, () => getRaceStatus(ctx));
      if (ratio < 0) {
        call(steps, "get_personal_patterns", { topic: "pacing" }, () => getPersonalPatterns(ctx, { topic: "pacing" }));
        const args = { reason: "too fast for the plan", effort_change_pct: -5, duration_min: 45 };
        const r = replan(ctx, args);
        steps.push({ tool: "replan", args, result: r });
        return {
          message: `Last 3 km were ${Math.abs(ratio)}% faster than plan. ${fast ? "That's your Fast Start move from your long runs." : "That's money borrowed from the second half."} Ease off 5% now.`,
          tone: "urgent",
        };
      }
      if (live.hp < 45) {
        ctx.actions.push({ type: "eat" });
        return { message: `You're ${ratio}% slower than plan and energy is ${Math.round(live.hp)}%. Eat a gel now, then settle back to steady.`, tone: "calm" };
      }
      return { message: "", tone: "calm", silent: true };
    }
    case "hp_low":
    case "missed_fuel": {
      call(steps, "get_personal_patterns", { topic: "fueling" }, () => getPersonalPatterns(ctx, { topic: "fueling" }));
      call(steps, "get_race_status", {}, () => getRaceStatus(ctx));
      ctx.actions.push({ type: "eat" });
      const onset = profile.fadeOnsetH ? fmtDuration(profile.fadeOnsetH * 3600) : null;
      if (trigger.type === "missed_fuel") {
        return {
          message: `You skipped a gel. ${onset ? `That's how your long runs went flat around ${onset}.` : "That's how bonks start."} Eat it now, and set the next one for 30 minutes.`,
          tone: "urgent",
        };
      }
      return {
        message: `Energy at ${Math.round(live.hp)}%. Gel now and another in 30 minutes${fuel ? `, your Garmin history fades hard when you skip fuel` : ""}.`,
        tone: "urgent",
      };
    }
    case "bonk": {
      call(steps, "get_race_status", {}, () => getRaceStatus(ctx));
      const args = { reason: "bonk recovery", effort_change_pct: -10, duration_min: 40 };
      const r = replan(ctx, args);
      steps.push({ tool: "replan", args, result: r });
      ctx.actions.push({ type: "eat" });
      return {
        message: `You're running on empty. Walk five minutes, two gels and a big drink. New finish estimate ${r.projected_finish_after}, still inside the limit.`,
        tone: "urgent",
      };
    }
    case "cramp": {
      call(steps, "get_course_ahead", { distance_km: 3 }, () => getCourseAhead(ctx, { distance_km: 3 }));
      const args = { reason: "calf cramp", effort_change_pct: -8, duration_min: 30 };
      const r = replan(ctx, args);
      steps.push({ tool: "replan", args, result: r });
      ctx.actions.push({ type: "salt" });
      const next = r.cutoffs_after[0];
      return {
        message: `Cramp: shorten your stride, stop pushing off the toes, salt cap and 300 ml of fluid. Ease off 8% for 30 minutes: finish ${r.projected_finish_after}${next ? `, still ${next.margin} before the ${next.station} cut-off` : ""}.`,
        tone: "urgent",
      };
    }
    case "storm": {
      const ahead = call(steps, "get_course_ahead", { distance_km: 5 }, () => getCourseAhead(ctx, { distance_km: 5 }));
      ctx.actions.push({ type: "layer_up" });
      const aid = ahead.next_aid as { name: string; km_away: number } | undefined;
      return {
        message: `Storm building. Jacket on now, poles away on exposed ground, and keep moving${aid ? ` to ${aid.name}, ${aid.km_away} km ahead` : ""}. Don't stop on the ridge.`,
        tone: "urgent",
      };
    }
    case "shadow_pass": {
      call(steps, "get_race_status", {}, () => getRaceStatus(ctx));
      return {
        message: `You just passed your shadow, the you that ${fast ? "started too fast" : "makes the usual mistakes"}. It's fading behind you. Same effort, no celebration sprint.`,
        tone: "celebrate",
      };
    }
    case "shadow_ahead": {
      const status = call(steps, "get_race_status", {}, () => getRaceStatus(ctx));
      void status;
      if (live.d < 30000) {
        return {
          message: `Your shadow just ran past using ${fast ? "Fast Start" : "its usual tricks"}. Let it go: in your history that pace costs ${fast ? pct(Math.max(0.1, (fast.severity * 0.2))) : "a lot"} later. We'll see it again before dawn.`,
          tone: "calm",
        };
      }
      return { message: "Your shadow slipped ahead. Check your energy: eat, drink, then steady effort. It fades on the next climb.", tone: "calm" };
    }
    case "cutoff_risk": {
      call(steps, "get_race_status", {}, () => getRaceStatus(ctx));
      const margin = Math.round(Number(d.marginSec) / 60);
      const eta = Number(d.etaSec);
      const minutesToGo = Math.max(10, Math.round((eta - live.t) / 60));
      const args = { reason: "cut-off margin", effort_change_pct: 5, duration_min: minutesToGo };
      const r = replan(ctx, args);
      steps.push({ tool: "replan", args, result: r });
      const c = r.cutoffs_after[0];
      return {
        message: `Cut-off alert at ${station?.name ?? "the next station"}: only ${margin} minutes in hand. Run the flats and descents a bit harder until then${c ? ` and you'll have ${c.margin}` : ""}. Short stop only.`,
        tone: "urgent",
      };
    }
    case "night_low": {
      call(steps, "get_personal_patterns", { topic: "night" }, () => getPersonalPatterns(ctx, { topic: "night" }));
      ctx.actions.push({ type: "caffeine" });
      const sunriseT = (course.sunriseLocalSec - 23 * 3600 + 86400) % 86400;
      const offset = live.t - timeAtDistance(plan.timeline, live.d);
      const dAtSunrise = distanceAtTime(plan.timeline, sunriseT - offset);
      const near = [...course.aidStations].sort((a, b) => Math.abs(stationD(a) - dAtSunrise) - Math.abs(stationD(b) - dAtSunrise))[0];
      const hoursLeft = Math.max(1, Math.round((sunriseT - live.t) / 3600));
      return {
        message: `It's ${Math.floor(localClockSec(live.t) / 3600)}:30, the hardest hour. Caffeine gel now and keep eating even if you're not hungry. Sunrise in about ${hoursLeft} hours, near ${near.name}.`,
        tone: "calm",
      };
    }
    case "sunrise":
      return { message: "Sunrise over the Dolomites. Headlamp off at the next stop, sunglasses on, and enjoy this one.", tone: "celebrate" };
    case "heat": {
      call(steps, "get_personal_patterns", { topic: "fueling" }, () => getPersonalPatterns(ctx, { topic: "fueling" }));
      return {
        message: `Midday heat. Half a litre to 750 ml per hour with electrolytes and wet your cap at every stream${profile.hrDriftPct && profile.hrDriftPct > 6 ? ", your heart rate drifts when you overheat" : ""}.`,
        tone: "calm",
      };
    }
    case "sunset":
      return { message: "Sun's going down. Headlamp on before the next climb, jacket within reach.", tone: "calm" };
    case "checkin": {
      const status = call(steps, "get_race_status", {}, () => getRaceStatus(ctx));
      const lastGel = live.lastGelAgoMin;
      const nearFinish = TOTAL_M - live.d < 3000;
      if (nearFinish && live.hp >= 20) {
        return { message: "", tone: "calm", silent: true };
      }
      if (live.hp < 50 || lastGel > 50) {
        ctx.actions.push({ type: "eat" });
        return {
          message: `Quick check: ${lastGel > 50 ? `${Math.round(lastGel)} minutes since your last gel` : `energy ${Math.round(live.hp)}%`}.${fuel ? " That's the habit that flattened your long runs." : ""} Eat something now.`,
          tone: "calm",
        };
      }
      if (live.effort > 1.06 && live.t < 12 * 3600) {
        return { message: "Effort is high for this early. You're borrowing from the last 40 km. Back off a touch.", tone: "calm" };
      }
      void status;
      return { message: "", tone: "calm", silent: true };
    }
    case "finish": {
      const sec = Number(d.sec);
      return {
        message: `You're a Lavaredo finisher in ${fmtDuration(sec)}! Your shadow would still be out there for ${fmtHm(Math.max(0, plan.shadow.finishSec - sec))}.`,
        tone: "celebrate",
      };
    }
    case "runner_message":
      return answerRunner(ctx, steps, trigger.text ?? "");
  }
  return { message: "", tone: "calm", silent: true };
}

function answerRunner(ctx: ToolContext, steps: CoachStep[], text: string): Draft {
  const q = text.toLowerCase();
  const { live } = ctx.req;
  if (/cramp|calf|hamstring|spasm/.test(q)) {
    return decide({ ...ctx, req: { ...ctx.req, trigger: { type: "cramp" } } }, steps);
  }
  if (/aid|station|refuel|water|next|how far|food/.test(q)) {
    const ahead = call(steps, "get_course_ahead", { distance_km: 6 }, () => getCourseAhead(ctx, { distance_km: 6 }));
    const aid = ahead.next_aid as { name: string; km_away: number; projected_arrival: string | null; services: string[] } | undefined;
    if (!aid) return { message: "No more aid stations. Only the finish in Cortina.", tone: "calm" };
    return {
      message: `${aid.name} is ${aid.km_away} km away, about ${aid.projected_arrival} at your current pace. They have ${aid.services.join(", ") || "no services"}.`,
      tone: "calm",
    };
  }
  if (/shadow|rival|chase|catch/.test(q)) {
    const status = call(steps, "get_race_status", {}, () => getRaceStatus(ctx));
    return {
      message:
        live.shadowGapSec >= 0
          ? `Your shadow is ${status.shadow}. Don't race it, just keep the effort even and it keeps fading.`
          : `Your shadow is ${status.shadow}. Don't chase it now: it burns out later. Hold your plan until Col Gallina, then we hunt.`,
      tone: "calm",
    };
  }
  if (/tired|hungry|empty|energy|eat|gel|weak|dizzy/.test(q)) {
    call(steps, "get_personal_patterns", { topic: "fueling" }, () => getPersonalPatterns(ctx, { topic: "fueling" }));
    ctx.actions.push({ type: "eat" });
    return { message: `Energy is ${Math.round(live.hp)}%. Eat a gel and drink now, walk two minutes while it lands, then back to steady effort.`, tone: "calm" };
  }
  if (/pace|fast|slow|push|speed|effort/.test(q)) {
    const status = call(steps, "get_race_status", {}, () => getRaceStatus(ctx));
    return { message: `You're ${status.vs_plan} plan with a projected finish of ${status.projected_finish.split(" ")[0]}. Keep this effort; the time comes back on the last climbs.`, tone: "calm" };
  }
  if (/finish|time|when|cut.?off/.test(q)) {
    const status = call(steps, "get_race_status", {}, () => getRaceStatus(ctx));
    const c = status.cutoffs[0];
    return {
      message: `Projected finish ${status.projected_finish}.${c ? ` Next cut-off ${c.station} at ${c.cutoff}, you're ${c.margin} ahead.` : ""}`,
      tone: "calm",
    };
  }
  const status = call(steps, "get_race_status", {}, () => getRaceStatus(ctx));
  const next = nextStation(live.d, (s) => s.kind !== "checkpoint");
  return {
    message: `Copy that. You're at km ${status.km}, ${status.vs_plan} plan, energy ${status.energy_hp}%.${next ? ` ${next.name} in ${((stationD(next) - live.d) / 1000).toFixed(1)} km.` : ""}`,
    tone: "calm",
  };
}

export function offlineCoach(req: CoachRequest, note?: string, plan?: Plan): CoachResponse {
  const t0 = Date.now();
  const ctx = makeToolContext(req, plan);
  const steps: CoachStep[] = [];
  const draft = decide(ctx, steps);
  const actions = [...ctx.actions, ...(draft.actions ?? [])];
  if (draft.silent) {
    steps.push({ tool: "stay_silent", args: { reason: "Nothing actionable right now" }, result: "ok" });
    return { engine: "offline", decision: "silent", message: "", tone: "calm", actions, steps, latencyMs: Date.now() - t0, note };
  }
  steps.push({ tool: "speak", args: { message: draft.message, tone: draft.tone }, result: "spoken" });
  return { engine: "offline", decision: "speak", message: draft.message, tone: draft.tone, actions, steps, latencyMs: Date.now() - t0, note };
}

