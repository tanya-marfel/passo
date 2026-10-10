import { sampleActivities } from "../src/lib/sample";
import { buildProfile } from "../src/lib/profile";
import { buildPlan } from "../src/lib/plan";
import { fmtDuration, fmtPace } from "../src/lib/format";

const acts = sampleActivities(Date.parse("2026-10-10T08:00:00Z"));
const t0 = Date.now();
const p = buildProfile(acts, { source: "sample", name: "Sample runner" });
console.log("profile ms", Date.now() - t0);
console.log(JSON.stringify({ model: p.model, totals: p.totals, stats: p.stats, type: p.type, level: p.level, avgStopMin: p.avgStopMin, onset: p.fadeOnsetH, drift: p.hrDriftPct }, null, 1));
for (const pt of p.patterns) console.log(`- [${pt.confidence}] ${pt.title} (${pt.severity.toFixed(2)}): ${pt.evidence}`);
for (const a of p.activities) console.log(`  ${a.name.padEnd(26)} ${a.km.toFixed(1)} km ${fmtDuration(a.hours*3600)} +${Math.round(a.gain)} fade ${a.fadePct?.toFixed(1)} fs ${a.fastStartPct?.toFixed(1)}`);
const t1 = Date.now();
for (const goal of ["safe", "model", "stretch"] as const) {
  const plan = buildPlan(p, goal);
  console.log(goal, "ms", Date.now() - t1, "finish", fmtDuration(plan.timeline.finishSec), "shadow", fmtDuration(plan.shadow.finishSec), "model", fmtDuration(plan.modelFinishSec), "effort", plan.effortScale.toFixed(3), "beta", plan.beta.toFixed(3));
  if (goal === "model") {
    for (const s of plan.splits) console.log(`   ${s.name.padEnd(24)} ${s.km.toFixed(1).padStart(6)} plan ${fmtDuration(s.planSec)} shadow ${fmtDuration(s.shadowSec)} cutoff ${s.cutoffSec ? fmtDuration(s.cutoffSec) : "-"} margin ${s.marginSec !== null ? fmtDuration(s.marginSec) : "-"}`);
    console.log(plan.shadowMoves, plan.warnings);
  }
}
// sensitivity: different flat paces
for (const fp of [300, 330, 360, 400, 440]) {
  const q = { ...p, model: { ...p.model, flatPace: fp } };
  const plan = buildPlan(q, "model");
  console.log(`flat ${fmtPace(fp)} -> ${fmtDuration(plan.timeline.finishSec)} (shadow ${fmtDuration(plan.shadow.finishSec)})`);
}
