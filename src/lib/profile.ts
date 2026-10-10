import type { Activity } from "@/lib/garmin";
import { clamp, minettiRatio, defaultDownRatio, paceRatio, type PaceModel } from "@/lib/cost";
import { fmtPace, fmtDuration } from "@/lib/format";

export type PatternId =
  | "fast_start"
  | "climb_overreach"
  | "late_fade"
  | "fuel_fade"
  | "aid_linger"
  | "cautious_descent"
  | "hr_drift"
  | "ultra_rookie"
  | "night_rookie";

export type Pattern = {
  id: PatternId;
  title: string;
  /** move name the Shadow uses in battle text */
  move: string;
  severity: number;
  confidence: "data" | "prior";
  evidence: string;
  advice: string;
};

export type ActivitySummary = {
  id: string;
  name: string;
  date: number;
  km: number;
  hours: number;
  gain: number;
  fadePct: number | null;
  fastStartPct: number | null;
};

export type TrainerStats = {
  speed: number;
  climb: number;
  descent: number;
  stamina: number;
  resilience: number;
  night: number;
};

export type RunnerProfile = {
  name: string;
  source: "garmin" | "sample";
  activityCount: number;
  dateRange: { from: number; to: number };
  totals: {
    km: number;
    gain: number;
    hours: number;
    longestKm: number;
    longestH: number;
    maxGain: number;
    nightRuns: number;
    trailShare: number;
  };
  model: PaceModel;
  patterns: Pattern[];
  stats: TrainerStats;
  type: { id: string; name: string; blurb: string };
  level: number;
  avgStopMin: number | null;
  fadeOnsetH: number | null;
  hrDriftPct: number | null;
  highlights: string[];
  activities: ActivitySummary[];
};

type Chunk = {
  dist: number;
  moving: number;
  grade: number;
  pace: number;
  /** elapsed seconds (incl. stops) at chunk start */
  t0: number;
  /** fraction of activity distance at chunk start */
  f0: number;
  dEle: number;
  hr: number | null;
};

type Analysed = {
  a: Activity;
  km: number;
  hours: number;
  movingH: number;
  gain: number;
  chunks: Chunk[];
  stops: number[];
  isNight: boolean;
};

const CHUNK_M = 200;

function median(xs: number[]) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function quantile(xs: number[], q: number) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

function smoothEle(a: Activity): (number | null)[] {
  const pts = a.points;
  const hasEle = pts.filter((p) => p.ele !== null).length > pts.length * 0.8;
  if (!hasEle) return pts.map(() => null);
  const out: (number | null)[] = [];
  let lo = 0;
  let hi = 0;
  let sum = 0;
  let cnt = 0;
  for (let i = 0; i < pts.length; i++) {
    const t = pts[i].t;
    while (hi < pts.length && pts[hi].t <= t + 20) {
      if (pts[hi].ele !== null) {
        sum += pts[hi].ele as number;
        cnt++;
      }
      hi++;
    }
    while (pts[lo].t < t - 20) {
      if (pts[lo].ele !== null) {
        sum -= pts[lo].ele as number;
        cnt--;
      }
      lo++;
    }
    out.push(cnt ? sum / cnt : null);
  }
  return out;
}

function analyseActivity(a: Activity): Analysed {
  const pts = a.points;
  const ele = smoothEle(a);
  const chunks: Chunk[] = [];
  const stops: number[] = [];
  const total = pts[pts.length - 1].d;
  let gain = 0;
  let stopRun = 0;
  let chunkStart = 0;
  let moving = 0;
  let hrSum = 0;
  let hrCnt = 0;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[i - 1];
    const dt = p.t - q.t;
    const dd = p.d - q.d;
    const speed = dt > 0 ? dd / dt : 0;
    const isMoving = dt > 0 && speed >= 0.55 && speed < 8;
    if (isMoving) {
      moving += dt;
      if (stopRun >= 60) stops.push(stopRun);
      stopRun = 0;
    } else {
      stopRun += dt;
    }
    if (ele[i] !== null && ele[i - 1] !== null) gain += Math.max(0, (ele[i] as number) - (ele[i - 1] as number));
    if (p.hr) {
      hrSum += p.hr;
      hrCnt++;
    }
    if (p.d - pts[chunkStart].d >= CHUNK_M) {
      const s = pts[chunkStart];
      const dist = p.d - s.d;
      const e0 = ele[chunkStart];
      const e1 = ele[i];
      const dEle = e0 !== null && e1 !== null ? e1 - e0 : 0;
      const pace = moving > 0 ? moving / (dist / 1000) : NaN;
      if (Number.isFinite(pace) && pace > 150 && pace < 2400) {
        chunks.push({
          dist,
          moving,
          grade: dEle / dist,
          pace,
          t0: s.t,
          f0: s.d / total,
          dEle,
          hr: hrCnt ? hrSum / hrCnt : null,
        });
      }
      chunkStart = i;
      moving = 0;
      hrSum = 0;
      hrCnt = 0;
    }
  }
  if (stopRun >= 60) stops.push(stopRun);
  const start = new Date(a.startMs);
  const hours = pts[pts.length - 1].t / 3600;
  const startH = start.getHours() + start.getMinutes() / 60;
  const endH = (startH + hours) % 24;
  const isNight = startH >= 20.5 || startH < 4.5 || (startH + hours >= 24.5) || (endH > 22 && hours > 1);
  return {
    a,
    km: total / 1000,
    hours,
    movingH: chunks.reduce((s, c) => s + c.moving, 0) / 3600,
    gain,
    chunks,
    stops,
    isNight,
  };
}

