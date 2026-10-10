import lavaredo from "@/data/lavaredo.json";
import { activateCourse, activeRace, type AidKind, type AidStation, type Climb, type CourseData } from "@/lib/course";

export type RaceSpec = {
  id: string;
  name: string;
  shortName: string;
  location: string;
  lat: number;
  lon: number;
  distanceKm: number;
  gainM: number;
  timeLimitSec: number;
  startLocal: string;
  startUtc: string;
  timeZone: string;
  sunriseLocalSec: number;
  sunsetLocalSec: number;
  /** Climbing was guessed because the runner didn't give a number. */
  gainEstimated?: boolean;
};

export type RaceChoice = { id: string; spec?: RaceSpec };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Published figures. The track itself is a sketch, except Lavaredo. */
const CATALOG: RaceSpec[] = [
  {
    id: "utmb",
    name: "UTMB",
    shortName: "UTMB",
    location: "Chamonix",
    lat: 45.9237,
    lon: 6.8694,
    distanceKm: 171,
    gainM: 10000,
    timeLimitSec: 46.5 * 3600,
    startLocal: "Fri 27 Aug 2027, 18:00",
    startUtc: "2027-08-27T16:00:00Z",
    timeZone: "Europe/Paris",
    sunriseLocalSec: 6 * 3600 + 45 * 60,
    sunsetLocalSec: 20 * 3600 + 15 * 60,
  },
  {
    id: "ccc",
    name: "CCC",
    shortName: "CCC",
    location: "Courmayeur to Chamonix",
    lat: 45.7966,
    lon: 6.9687,
    distanceKm: 101,
    gainM: 6100,
    timeLimitSec: 26.5 * 3600,
    startLocal: "Fri 27 Aug 2027, 09:00",
    startUtc: "2027-08-27T07:00:00Z",
    timeZone: "Europe/Paris",
    sunriseLocalSec: 6 * 3600 + 45 * 60,
    sunsetLocalSec: 20 * 3600 + 15 * 60,
  },
  {
    id: "ws100",
    name: "Western States 100",
    shortName: "Western States",
    location: "Olympic Valley to Auburn",
    lat: 39.1966,
    lon: -120.2355,
    distanceKm: 161.6,
    gainM: 5500,
    timeLimitSec: 30 * 3600,
    startLocal: "Sat 26 Jun 2027, 05:00",
    startUtc: "2027-06-26T12:00:00Z",
    timeZone: "America/Los_Angeles",
    sunriseLocalSec: 5 * 3600 + 40 * 60,
    sunsetLocalSec: 20 * 3600 + 30 * 60,
  },
];

const cache = new Map<string, CourseData>();

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function clockLabel(startLocal: string, raceSec: number) {
  const day = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)/.exec(startLocal)?.[1] ?? "Fri";
  const hm = /(\d{1,2}):(\d{2})/.exec(startLocal);
  const start = hm ? Number(hm[1]) * 3600 + Number(hm[2]) * 60 : 0;
  const total = start + raceSec;
  const name = DAYS[(DAYS.indexOf(day) + Math.floor(total / 86400) + 7) % 7];
  const c = ((total % 86400) + 86400) % 86400;
  return `${name} ${String(Math.floor(c / 3600)).padStart(2, "0")}:${String(Math.floor((c % 3600) / 60)).padStart(2, "0")}`;
}

