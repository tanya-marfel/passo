import type { Feature, LineString } from "geojson";
import raw from "@/data/lavaredo.json";

export type AidKind = "start" | "aid" | "water" | "checkpoint" | "lifebase" | "finish";

export type AidStation = {
  id: string;
  name: string;
  km: number;
  officialKm: number;
  officialDplus: number;
  officialDminus: number;
  ele: number;
  lat: number;
  lon: number;
  kind: AidKind;
  services: string[];
  crew: boolean;
  dropBag: boolean;
  cutoff: string | null;
  cutoffSec: number | null;
  legNote: string | null;
};

export type Climb = {
  id: string;
  name: string;
  badge: string;
  startKm: number;
  endKm: number;
  gain: number;
  net: number;
  lengthKm: number;
  avgGrade: number;
  maxGrade: number;
  topEle: number;
  baseEle: number;
};

export type CourseData = {
  id: string;
  name: string;
  shortName: string;
  location: string;
  raceDate: string;
  startLocal: string;
  startUtc: string;
  timeZone: string;
  timeLimitSec: number;
  officialDistanceKm: number;
  officialGainM: number;
  totalKm: number;
  trackGainM: number;
  trackLossM: number;
  sunriseLocalSec: number;
  sunsetLocalSec: number;
  source: { gpx: string; page: string; note: string };
  /** True when the line is a sketch from distance and climb, not an official track. */
  estimated?: boolean;
  stepM: number;
  lat: number[];
  lon: number[];
  ele: number[];
  aidStations: AidStation[];
  climbs: Climb[];
};

export let course = raw as CourseData;

export let STEP_M = course.stepM;
export let N_POINTS = course.ele.length;
export let TOTAL_M = (N_POINTS - 1) * STEP_M;
export let START_MS = Date.parse(course.startUtc);
export let GRADE: number[] = [];
let CUM_UP: number[] = [0];
let CUM_DOWN: number[] = [0];
/** Aid station whose snapped course index is i, if any. */
export let stationAtPoint = new Map<number, AidStation>();
export let climbSpans: { c: Climb; a: number; b: number }[] = [];

export type ActiveRace = { id: string; spec?: unknown };
let activeChoice: ActiveRace | null = null;

function recompute() {
  STEP_M = course.stepM || 50;
  N_POINTS = course.ele.length;
  TOTAL_M = Math.max(0, (N_POINTS - 1) * STEP_M);
  START_MS = Date.parse(course.startUtc);
  const g: number[] = [];
  const w = 2;
  for (let i = 0; i < N_POINTS - 1; i++) {
    const a = Math.max(0, i - w);
    const b = Math.min(N_POINTS - 1, i + 1 + w);
    g.push((course.ele[b] - course.ele[a]) / Math.max(1, (b - a) * STEP_M));
  }
  GRADE = g;
  const up = [0];
  const down = [0];
  for (let i = 1; i < N_POINTS; i++) {
    const d = course.ele[i] - course.ele[i - 1];
    up.push(up[i - 1] + Math.max(0, d));
    down.push(down[i - 1] + Math.max(0, -d));
  }
  CUM_UP = up;
  CUM_DOWN = down;
  stationAtPoint = new Map(course.aidStations.map((s) => [Math.round((s.km * 1000) / STEP_M), s]));
  climbSpans = course.climbs.map((c) => ({
    c,
    a: Math.round((c.startKm * 1000) / STEP_M),
    b: Math.round((c.endKm * 1000) / STEP_M),
  }));
}

recompute();

/** Point the sim, plan and coach at a course. Safe to call again with the same object. */
export function activateCourse(next: CourseData, choice: ActiveRace | null = null) {
  if (course !== next) {
    course = next;
    recompute();
  }
  activeChoice = choice;
}

export function activeRace() {
  return activeChoice;
}

export const clampD = (d: number) => Math.max(0, Math.min(TOTAL_M, d));
export const idxAt = (d: number) => Math.min(N_POINTS - 2, Math.max(0, Math.floor(clampD(d) / STEP_M)));

function lerpArr(arr: number[], d: number) {
  const x = clampD(d) / STEP_M;
  const i = Math.min(N_POINTS - 2, Math.floor(x));
  const t = x - i;
  return arr[i] + (arr[i + 1] - arr[i]) * t;
}

export const eleAt = (d: number) => lerpArr(course.ele, d);
export const gradeAt = (d: number) => GRADE[idxAt(d)];
export const lngLatAt = (d: number): [number, number] => [lerpArr(course.lon, d), lerpArr(course.lat, d)];