function fitModel(all: Analysed[]): PaceModel & { gapOf: (c: Chunk) => number } {
  const chunks = all.flatMap((x) => x.chunks.filter((c) => c.f0 * x.km > 1));
  const flat = chunks.filter((c) => Math.abs(c.grade) < 0.02).map((c) => c.pace);
  let flatPace = flat.length >= 20 ? quantile(flat, 0.45) : NaN;
  if (!Number.isFinite(flatPace)) {
    const est = chunks.map((c) => c.pace / (c.grade >= 0 ? 1 + 0.8 * (minettiRatio(c.grade) - 1) : defaultDownRatio(c.grade)));
    flatPace = median(est);
  }
  if (!Number.isFinite(flatPace)) flatPace = 390;
  flatPace = clamp(flatPace, 240, 720);

  const ups = chunks.filter((c) => c.grade >= 0.03 && c.grade <= 0.4);
  let kUp = 0.8;
  if (ups.length >= 12) {
    let sxy = 0;
    let sxx = 0;
    for (const c of ups) {
      const x = minettiRatio(c.grade) - 1;
      const y = c.pace / flatPace - 1;
      sxy += x * y;
      sxx += x * x;
    }
    kUp = clamp(sxy / sxx, 0.45, 1.3);
  }

  const downs = chunks.filter((c) => c.grade <= -0.04 && c.grade >= -0.4);
  let descentFactor = 1.05;
  if (downs.length >= 12) descentFactor = clamp(median(downs.map((c) => c.pace / flatPace / defaultDownRatio(c.grade))), 0.8, 1.5);

  const steep = chunks.filter((c) => c.grade > 0.12).map((c) => (c.dEle / c.moving) * 3600);
  const modelVam = (0.2 * 1000 * 3600) / (flatPace * (1 + kUp * (minettiRatio(0.2) - 1)));
  const vamSteep = steep.length >= 8 ? clamp(median(steep), 250, 1500) : modelVam;

  const traily = all.filter((x) => x.gain / Math.max(1, x.km) > 25 || /trail/i.test(x.a.sport)).length;
  const trailShare = all.length ? traily / all.length : 0;
  const trailFactor = 1.18 - 0.1 * trailShare;

  const gapOf = (c: Chunk) => c.pace / paceRatio(c.grade, { kUp, descentFactor });
  return { flatPace, kUp, descentFactor, vamSteep, fadeBeta: 0.15, trailFactor, gapOf };
}

type LongRunStats = {
  x: Analysed;
  fade: number;
  fastStart: number;
  onsetH: number | null;
  drift: number | null;
};

