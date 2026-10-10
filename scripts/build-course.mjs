// Builds src/data/lavaredo.json from the official Lavaredo Ultra Trail 120K GPX.
// Usage: node scripts/build-course.mjs [path/to/track.gpx]
// If no GPX is found locally it is downloaded from the official race website.
import fs from "node:fs";
import path from "node:path";

const OFFICIAL_GPX =
  "https://pdf.utmb.world/raw/upload/v1782387012/lavaredo/files/2026/LUT_20_Madre_2026_6_2025_2065s_20pul_89a81f913b.gpx";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const gpxPath = process.argv[2] ?? path.join(root, "data", "lavaredo-120k.gpx");
const outPath = path.join(root, "src", "data", "lavaredo.json");

const STEP_M = 50;

// Official 2026 race book: km, cumulative D+/D-, services, cut-offs (race clock from Fri 23:00).
// `snap` places each station on the GPX by terrain, because the race-book kilometres drift
// up to ~2 km from the track geometry in the second half.
const AID = [
  { id: "start", name: "Cortina d'Ampezzo", km: 0, dplus: 0, dminus: 0, kind: "start", services: [], crew: true, snap: { at: 0 } },
  { id: "ospitale", name: "Ospitale", km: 18.7, dplus: 819, dminus: 547, kind: "aid", services: ["water", "food"], snap: { ele: 1490, near: 18.6, win: 1.5 } },
  { id: "trecroci", name: "Passo Tre Croci", km: 28.0, dplus: 1476, dminus: 890, kind: "aid", services: ["water", "food"], cutoff: "Sat 04:30", cutoffH: 5.5, snap: { ele: 1805, near: 27.9, win: 1.5 } },
  { id: "federavecchia", name: "Federavecchia", km: 34.0, dplus: 1539, dminus: 1365, kind: "aid", services: ["water", "food"], snap: { min: true, near: 33.6, win: 1.2 } },
  { id: "misurina", name: "Misurina", km: 42.6, dplus: 2106, dminus: 1554, kind: "aid", services: ["water", "food"], cutoff: "Sat 08:00", cutoffH: 9, snap: { min: true, near: 43.2, win: 1.2 } },
  { id: "auronzo", name: "Rifugio Auronzo", km: 49.8, dplus: 2696, dminus: 1598, kind: "water", services: ["water"], snap: { ele: 2320, near: 49.6, win: 1.8 } },
  { id: "lavaredo", name: "Forcella Lavaredo", km: 52.5, dplus: 2855, dminus: 1611, kind: "checkpoint", services: [], snap: { max: true, near: 51.7, win: 1.2 } },
  { id: "cimabanche", name: "Cimabanche", km: 67.5, dplus: 2980, dminus: 2660, kind: "lifebase", services: ["water", "food", "hot food", "drop bag"], crew: true, dropBag: true, cutoff: "Sat 13:30", cutoffH: 14.5, snap: { ele: 1530, near: 67.2, win: 2 } },
  { id: "rastua", name: "Malga Ra Stua", km: 77.1, dplus: 3513, dminus: 3018, kind: "aid", services: ["water", "food"], cutoff: "Sat 15:30", cutoffH: 16.5, snap: { ele: 1668, near: 76.5, win: 3 } },
  { id: "travenanzes", name: "Malga Travenanzes", km: 90.5, dplus: 4290, dminus: 3518, kind: "water", services: ["water"], snap: { ele: 1995, near: 89, win: 2.5 } },
  { id: "colgallina", name: "Rifugio Col Gallina", km: 97.7, dplus: 4786, dminus: 3938, kind: "aid", services: ["water", "food", "hot food"], crew: true, cutoff: "Sat 21:30", cutoffH: 22.5, snap: { ele: 2054, near: 97.3, win: 0.8 } },
  { id: "averau", name: "Rifugio Averau", km: 101.9, dplus: 5256, dminus: 4052, kind: "aid", services: ["water", "food", "medical"], snap: { max: true, near: 99.7, win: 1 } },
  { id: "giau", name: "Passo Giau", km: 105.3, dplus: 5364, dminus: 4329, kind: "aid", services: ["water", "food", "hot food"], cutoff: "Sat 23:59", cutoffH: 24.983, snap: { min: true, near: 104.8, win: 1 } },
  { id: "crodadalago", name: "Rifugio Croda da Lago", km: 112.9, dplus: 5671, dminus: 4828, kind: "aid", services: ["water", "food"], snap: { ele: 2046, near: 110.3, win: 2 } },
  { id: "finish", name: "Cortina d'Ampezzo", km: 120.0, dplus: 5800, dminus: 5800, kind: "finish", services: [], crew: true, cutoff: "Sun 05:00", cutoffH: 30, snap: { end: true } },
];

