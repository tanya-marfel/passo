// Headless race: sample Garmin history -> profile -> plan -> live sim with the offline coach.
// Usage: npx tsx --tsconfig tsconfig.json scripts/simulate.ts
import { sampleActivities } from "../src/lib/sample";
import { buildProfile } from "../src/lib/profile";
import { buildPlan, timeAtDistance } from "../src/lib/plan";
import { initialSim, stepSim, projectRace, shadowGapSec, isDrowsy, applyCoachActions, type SimEvent } from "../src/lib/sim";
import { offlineCoach } from "../src/lib/coach/offline";
import type { CoachRequest } from "../src/lib/coach/types";
import { fmtClock, fmtDuration } from "../src/lib/format";

const profile = buildProfile(sampleActivities(Date.parse("2026-10-10T08:00:00Z")), { source: "sample", name: "Sample runner" });
const plan = buildPlan(profile, "model");
const s = initialSim();
const ctx = { plan, profile };
const history: CoachRequest["history"] = [];
const { activities: _a, ...coachProfile } = profile;
void _a;

function handle(e: SimEvent) {
  const proj = projectRace(s, ctx);
  const req: CoachRequest = {
    trigger: { type: e.type, refId: e.refId, data: e.data, text: e.type === "runner_message" ? "how far is the next aid station?" : undefined },
    live: {
      t: s.t,
      d: s.d,
      hp: s.hp,
      effort: s.effort,
      debt: s.debt,
      status: [s.cramp && s.t < s.cramp.until ? "cramp" : "", s.storm && s.t < s.storm.until ? "storm" : "", isDrowsy(s, profile) ? "drowsy" : ""].filter(Boolean),
      gels: s.gels,
      lastGelAgoMin: (s.t - s.lastGelT) / 60,
      shadowGapSec: shadowGapSec(s, plan),
      planDeltaSec: s.t - timeAtDistance(plan.timeline, s.d),
      projectedFinishSec: proj.finishSec,
      arrivals: proj.arrivals,
      badges: s.badges.map((b) => b.badge),
      stopAt: s.stopAt,
    },
    profile: coachProfile,
    goal: "model",
    history,
  };
  const res = offlineCoach(req);
  applyCoachActions(s, res.actions);
  const tag = `${fmtClock(s.t)} km ${(s.d / 1000).toFixed(1).padStart(5)} HP ${Math.round(s.hp).toString().padStart(3)}`;
  if (res.decision === "speak") {
    history.push({ role: "coach", text: res.message });
    s.lastCoachT = s.t;
    console.log(`${tag} [${e.type}${e.refId ? ":" + e.refId : ""}] ${res.steps.map((x) => x.tool).join(" > ")}\n    "${res.message}" ${res.actions.length ? JSON.stringify(res.actions) : ""}`);
  } else console.log(`${tag} [${e.type}] (silent)`);
}

handle({ type: "race_start", t: 0, d: 0 });
let injectedCramp = false;
let injectedStorm = false;
while (!s.finished && s.t < 32 * 3600) {
  const evs = stepSim(s, 120, ctx, { checkins: true });
  if (!injectedCramp && s.d > 70000) {
    injectedCramp = true;
    s.cramp = { until: s.t + 25 * 60, relieved: false };
    evs.push({ type: "cramp", t: s.t, d: s.d });
  }
  if (!injectedStorm && s.d > 98000) {
    injectedStorm = true;
    s.storm = { until: s.t + 50 * 60, layered: false };
    evs.push({ type: "storm", t: s.t, d: s.d });
  }
  for (const e of evs) handle(e);
}
console.log(`\nFinish ${fmtDuration(s.t)} (plan ${fmtDuration(plan.timeline.finishSec)}, shadow ${fmtDuration(plan.shadow.finishSec)}), badges ${s.badges.length}, gels ${s.gels}`);