function longRunStats(x: Analysed, gapOf: (c: Chunk) => number): LongRunStats {
  const cs = x.chunks;
  const gaps = cs.map(gapOf);
  const med = median(gaps);
  const early = cs.map((c, i) => (c.f0 >= 0.1 && c.f0 < 0.35 ? gaps[i] : NaN)).filter(Number.isFinite);
  const late = cs.map((c, i) => (c.f0 >= 0.75 ? gaps[i] : NaN)).filter(Number.isFinite);
  const fade = early.length && late.length ? mean(late) / mean(early) - 1 : 0;
  const start = cs.map((c, i) => (c.t0 >= 300 && c.t0 <= 2100 ? gaps[i] : NaN)).filter(Number.isFinite);
  const fastStart = start.length ? 1 - mean(start) / med : 0;

  // Fade onset: first time after 1.5 h that the 20-minute rolling GAP sits 15% above the
  // settled baseline (35-90 min, after any fast start).
  let onsetH: number | null = null;
  const base = median(cs.map((c, i) => (c.t0 > 2100 && c.t0 < 5400 ? gaps[i] : NaN)).filter(Number.isFinite));
  if (Number.isFinite(base) && x.hours > 2.5) {
    for (let i = 0; i < cs.length; i++) {
      if (cs[i].t0 < 5400) continue;
      const win = cs.filter((c, j) => j >= i && c.t0 < cs[i].t0 + 1200).map((_, k) => gaps[i + k]);
      if (win.length >= 3 && mean(win) > base * 1.15) {
        onsetH = cs[i].t0 / 3600;
        break;
      }
    }
  }

  let drift: number | null = null;
  const withHr = cs.filter((c) => c.hr);
  if (withHr.length > cs.length * 0.8) {
    const half = cs.length / 2;
    const eff = (from: number, to: number) =>
      mean(
        cs
          .slice(from, to)
          .map((c, i) => (c.hr ? 1000 / gaps[from + i] / c.hr : NaN))
          .filter(Number.isFinite),
      );
    const e1 = eff(Math.floor(cs.length * 0.1), Math.floor(half));
    const e2 = eff(Math.floor(half), cs.length);
    if (Number.isFinite(e1) && Number.isFinite(e2)) drift = e1 / e2 - 1;
  }
  return { x, fade, fastStart, onsetH, drift };
}

type ClimbStat = { gain: number; vam1: number; vam2: number };