// Climbs ("gyms") between local extremes of the track, in track km.
const CLIMBS = [
  { name: "Night Ridge", badge: "Lantern Badge", from: 0, to: 7.2 },
  { name: "Tre Croci", badge: "Moonlight Badge", from: 12.3, to: 25.1 },
  { name: "Misurina", badge: "Lake Badge", from: 33.5, to: 37.9 },
  { name: "Tre Cime", badge: "Sunrise Badge", from: 43.2, to: 51.7 },
  { name: "Lerosa", badge: "Meadow Badge", from: 61.7, to: 72.2 },
  { name: "Travenanzes", badge: "Canyon Badge", from: 80.5, to: 91.2 },
  { name: "Averau", badge: "Summit Badge", from: 96.8, to: 99.7 },
  { name: "Giau", badge: "Last Gate Badge", from: 104.8, to: 108.3 },
];

// Notes for the leg that ends at each station.
const LEG_NOTES = {
  ospitale: "Cortina streets and crowds, the first night climb (Night Ridge), then forest trails and the old railway line to Ospitale. Classic fast-start trap: the first hour should feel too easy.",
  trecroci: "Long night climb above 2,100 m, then down to Passo Tre Croci. First cut-off at Sat 04:30.",
  federavecchia: "Fast descent in the dark on roots and loose gravel.",
  misurina: "Climb to Lago di Misurina. Cut-off Sat 08:00.",
  auronzo: "Tre Cime climb to Rifugio Auronzo with sunrise over the Tre Cime di Lavaredo.",
  lavaredo: "Rocky final ramp to Forcella Lavaredo, the high point of the race at about 2,450 m.",
  cimabanche: "Long descent through Val Rinbon to Landro, then a gentle valley climb to the Cimabanche life base (drop bag, crew allowed).",
  rastua: "Climb to Forcella Lerosa, then down to Malga Ra Stua. Often hot around midday.",
  travenanzes: "Down to Pian de Loa, then the long remote climb up Val Travenanzes with stream crossings and few bail-out points.",
  colgallina: "Over Forcella Col dei Bos and down to Rifugio Col Gallina (hot food, crew allowed).",
  averau: "Short brutal climb to Rifugio Averau below Nuvolau, the steepest gym of the race.",
  giau: "Traverse and descent to Passo Giau. Cut-off Sat 23:59.",
  crodadalago: "Forcella Giau and Forcella Ambrizzola, the last climbs, then down to Rifugio Croda da Lago.",
  finish: "Final forest descent into Cortina on tired quads.",
};

async function loadGpx() {
  if (fs.existsSync(gpxPath)) return fs.readFileSync(gpxPath, "utf8");
  console.log(`Downloading official GPX from ${OFFICIAL_GPX}`);
  const res = await fetch(OFFICIAL_GPX);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const text = await res.text();
  fs.mkdirSync(path.dirname(gpxPath), { recursive: true });
  fs.writeFileSync(gpxPath, text);
  return text;
}

const R = 6371000;
const rad = (x) => (x * Math.PI) / 180;
function haversine(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function smooth(values, windowPts) {
  const half = Math.floor(windowPts / 2);
  const prefix = [0];
  for (const v of values) prefix.push(prefix[prefix.length - 1] + v);
  return values.map((_, i) => {
    const a = Math.max(0, i - half);
    const b = Math.min(values.length - 1, i + half);
    return (prefix[b + 1] - prefix[a]) / (b - a + 1);
  });
}

function gainLoss(ele, hysteresis = 3) {
  let up = 0;
  let down = 0;
  let ref = ele[0];
  for (const e of ele) {
    if (e - ref > hysteresis) {
      up += e - ref;
      ref = e;
    } else if (ref - e > hysteresis) {
      down += ref - e;
      ref = e;
    }
  }
  return { up, down };
}

const xml = await loadGpx();
const re = /<trkpt[^>]*lat="([^"]+)"[^>]*lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/g;
const raw = [];
let m;
while ((m = re.exec(xml))) {
  const ele = /<ele>([^<]+)<\/ele>/.exec(m[3]);
  raw.push({ lat: +m[1], lon: +m[2], ele: ele ? +ele[1] : NaN });
}
if (raw.length < 100) throw new Error("GPX has too few track points");

let cum = 0;
const dist = [0];
for (let i = 1; i < raw.length; i++) {
  cum += haversine(raw[i - 1], raw[i]);
  dist.push(cum);
}
const totalM = cum;

const n = Math.floor(totalM / STEP_M) + 1;
const lat = [];
const lon = [];
const eleRaw = [];
let j = 0;
for (let i = 0; i < n; i++) {
  const target = i * STEP_M;
  while (j < dist.length - 2 && dist[j + 1] < target) j++;
  const span = dist[j + 1] - dist[j] || 1;
  const t = Math.max(0, Math.min(1, (target - dist[j]) / span));
  const a = raw[j];
  const b = raw[j + 1];
  lat.push(a.lat + (b.lat - a.lat) * t);
  lon.push(a.lon + (b.lon - a.lon) * t);
  const ea = Number.isFinite(a.ele) ? a.ele : b.ele;
  const eb = Number.isFinite(b.ele) ? b.ele : a.ele;
  eleRaw.push(ea + (eb - ea) * t);
}
const ele = smooth(eleRaw, 5);
const { up, down } = gainLoss(ele);
const idxOf = (km) => Math.max(0, Math.min(n - 1, Math.round((km * 1000) / STEP_M)));
const kmOf = (idx) => (idx * STEP_M) / 1000;