export function bearingAt(d: number, lookAheadM = 400) {
  const [lon1, lat1] = lngLatAt(d);
  const [lon2, lat2] = lngLatAt(Math.min(TOTAL_M, d + lookAheadM));
  const toRad = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * toRad) * Math.cos(lat2 * toRad);
  const x =
    Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
    Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos((lon2 - lon1) * toRad);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function rangeStats(fromM: number, toM: number) {
  const a = clampD(Math.min(fromM, toM));
  const b = clampD(Math.max(fromM, toM));
  const ia = Math.round(a / STEP_M);
  const ib = Math.round(b / STEP_M);
  const gain = CUM_UP[ib] - CUM_UP[ia];
  const loss = CUM_DOWN[ib] - CUM_DOWN[ia];
  const net = course.ele[ib] - course.ele[ia];
  return { distM: b - a, gain, loss, net, avgGrade: b > a ? net / (b - a) : 0 };
}

export const stationD = (s: AidStation) => s.km * 1000;
export const climbStartD = (c: Climb) => c.startKm * 1000;
export const climbEndD = (c: Climb) => c.endKm * 1000;

export function nextStation(d: number, filter?: (s: AidStation) => boolean) {
  return course.aidStations.find((s) => stationD(s) > d + 1 && (!filter || filter(s))) ?? null;
}

export function prevStation(d: number) {
  let prev: AidStation | null = null;
  for (const s of course.aidStations) if (stationD(s) <= d + 1) prev = s;
  return prev;
}

export function nextCutoffStation(d: number) {
  return nextStation(d, (s) => s.cutoffSec !== null);
}

export function climbAt(d: number) {
  return course.climbs.find((c) => d >= climbStartD(c) && d <= climbEndD(c)) ?? null;
}

export function nextClimb(d: number) {
  return course.climbs.find((c) => climbStartD(c) > d) ?? null;
}

export function legNoteAt(d: number) {
  return nextStation(d)?.legNote ?? null;
}

/** Splits the course ahead into climb / descent / rolling chunks for the coach. */
export function terrainAhead(d: number, distanceM: number) {
  const end = clampD(d + distanceM);
  const chunks: { kind: "climb" | "descent" | "rolling"; fromKm: number; toKm: number; gain: number; loss: number; avgGradePct: number }[] = [];
  const stepChunk = 500;
  let cur: (typeof chunks)[number] | null = null;
  for (let x = d; x < end; x += stepChunk) {
    const y = Math.min(end, x + stepChunk);
    const st = rangeStats(x, y);
    const g = st.net / Math.max(1, st.distM);
    const kind = g > 0.04 ? "climb" : g < -0.04 ? "descent" : "rolling";
    if (cur && cur.kind === kind) {
      cur.toKm = y / 1000;
      cur.gain += st.gain;
      cur.loss += st.loss;
    } else {
      if (cur) chunks.push(cur);
      cur = { kind, fromKm: x / 1000, toKm: y / 1000, gain: st.gain, loss: st.loss, avgGradePct: 0 };
    }
  }
  if (cur) chunks.push(cur);
  for (const c of chunks) {
    const st = rangeStats(c.fromKm * 1000, c.toKm * 1000);
    c.avgGradePct = Math.round((st.net / Math.max(1, st.distM)) * 1000) / 10;
    c.gain = Math.round(c.gain);
    c.loss = Math.round(c.loss);
    c.fromKm = Math.round(c.fromKm * 10) / 10;
    c.toKm = Math.round(c.toKm * 10) / 10;
  }
  return chunks;
}

/** Seconds from local midnight at the start gun, parsed from startLocal. */
export function startClockSec() {
  const m = /(\d{1,2}):(\d{2})/.exec(course.startLocal);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 : 0;
}

export function startWeekday() {
  return /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)/.exec(course.startLocal)?.[1] ?? "Fri";
}

/** Race-clock seconds when the local clock next reads `localSec`. */
export function raceSecAtLocal(localSec: number) {
  return (localSec - startClockSec() + 86400) % 86400;
}

/** Local time-of-day in seconds for a race clock value. */
export function localClockSec(raceSec: number) {
  return (startClockSec() + raceSec) % 86400;
}

export function isNight(raceSec: number) {
  const c = localClockSec(raceSec);
  return c >= course.sunsetLocalSec || c < course.sunriseLocalSec;
}

export function courseGeoJSON(): Feature<LineString> {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: course.lon.map((lon, i) => [lon, course.lat[i]]),
    },
  };
}

export function lineBetween(fromM: number, toM: number): Feature<LineString> {
  const a = clampD(fromM);
  const b = clampD(toM);
  const coords: [number, number][] = [lngLatAt(a)];
  for (let i = Math.ceil(a / STEP_M); i * STEP_M < b; i++) coords.push([course.lon[i], course.lat[i]]);
  coords.push(lngLatAt(b));
  return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } };
}

export function courseBounds(): [[number, number], [number, number]] {
  return [
    [Math.min(...course.lon), Math.min(...course.lat)],
    [Math.max(...course.lon), Math.max(...course.lat)],
  ];
}