function synthesize(spec: RaceSpec): CourseData {
  const stepM = 50;
  const n = Math.max(20, Math.round((spec.distanceKm * 1000) / stepM) + 1);
  const totalM = (n - 1) * stepM;
  const lat: number[] = [];
  const lon: number[] = [];
  const radius = totalM / (2 * Math.PI);
  const lat0 = spec.lat;
  const lon0 = spec.lon;
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * Math.PI * 2;
    lat.push(lat0 + (radius * Math.cos(t)) / 111320);
    lon.push(lon0 + (radius * Math.sin(t)) / (111320 * Math.cos((lat0 * Math.PI) / 180)));
  }

  const climbsN = Math.max(2, Math.min(8, Math.round(spec.distanceKm / 18)));
  const weights = Array.from({ length: climbsN }, (_, i) => 0.75 + ((hash(spec.id + i).charCodeAt(0) % 7) / 10));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const ele = new Array<number>(n).fill(0);
  const base = 800;
  for (let c = 0; c < climbsN; c++) {
    const a = Math.floor((c / climbsN) * (n - 1));
    const b = Math.floor(((c + 1) / climbsN) * (n - 1));
    const mid = Math.floor(a + (b - a) * 0.42);
    const up = (spec.gainM * weights[c]) / weightSum;
    for (let i = a; i <= mid; i++) {
      const u = mid === a ? 1 : (i - a) / (mid - a);
      ele[i] = base + up * u;
    }
    for (let i = mid + 1; i <= b; i++) {
      const u = b === mid ? 1 : (i - mid) / (b - mid);
      ele[i] = base + up * (1 - u);
    }
  }
  ele[n - 1] = base;
  let gained = 0;
  for (let i = 1; i < n; i++) gained += Math.max(0, ele[i] - ele[i - 1]);
  const scale = gained > 1 ? spec.gainM / gained : 1;
  for (let i = 0; i < n; i++) ele[i] = Math.round(base + (ele[i] - base) * scale);

  const climbList: Climb[] = [];
  let runStart = -1;
  let runGain = 0;
  let runBase = ele[0];
  let runTop = ele[0];
  const flush = (end: number) => {
    if (runStart < 0 || runGain < 220) return;
    const lengthKm = ((end - runStart) * stepM) / 1000;
    climbList.push({
      id: `gym-${climbList.length + 1}`,
      name: `Climb ${climbList.length + 1}`,
      badge: `Climb ${climbList.length + 1}`,
      startKm: (runStart * stepM) / 1000,
      endKm: (end * stepM) / 1000,
      gain: Math.round(runGain),
      net: ele[end] - runBase,
      lengthKm: Math.round(lengthKm * 10) / 10,
      avgGrade: lengthKm > 0 ? Math.round((runGain / (lengthKm * 1000)) * 1000) / 10 : 0,
      maxGrade: 18,
      topEle: runTop,
      baseEle: runBase,
    });
  };
  for (let i = 1; i < n; i++) {
    const d = ele[i] - ele[i - 1];
    if (d > 2) {
      if (runStart < 0) {
        runStart = i - 1;
        runBase = ele[i - 1];
        runGain = 0;
        runTop = ele[i - 1];
      }
      runGain += d;
      runTop = Math.max(runTop, ele[i]);
    } else if (runStart >= 0 && d < -2) {
      flush(i - 1);
      runStart = -1;
    }
  }
  if (runStart >= 0) flush(n - 2);

  const stations: AidStation[] = [];
  const pushStation = (km: number, name: string, kind: AidKind, cutoffAt: number | null, services: string[]) => {
    const i = Math.min(n - 1, Math.max(0, Math.round((km * 1000) / stepM)));
    const snappedKm = (i * stepM) / 1000;
    stations.push({
      id: kind === "start" ? "start" : kind === "finish" ? "finish" : `s-${stations.length}`,
      name,
      km: Math.round(snappedKm * 100) / 100,
      officialKm: Math.round(snappedKm * 10) / 10,
      officialDplus: 0,
      officialDminus: 0,
      ele: ele[i],
      lat: lat[i],
      lon: lon[i],
      kind,
      services,
      crew: kind === "start" || kind === "finish" || kind === "lifebase",
      dropBag: kind === "lifebase",
      cutoff: cutoffAt !== null ? clockLabel(spec.startLocal, cutoffAt) : null,
      cutoffSec: cutoffAt,
      legNote: null,
    });
  };

  pushStation(0, "Start", "start", null, []);
  const spacing = spec.distanceKm > 120 ? 18 : 14;
  for (let km = spacing; km < spec.distanceKm - 6; km += spacing) {
    const frac = km / spec.distanceKm;
    const kind: AidKind = frac > 0.42 && frac < 0.58 && spec.distanceKm >= 80 ? "lifebase" : "aid";
    const cutoffAt = frac > 0.25 ? Math.round(spec.timeLimitSec * Math.min(0.92, frac + 0.08)) : null;
    pushStation(km, kind === "lifebase" ? "Life base" : `km ${Math.round(km)}`, kind, cutoffAt, kind === "lifebase" ? ["water", "food", "hot food", "drop bag"] : ["water", "food"]);
  }
  pushStation(spec.distanceKm, "Finish", "finish", spec.timeLimitSec, []);

  let trackGain = 0;
  let trackLoss = 0;
  for (let i = 1; i < n; i++) {
    const d = ele[i] - ele[i - 1];
    if (d > 0) trackGain += d;
    else trackLoss -= d;
  }

  return {
    id: spec.id,
    name: spec.name,
    shortName: spec.shortName,
    location: spec.location,
    raceDate: spec.startUtc.slice(0, 10),
    startLocal: spec.startLocal,
    startUtc: spec.startUtc,
    timeZone: spec.timeZone,
    timeLimitSec: spec.timeLimitSec,
    officialDistanceKm: spec.distanceKm,
    officialGainM: spec.gainM,
    totalKm: Math.round((totalM / 1000) * 100) / 100,
    trackGainM: Math.round(trackGain),
    trackLossM: Math.round(trackLoss),
    sunriseLocalSec: spec.sunriseLocalSec,
    sunsetLocalSec: spec.sunsetLocalSec,
    estimated: true,
    source: {
      gpx: "",
      page: "",
      note: spec.gainEstimated
        ? "Distance from what you said. Climbing is a rough trail estimate, and the map line is a sketch, not the race route."
        : spec.id.startsWith("custom")
          ? "Built from the distance and climbing you gave. The map line is a sketch, not the official route."
          : "Sketch from the published distance and climb, placed near the start. Not the official route.",
    },
    stepM,
    lat,
    lon,
    ele,
    aidStations: stations,
    climbs: climbList,
  };
}