function snapIndex(snap) {
  if (snap.at !== undefined) return idxOf(snap.at);
  if (snap.end) return n - 1;
  const lo = idxOf(snap.near - snap.win);
  const hi = idxOf(snap.near + snap.win);
  const nearIdx = idxOf(snap.near);
  let best = nearIdx;
  if (snap.min || snap.max) {
    for (let i = lo; i <= hi; i++) {
      if (snap.min ? ele[i] < ele[best] : ele[i] > ele[best]) best = i;
    }
    return best;
  }
  let bestScore = Infinity;
  for (let i = lo; i <= hi; i++) {
    const score = Math.abs(ele[i] - snap.ele) * 4 + Math.abs(i - nearIdx) * (STEP_M / 100);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

const aidStations = AID.map((a) => {
  const idx = snapIndex(a.snap);
  return {
    id: a.id,
    name: a.name,
    km: +kmOf(idx).toFixed(2),
    officialKm: a.km,
    officialDplus: a.dplus,
    officialDminus: a.dminus,
    ele: Math.round(ele[idx]),
    lat: +lat[idx].toFixed(5),
    lon: +lon[idx].toFixed(5),
    kind: a.kind,
    services: a.services,
    crew: !!a.crew,
    dropBag: !!a.dropBag,
    cutoff: a.cutoff ?? null,
    cutoffSec: a.cutoffH ? Math.round(a.cutoffH * 3600) : null,
    legNote: LEG_NOTES[a.id] ?? null,
  };
});

function localExtreme(km, win, kind) {
  let best = idxOf(km);
  for (let i = idxOf(km - win); i <= idxOf(km + win); i++) {
    if (kind === "min" ? ele[i] < ele[best] : ele[i] > ele[best]) best = i;
  }
  return best;
}

const climbs = CLIMBS.map((c, k) => {
  const s = c.from === 0 ? 0 : localExtreme(c.from, 0.6, "min");
  const e = localExtreme(c.to, 0.6, "max");
  let gain = 0;
  let maxGrade = 0;
  for (let i = s + 1; i <= e; i++) {
    const d = ele[i] - ele[i - 1];
    if (d > 0) gain += d;
  }
  for (let i = s + 6; i <= e; i++) {
    maxGrade = Math.max(maxGrade, (ele[i] - ele[i - 6]) / (6 * STEP_M));
  }
  const lengthKm = kmOf(e) - kmOf(s);
  const net = ele[e] - ele[s];
  return {
    id: `gym-${k + 1}`,
    name: c.name,
    badge: c.badge,
    startKm: +kmOf(s).toFixed(2),
    endKm: +kmOf(e).toFixed(2),
    gain: Math.round(gain),
    net: Math.round(net),
    lengthKm: +lengthKm.toFixed(2),
    avgGrade: +((gain / (lengthKm * 1000)) * 100).toFixed(1),
    maxGrade: +(maxGrade * 100).toFixed(1),
    topEle: Math.round(ele[e]),
    baseEle: Math.round(ele[s]),
  };
});

const out = {
  id: "lut-120",
  name: "Lavaredo Ultra Trail 120K",
  shortName: "Lavaredo 120K",
  location: "Cortina d'Ampezzo, Dolomites",
  raceDate: "2027-06-25",
  startLocal: "Fri 25 Jun 2027, 23:00",
  startUtc: "2027-06-25T21:00:00Z",
  timeZone: "Europe/Rome",
  timeLimitSec: 30 * 3600,
  officialDistanceKm: 120,
  officialGainM: 5800,
  totalKm: +(totalM / 1000).toFixed(2),
  trackGainM: Math.round(up),
  trackLossM: Math.round(down),
  sunriseSec: 6 * 3600 + 16 * 60,
  sunsetSec: 22 * 3600 + 17 * 60,
  source: {
    gpx: OFFICIAL_GPX,
    page: "https://lavaredo.utmb.world/races/lavaredo120k",
    note: "Official GPX and 2026 race-book checkpoints and cut-offs. The 2027 route may change slightly.",
  },
  stepM: STEP_M,
  lat: lat.map((v) => +v.toFixed(5)),
  lon: lon.map((v) => +v.toFixed(5)),
  ele: ele.map((v) => Math.round(v)),
  aidStations,
  climbs,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out));

console.log(`GPX ${raw.length} pts, ${(totalM / 1000).toFixed(2)} km, resampled ${n} pts`);
console.log(`Track D+ ${Math.round(up)} m / D- ${Math.round(down)} m`);
for (const a of aidStations) {
  console.log(`  track ${a.km.toFixed(2).padStart(6)} km (book ${String(a.officialKm).padStart(5)})  ${a.name.padEnd(24)} ${a.ele} m`);
}
for (const c of climbs) {
  console.log(`  ${c.name.padEnd(12)} ${c.startKm}-${c.endKm} km  +${c.gain} m  avg ${c.avgGrade}%  max ${c.maxGrade}%  ${c.baseEle}->${c.topEle} m`);
}
console.log(`Wrote ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)`);