function climbStats(x: Analysed): ClimbStat[] {
  const out: ClimbStat[] = [];
  const cs = x.chunks;
  let i = 0;
  while (i < cs.length) {
    if (cs[i].grade < 0.04) {
      i++;
      continue;
    }
    let j = i;
    let flatRun = 0;
    while (j + 1 < cs.length) {
      if (cs[j + 1].grade >= 0.04) flatRun = 0;
      else if (++flatRun > 1) break;
      j++;
    }
    const seg = cs.slice(i, j + 1).filter((c) => c.grade >= 0.02);
    const gain = seg.reduce((s, c) => s + Math.max(0, c.dEle), 0);
    if (gain >= 150 && seg.length >= 4) {
      let acc = 0;
      const first: Chunk[] = [];
      const second: Chunk[] = [];
      for (const c of seg) {
        (acc < gain / 2 ? first : second).push(c);
        acc += Math.max(0, c.dEle);
      }
      const vam = (xs: Chunk[]) => (xs.reduce((s, c) => s + c.dEle, 0) / xs.reduce((s, c) => s + c.moving, 0)) * 3600;
      if (first.length && second.length) out.push({ gain, vam1: vam(first), vam2: vam(second) });
    }
    i = j + 1;
  }
  return out;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const score = (v: number, lo: number, hi: number) => Math.round(clamp(((v - lo) / (hi - lo)) * 90 + 10, 5, 100));

export function buildProfile(activities: Activity[], opts: { name?: string; source: "garmin" | "sample" }): RunnerProfile {
  const all = activities.map(analyseActivity).filter((x) => x.chunks.length >= 8);
  if (!all.length) throw new Error("No usable runs found. Upload running activities with GPS and timestamps.");
  const model = fitModel(all);
  const long = all.filter((x) => x.movingH >= 1.6).map((x) => longRunStats(x, model.gapOf));
  const climbs = all.filter((x) => x.movingH >= 1.2).flatMap(climbStats);

  const totals = {
    km: all.reduce((s, x) => s + x.km, 0),
    gain: all.reduce((s, x) => s + x.gain, 0),
    hours: all.reduce((s, x) => s + x.hours, 0),
    longestKm: Math.max(...all.map((x) => x.km)),
    longestH: Math.max(...all.map((x) => x.hours)),
    maxGain: Math.max(...all.map((x) => x.gain)),
    nightRuns: all.filter((x) => x.isNight).length,
    trailShare: all.filter((x) => x.gain / Math.max(1, x.km) > 25 || /trail/i.test(x.a.sport)).length / all.length,
  };

  const fades = long.map((l) => l.fade);
  const medFade = fades.length ? median(fades) : 0;
  const onsets = long.map((l) => l.onsetH).filter((v): v is number => v !== null && v >= 1.6 && v <= 5);
  const drifts = long.map((l) => l.drift).filter((v): v is number => v !== null);
  const longStops = all.filter((x) => x.hours >= 2.5).flatMap((x) => x.stops);
  const avgStopMin = longStops.length >= 3 ? mean(longStops) / 60 : null;

  // Fatigue exponent from long-run fade (early ~25%, late ~87% of duration).
  if (long.length) {
    const T = median(long.map((l) => l.x.hours));
    const ratio = Math.log((1 + (0.875 * T) / 2) / (1 + (0.25 * T) / 2));
    model.fadeBeta = clamp(Math.log(1 + Math.max(0.02, medFade)) / ratio, 0.12, 0.3);
  } else model.fadeBeta = 0.17;

  const patterns: Pattern[] = [];
  const fastStarters = long.filter((l) => l.fastStart >= 0.035 && l.fade >= 0.05);
  if (long.length && fastStarters.length >= Math.max(1, Math.ceil(long.length * 0.35))) {
    const fs = mean(fastStarters.map((l) => l.fastStart));
    const fd = mean(fastStarters.map((l) => l.fade));
    patterns.push({
      id: "fast_start",
      title: "Starts too fast",
      move: "Fast Start",
      severity: clamp((fs - 0.02) / 0.08 + (fd - 0.05) / 0.25, 0.25, 1),
      confidence: "data",
      evidence: `In ${fastStarters.length} of ${long.length} long runs your first 30 minutes were ${pct(fs)} faster than your average effort, then you faded ${pct(fd)} at the end.`,
      advice: `Hold the first hour at ${fmtPace(model.flatPace * 1.08)}/km on the flat or slower, even if it feels silly.`,
    });
  }

  const overreach = climbs.filter((c) => c.vam2 < c.vam1 * 0.88);
  if (climbs.length >= 2 && overreach.length >= Math.max(2, Math.ceil(climbs.length * 0.4))) {
    const v1 = mean(overreach.map((c) => c.vam1));
    const v2 = mean(overreach.map((c) => c.vam2));
    patterns.push({
      id: "climb_overreach",
      title: "Attacks long climbs, then stalls",
      move: "Reckless Climb",
      severity: clamp((1 - v2 / v1 - 0.08) / 0.2, 0.25, 1),
      confidence: "data",
      evidence: `On ${overreach.length} of ${climbs.length} long climbs your vertical speed dropped from ${Math.round(v1)} to ${Math.round(v2)} m/h in the second half.`,
      advice: `Start every big climb at about ${Math.round(((v1 + v2) / 2) * 0.95)} m/h and hike from the first steep ramp.`,
    });
  }

  if (long.length && medFade >= 0.07) {
    patterns.push({
      id: "late_fade",
      title: "Fades in the last quarter",
      move: "Late Fade",
      severity: clamp((medFade - 0.05) / 0.2, 0.25, 1),
      confidence: "data",
      evidence: `Your grade-adjusted pace in the last quarter of long runs is ${pct(medFade)} slower than in the first quarter.`,
      advice: "Bank energy, not minutes: an even effort now is worth more than time gained early.",
    });
  }

  if (onsets.length >= 2 || (onsets.length === 1 && long.length <= 2)) {
    const onset = median(onsets);
    patterns.push({
      id: "fuel_fade",
      title: "Runs out of fuel",
      move: "Empty Tank",
      severity: clamp(0.4 + (4 - onset) * 0.2, 0.3, 1),
      confidence: "data",
      evidence: `Your pace drops sharply about ${fmtDuration(onset * 3600)} into long runs (${onsets.length} runs), a classic under-fuelling signature.`,
      advice: "Eat 60 to 80 g of carbs per hour from the first hour. A gel every 30 to 40 minutes, no skipping.",
    });
  }

  if (avgStopMin !== null && avgStopMin >= 3.5) {
    patterns.push({
      id: "aid_linger",
      title: "Lingers at aid stations",
      move: "Aid Camp",
      severity: clamp((avgStopMin - 2) / 8, 0.25, 1),
      confidence: "data",
      evidence: `In long runs you stopped ${longStops.length} times for ${avgStopMin.toFixed(1)} minutes on average.`,
      advice: "Walk in with a plan: bottles out, eat while walking out. Aim for 3 minutes at normal aid stations.",
    });
  }

  if (model.descentFactor >= 1.12) {
    patterns.push({
      id: "cautious_descent",
      title: "Brakes on descents",
      move: "Brake Step",
      severity: clamp((model.descentFactor - 1.05) / 0.3, 0.2, 1),
      confidence: "data",
      evidence: `On descents steeper than 4% you are ${pct(model.descentFactor - 1)} slower than typical for your flat speed.`,
      advice: "Quick light steps, eyes 3 metres ahead, and let gravity work on the runnable descents.",
    });
  }

  if (drifts.length >= 2 && median(drifts) >= 0.07) {
    patterns.push({
      id: "hr_drift",
      title: "Heart rate drifts late",
      move: "Overheat",
      severity: clamp((median(drifts) - 0.05) / 0.15, 0.2, 1),
      confidence: "data",
      evidence: `At the same effort your heart rate is ${pct(median(drifts))} higher in the second half of long runs.`,
      advice: "Drink to thirst plus electrolytes, and cool down at every fountain when it gets hot.",
    });
  }

  if (totals.longestH < 8) {
    patterns.push({
      id: "ultra_rookie",
      title: "Never been this far",
      move: "Wall",
      severity: clamp((8 - totals.longestH) / 6, 0.3, 0.9),
      confidence: "prior",
      evidence: `Your longest run is ${fmtDuration(totals.longestH * 3600)} and ${totals.longestKm.toFixed(0)} km. Lavaredo will take you three to four times longer.`,
      advice: "Everything after hour 8 is new territory, so the first half must feel easy.",
    });
  }

  if (totals.nightRuns === 0) {
    patterns.push({
      id: "night_rookie",
      title: "No night running yet",
      move: "Sleepwalk",
      severity: 0.5,
      confidence: "prior",
      evidence: "None of your runs were in the dark. Lavaredo starts at 23:00 and the first 6 hours are by headlamp.",
      advice: "Plan caffeine for 02:30, keep eating at night, and expect the low point before dawn.",
    });
  }

  patterns.sort((a, b) => (a.confidence === b.confidence ? b.severity - a.severity : a.confidence === "data" ? -1 : 1));

  const resilience = clamp(
    100 - Math.max(0, medFade) * 250 - (patterns.some((p) => p.id === "fuel_fade") ? 15 : 0),
    10,
    100,
  );
  const stats: TrainerStats = {
    speed: score(-model.flatPace, -600, -270),
    climb: score(model.vamSteep, 350, 1100),
    descent: score(-model.descentFactor, -1.5, -0.8),
    stamina: score(totals.longestH, 1, 9),
    resilience: Math.round(resilience),
    night: totals.nightRuns ? Math.min(100, 30 + totals.nightRuns * 15) : 12,
  };

  const typeChoices = [
    { id: "ridge", name: "Ridge type", stat: stats.climb, blurb: "Climbs like a chamois. Watch the descents." },
    { id: "scree", name: "Scree type", stat: stats.descent, blurb: "Flies downhill. Must protect the quads." },
    { id: "diesel", name: "Diesel type", stat: (stats.stamina + stats.resilience) / 2, blurb: "A steady engine that never stops." },
    { id: "spark", name: "Spark type", stat: stats.speed, blurb: "Fast legs, short fuse: the classic fast starter." },
  ];
  const type = typeChoices.reduce((a, b) => (b.stat > a.stat ? b : a));

  const level = Math.round(clamp(totals.km / 25 + totals.longestH * 2 + totals.gain / 2000, 5, 99));

  const highlights = [
    `Flat long-run pace ${fmtPace(model.flatPace)}/km`,
    `Steep climbing ${Math.round(model.vamSteep)} m/h`,
    `Descents ${model.descentFactor >= 1 ? `${pct(model.descentFactor - 1)} slower` : `${pct(1 - model.descentFactor)} faster`} than typical`,
    `Longest run ${totals.longestKm.toFixed(1)} km in ${fmtDuration(totals.longestH * 3600)}`,
  ];

  const summaries: ActivitySummary[] = all
    .map((x) => {
      const l = long.find((y) => y.x === x);
      return {
        id: x.a.id,
        name: x.a.name,
        date: x.a.startMs,
        km: x.km,
        hours: x.hours,
        gain: x.gain,
        fadePct: l ? l.fade * 100 : null,
        fastStartPct: l ? l.fastStart * 100 : null,
      };
    })
    .sort((a, b) => b.date - a.date);

  const { gapOf: _gapOf, ...paceModel } = model;
  void _gapOf;
  return {
    name: opts.name ?? "You",
    source: opts.source,
    activityCount: all.length,
    dateRange: { from: Math.min(...all.map((x) => x.a.startMs)), to: Math.max(...all.map((x) => x.a.startMs)) },
    totals,
    model: paceModel,
    patterns,
    stats,
    type: { id: type.id, name: type.name, blurb: type.blurb },
    level,
    avgStopMin,
    fadeOnsetH: onsets.length ? median(onsets) : null,
    hrDriftPct: drifts.length ? median(drifts) * 100 : null,
    highlights,
    activities: summaries,
  };
}

export function patternById(p: RunnerProfile, id: PatternId) {
  return p.patterns.find((x) => x.id === id) ?? null;
}