export function catalog() {
  return CATALOG;
}

export function courseFor(choice: RaceChoice | null | undefined): CourseData {
  if (!choice || choice.id === "lut-120") return lavaredo as CourseData;
  const key = choice.spec ? `${choice.spec.id}:${choice.spec.distanceKm}:${choice.spec.gainM}` : choice.id;
  const hit = cache.get(key);
  if (hit) return hit;
  const spec = choice.spec ?? CATALOG.find((c) => c.id === choice.id);
  if (!spec) return lavaredo as CourseData;
  const built = synthesize(spec);
  cache.set(key, built);
  return built;
}

export function bindRace(choice: RaceChoice | null) {
  const data = choice ? courseFor(choice) : null;
  if (data && choice) activateCourse(data, choice);
  return data;
}

export function ensureCoachCourse(choice?: RaceChoice | null) {
  if (!choice?.id) return;
  activateCourse(courseFor(choice), choice);
}

export function coachRace(): RaceChoice | null {
  const race = activeRace();
  if (!race || typeof race.id !== "string") return null;
  return race as RaceChoice;
}

function known(id: string): { choice: RaceChoice; label: string } {
  if (id === "lut-120") return { choice: { id }, label: "Lavaredo Ultra Trail 120K" };
  const spec = CATALOG.find((c) => c.id === id)!;
  return { choice: { id }, label: spec.name };
}

function customSpec(name: string, km: number, gain: number, gainEstimated: boolean): RaceSpec {
  const id = `custom-${hash(`${name}|${km}|${gain}`)}`;
  const long = km >= 100;
  const hours = Math.min(48, Math.max(long ? 20 : 6, Math.round(km / 4.2 + gain / 900)));
  const startLocal = long ? "Fri 18 Jun 2027, 22:00" : "Sat 19 Jun 2027, 07:00";
  const startUtc = long ? "2027-06-18T20:00:00Z" : "2027-06-19T05:00:00Z";
  return {
    id,
    name,
    shortName: name.length > 28 ? `${name.slice(0, 26)}…` : name,
    location: "the start you described",
    lat: 46.2,
    lon: 7.4,
    distanceKm: Math.round(km * 10) / 10,
    gainM: Math.round(gain),
    timeLimitSec: hours * 3600,
    startLocal,
    startUtc,
    timeZone: "Europe/Paris",
    sunriseLocalSec: 5 * 3600 + 30 * 60,
    sunsetLocalSec: 21 * 3600 + 15 * 60,
    gainEstimated,
  };
}

/** Turn a spoken or typed sentence into a race, or one question if it isn't enough. */
export function interpretRace(text: string): { choice: RaceChoice; label: string } | { ask: string } {
  const raw = text.trim();
  if (raw.length < 2) return { ask: "Tell me the race, or a distance and the climbing." };
  const q = raw.toLowerCase();
  if (/lavaredo|\blut\b|tre cime/.test(q)) return known("lut-120");
  if (/\bccc\b|courmayeur/.test(q)) return known("ccc");
  if (/western states|\bws\s?100\b/.test(q)) return known("ws100");
  if (/\butmb\b|mont[\s-]?blanc/.test(q)) return known("utmb");

  const mile = /(\d+(?:\.\d+)?)\s*(?:miles|mile|mi)\b/.exec(q);
  const kmMatch = /(\d+(?:\.\d+)?)\s*(?:km|k)\b/.exec(q);
  let km = mile ? Number(mile[1]) * 1.60934 : kmMatch ? Number(kmMatch[1]) : null;
  const gainMatch = /(\d[\d,]{2,6})\s*(?:m\b|metres|meters)/.exec(q);
  let gain = gainMatch ? Number(gainMatch[1].replace(/,/g, "")) : null;
  if (gain !== null && gain < 200) gain = null;
  if (km === null) return { ask: "I don't have a track for that. Give me a distance and the climbing, like 80 km and 4000 m." };

  const gainEstimated = gain === null;
  km = Math.min(200, Math.max(10, km));
  gain = Math.min(14000, Math.max(200, gain ?? Math.round(km * 50)));
  let name = raw
    .replace(/i(?:'m| am)?\s+(?:going to |gonna )?(?:run|running|doing)\s+/i, "")
    .replace(/\b(?:next year|this year|in 202\d)\b/gi, "")
    .replace(/\d+(?:\.\d+)?\s*(?:km|k|miles|mile|mi)\b/gi, "")
    .replace(/\d[\d,]*\s*(?:m|metres|meters)\b/gi, "")
    .replace(/\b(?:with|and|of|climbing|elevation|gain|about|around|roughly|please)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (name.length < 3) name = `${Math.round(km)} km`;
  name = name.charAt(0).toUpperCase() + name.slice(1);
  const spec = customSpec(name, km, gain, gainEstimated);
  return { choice: { id: spec.id, spec }, label: spec.shortName };
}
