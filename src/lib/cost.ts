export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Minetti et al. (2002) energy cost of running on a gradient, relative to flat. */
export function minettiRatio(g: number) {
  const x = clamp(g, -0.45, 0.45);
  const c = 155.4 * x ** 5 - 30.4 * x ** 4 - 43.3 * x ** 3 + 46.3 * x ** 2 + 19.5 * x + 3.6;
  return c / 3.6;
}

/** Typical trail-runner pace ratio on descents (faster on gentle grades, braking on steep ones). */
export function defaultDownRatio(g: number) {
  const a = Math.min(0.45, Math.abs(g));
  return Math.max(0.86, 1 - 2.0 * a + 9 * a * a);
}

export type PaceModel = {
  /** s/km on flat ground at easy long-run effort */
  flatPace: number;
  /** how strongly the runner slows on climbs relative to the Minetti cost curve */
  kUp: number;
  /** >1 means slower than typical on descents */
  descentFactor: number;
  /** vertical metres per hour on grades steeper than 12% */
  vamSteep: number;
  /** fatigue exponent, see fatigueFactor */
  fadeBeta: number;
  /** extra time for technical mountain trail compared with the runner's own data */
  trailFactor: number;
};

export function paceRatio(g: number, m: Pick<PaceModel, "kUp" | "descentFactor">) {
  if (g >= 0) return 1 + m.kUp * (minettiRatio(g) - 1);
  const blend = Math.min(1, Math.abs(g) / 0.08);
  return defaultDownRatio(g) * (1 + (m.descentFactor - 1) * blend);
}

/** Pace multiplier after `hours` of running: (1 + t/2h)^beta. */
export function fatigueFactor(hours: number, beta: number) {
  return Math.pow(1 + Math.max(0, hours) / 2, beta);
}
