import type { Activity, ActivityPoint } from "@/lib/garmin";
import { fatigueFactor, paceRatio } from "@/lib/cost";

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Climb = { from: number; to: number; base: number; top: number };

/** Piecewise terrain: climbs, descents and rolling sections at 50 m resolution. */
function terrain(distM: number, gainPerKm: number, rand: () => number) {
  const step = 50;
  const n = Math.ceil(distM / step) + 2;
  const ele: number[] = [500];
  const climbs: Climb[] = [];
  const mountain = gainPerKm > 15;
  while (ele.length < n) {
    const cur = ele[ele.length - 1];
    let len: number;
    let grade: number;
    const r = rand();
    if (!mountain) {
      len = 400 + rand() * 1200;
      grade = (rand() - 0.5) * 0.02;
    } else if (r < 0.45) {
      len = 1500 + rand() * 4000 * (gainPerKm / 45);
      grade = 0.07 + rand() * 0.1 * Math.min(1.4, gainPerKm / 45);
      climbs.push({ from: ele.length * step, to: (ele.length + len / step) * step, base: cur, top: cur + len * grade });
    } else if (r < 0.8) {
      len = 1200 + rand() * 3000;
      grade = -(0.06 + rand() * 0.09);
    } else {
      len = 600 + rand() * 1500;
      grade = (rand() - 0.5) * 0.03;
    }
    const steps = Math.max(1, Math.round(len / step));
    for (let i = 0; i < steps && ele.length < n; i++) ele.push(ele[ele.length - 1] + grade * step + (rand() - 0.5) * 0.6);
  }
  // Keep the course near its start altitude so long runs come back down.
  const drift = (ele[ele.length - 1] - ele[0]) / ele.length;
  for (let i = 0; i < ele.length; i++) ele[i] -= drift * i * 0.85;
  const at = (d: number) => {
    const x = Math.max(0, d) / step;
    const i = Math.min(ele.length - 2, Math.floor(x));
    return ele[i] + (ele[i + 1] - ele[i]) * (x - i);
  };
  const grade = (d: number) => (at(d + 100) - at(d - 100)) / 200;
  return { at, grade, climbs };
}

type Spec = {
  name: string;
  km: number;
  gainPerKm: number;
  daysAgo: number;
  startHour: number;
  race?: boolean;
};

const SPECS: Spec[] = [
  { name: "Sihlwald easy run", km: 12, gainPerKm: 4, daysAgo: 9, startHour: 18.5 },
  { name: "Uetliberg hill loops", km: 18, gainPerKm: 36, daysAgo: 13, startHour: 7.5 },
  { name: "Rigi long run", km: 31, gainPerKm: 46, daysAgo: 20, startHour: 7 },
  { name: "Eiger E35 (race)", km: 35, gainPerKm: 62, daysAgo: 27, startHour: 7, race: true },
  { name: "Zurichsee long run", km: 26, gainPerKm: 3, daysAgo: 34, startHour: 8 },
  { name: "Albis ridge run", km: 24, gainPerKm: 33, daysAgo: 41, startHour: 8 },
  { name: "Swiss Alpine K43 (race)", km: 43, gainPerKm: 44, daysAgo: 48, startHour: 7.5, race: true },
  { name: "Santis training climb", km: 16, gainPerKm: 72, daysAgo: 55, startHour: 9 },
  { name: "Pfannenstiel trail", km: 21, gainPerKm: 30, daysAgo: 62, startHour: 8 },
];

/** A synthetic runner with built-in habits: fast starts, overcooked climbs, a fuelling fade, long aid stops. */
export function sampleActivities(now = Date.now()): Activity[] {
  const truth = { flatPace: 362, kUp: 0.85, descentFactor: 1.16, beta: 0.12 };
  return SPECS.map((spec, k) => {
    const rand = mulberry32(1000 + k * 77);
    const D = spec.km * 1000;
    const terr = terrain(D, spec.gainPerKm, rand);
    const day = new Date(now - spec.daysAgo * 86400000);
    day.setHours(Math.floor(spec.startHour), Math.round((spec.startHour % 1) * 60), 0, 0);
    const points: ActivityPoint[] = [];
    const dt = 10;
    let t = 0;
    let d = 0;
    const long = spec.km >= 28;
    let nextStop = long ? 3600 * (1.05 + rand() * 0.3) : Infinity;
    let noise = 0;
    while (d < D) {
      if (t >= nextStop) {
        const dur = 330 + rand() * 210;
        for (let s = 0; s < dur; s += dt) {
          t += dt;
          points.push({ t, d, ele: terr.at(d), hr: Math.round(112 + rand() * 6) });
        }
        nextStop = t + 3600 * (1.1 + rand() * 0.35);
      }
      const g = terr.grade(d);
      const h = t / 3600;
      let mult = paceRatio(g, truth) * fatigueFactor(h, truth.beta);
      if (t < 1800) mult *= 0.92;
      const climb = terr.climbs.find((c) => d >= c.from && d <= c.to);
      if (climb && climb.top - climb.base > 140) {
        const frac = (terr.at(d) - climb.base) / (climb.top - climb.base);
        mult *= frac < 0.5 ? 0.9 : 1.17;
      }
      if (h > 2.85) mult *= 1.17;
      noise = noise * 0.9 + (rand() - 0.5) * 0.04;
      const pace = truth.flatPace * mult * (1 + noise);
      d += (1000 / pace) * dt;
      t += dt;
      const effort = Math.min(1.25, 1 / Math.max(0.6, mult / paceRatio(g, truth)));
      const hr = 138 + Math.max(0, g) * 120 + (effort - 1) * 40 + h * 2.2 + (rand() - 0.5) * 4;
      points.push({ t, d: Math.min(d, D), ele: terr.at(d) + (rand() - 0.5) * 1.5, hr: Math.round(Math.min(188, hr)) });
    }
    return {
      id: `sample-${k}`,
      name: spec.name,
      sport: spec.gainPerKm > 20 ? "trail_running" : "running",
      startMs: day.getTime(),
      points,
      source: "sample" as const,
    };
  });
}
