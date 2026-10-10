import type { AidKind, AidStation, Climb, CourseData } from "@/lib/course";
import type { RaceChoice } from "@/lib/races";

export type RaceLookup = { choice: RaceChoice; label: string } | { ask: string } | { error: string };

const UA = "Mozilla/5.0 (compatible; RivalRun/1.0; +https://lavaredo.utmb.world)";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const STOP = new Set([
  "the", "and", "for", "with", "from", "that", "this", "next", "year", "race", "races", "ultra", "trail", "running",
  "run", "official", "please", "want", "going", "gonna", "doing", "about", "around", "june", "july",
]);

type Link = { label: string; url: string; slug: string; km: number | null };
type Pt = { lat: number; lon: number; ele: number };

const cache = new Map<string, { at: number; value: RaceLookup }>();

function tokens(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
}

function compact(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function statedKm(q: string) {
  const mile = /(\d+(?:\.\d+)?)\s*(?:miles|mile|mi)\b/i.exec(q);
  if (mile) return Number(mile[1]) * 1.60934;
  const km = /(\d+(?:\.\d+)?)\s*(?:km|k)\b/i.exec(q);
  return km ? Number(km[1]) : null;
}

function kmFromLabel(s: string) {
  const m = /(\d+(?:\.\d+)?)\s*k(?:m)?\b/i.exec(s);
  return m ? Number(m[1]) : null;
}

function kmClose(a: number, b: number) {
  return Math.abs(a - b) <= Math.max(4, b * 0.1);
}

function listNames(names: string[]) {
  const uniq = [...new Set(names)].slice(0, 8);
  if (uniq.length <= 1) return uniq[0] ?? "";
  return `${uniq.slice(0, -1).join(", ")} or ${uniq[uniq.length - 1]}`;
}

function allowed(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const h = u.hostname;
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0)/.test(h)) return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchText(url: string, ms = 15000) {
  if (!allowed(url)) throw new Error("That address can't be fetched.");
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "text/html,application/gpx+xml,application/xml,*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(ms),
  });
  if (!res.ok) throw new Error(`Page returned ${res.status}`);
  const len = Number(res.headers.get("content-length") || 0);
  if (len > 12_000_000) throw new Error("That file is too large.");
  const text = await res.text();
  if (text.length > 12_000_000) throw new Error("That file is too large.");
  return text;
}

function eventHost(url: string) {
  try {
    const h = new URL(url).hostname;
    const m = /^([a-z0-9-]+)\.utmb\.world$/i.exec(h);
    if (!m) return null;
    if (["www", "live", "api", "img", "pdf", "accounts", "eushop", "go", "static", "res"].includes(m[1])) return null;
    return h;
  } catch {
    return null;
  }
}

function englishUtmb(url: string) {
  const u = new URL(url);
  u.pathname = u.pathname.replace(/^\/(en|fr|it|es|de|pt|zh|ja|ko)\//, "/");
  u.hash = "";
  return u.toString();
}

async function search(q: string) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
  let html = "";
  for (let i = 0; i < 2; i++) {
    try {
      html = await fetchText(url, 12000);
    } catch {
      html = "";
    }
    if (html.includes("uddg=") && !html.includes("anomaly-modal")) break;
    await new Promise((r) => setTimeout(r, 800));
  }
  const out: string[] = [];
  for (const m of html.matchAll(/uddg=([^&"\s]+)/g)) {
    try {
      const u = decodeURIComponent(m[1]);
      if (allowed(u) && !out.includes(u)) out.push(u);
    } catch {
      // skip a broken result link
    }
  }
  return out.filter((u) => !/youtube\.com|youtu\.be|facebook\.com|instagram\.com|tiktok\.com|amazon\.|duckduckgo\.com|wikipedia\.org/i.test(u));
}

function nextData(html: string): { props?: { pageProps?: Record<string, unknown> } } | null {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as { props?: { pageProps?: Record<string, unknown> } };
  } catch {
    return null;
  }
}

function collectLinks(node: unknown, host: string, out: Link[]) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectLinks(item, host, out);
    return;
  }
  const o = node as Record<string, unknown>;
  const slug = typeof o.slug === "string" ? o.slug : "";
  const label = typeof o.label === "string" ? o.label : typeof o.title === "string" ? o.title : "";
  const match = slug.match(/^(?:https?:\/\/[^/]+)?\/(?:[a-z]{2}\/)?races\/([a-z0-9-]+)\/?$/i);
  if (match && label && !/list of all races/i.test(label)) {
    const id = match[1].toLowerCase();
    const url = slug.startsWith("http") ? englishUtmb(slug) : `https://${host}/races/${id}`;
    if (!out.some((x) => x.slug === id)) out.push({ label: label.replace(/<[^>]+>/g, "").trim(), url, slug: id, km: kmFromLabel(label) ?? kmFromLabel(id) });
  }
  for (const v of Object.values(o)) if (v && typeof v === "object") collectLinks(v, host, out);
}

function raceLinks(html: string, pageUrl: string) {
  const host = eventHost(pageUrl) ?? new URL(pageUrl).host;
  const data = nextData(html);
  const pp = data?.props?.pageProps;
  const out: Link[] = [];
  if (pp) {
    for (const key of ["navigation", "footer", "mobileBottomBar", "simpleMenu"] as const) collectLinks(pp[key], host, out);
  }
  return out;
}

function scoreLink(link: Link, queryTokens: string[], stated: number | null) {
  const blob = `${link.label} ${link.slug}`.toLowerCase();
  let s = 0;
  for (const t of queryTokens) if (blob.includes(t)) s += 12;
  if (queryTokens.includes(link.slug)) s += 25;
  if (compact(link.label) === compact(queryTokens.join(""))) s += 20;
  if (stated != null && link.km != null) s += kmClose(link.km, stated) ? 40 : -30;
  return s;
}

function decide(links: Link[], phrase: string, stated: number | null): { pick: Link } | { ask: string } | null {
  if (!links.length) return null;
  const qTokens = tokens(phrase);
  if (stated != null) {
    const hits = links.filter((l) => l.km != null && kmClose(l.km, stated));
    if (hits.length === 1) return { pick: hits[0] };
    if (hits.length === 0 && links.some((l) => l.km != null)) {
      return { ask: `The published distances are ${listNames(links.map((l) => l.label))}. Nothing lines up with ${Math.round(stated)} km.` };
    }
  }
  const exact = links.filter((l) => qTokens.includes(l.slug) || compact(l.label) === compact(phrase));
  if (exact.length === 1) return { pick: exact[0] };
  const scored = links.map((l) => ({ l, s: scoreLink(l, qTokens, stated) })).sort((a, b) => b.s - a.s);
  const best = scored[0];
  const second = scored[1];
  if (!best || best.s < 8) return null;
  if (links.length === 1) return { pick: best.l };
  if (second && best.s - second.s < 12) {
    const names = scored.filter((x) => x.s >= best.s - 12).map((x) => x.l.label);
    return { ask: `Which one? ${listNames(names)}.` };
  }
  return { pick: best.l };
}

const R = 6371000;
function hav(a: Pt, b: Pt) {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function parseGpx(xml: string): Pt[] {
  const chunks = xml.split(/<trk\b/i).slice(1);
  const groups = (chunks.length ? chunks : [xml]).map((chunk) => {
    const pts: Pt[] = [];
    for (const m of chunk.matchAll(/<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/gi)) {
      const lat = /lat="([^"]+)"/i.exec(m[1]);
      const lon = /lon="([^"]+)"/i.exec(m[1]);
      if (!lat || !lon) continue;
      const ele = /<ele>([^<]+)<\/ele>/i.exec(m[2]);
      pts.push({ lat: Number(lat[1]), lon: Number(lon[1]), ele: ele ? Number(ele[1]) : NaN });
    }
    return pts;
  });
  groups.sort((a, b) => b.length - a.length);
  return groups[0] ?? [];
}

function decodePolyline(str: string, precision = 5): Pt[] {
  const factor = 10 ** precision;
  let index = 0;
  let lat = 0;
  let lon = 0;
  const out: Pt[] = [];
  while (index < str.length) {
    let result = 0;
    let shift = 0;
    let b = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0;
    shift = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lon += result & 1 ? ~(result >> 1) : result >> 1;
    out.push({ lat: lat / factor, lon: lon / factor, ele: NaN });
  }
  return out;
}

function applyProfile(pts: Pt[], profile: [number, number][]) {
  if (profile.length < 2 || pts.length < 2) return pts;
  const dist = [0];
  for (let i = 1; i < pts.length; i++) dist.push(dist[i - 1] + hav(pts[i - 1], pts[i]));
  const scale = profile[profile.length - 1][0] > 1 ? profile[profile.length - 1][0] / dist[dist.length - 1] : 1;
  let j = 0;
  return pts.map((p, i) => {
    const d = dist[i] * scale;
    while (j < profile.length - 2 && profile[j + 1][0] < d) j++;
    const a = profile[j];
    const b = profile[j + 1];
    const t = b[0] === a[0] ? 0 : (d - a[0]) / (b[0] - a[0]);
    return { ...p, ele: a[1] + (b[1] - a[1]) * Math.max(0, Math.min(1, t)) };
  });
}

function resample(raw: Pt[], stepM = 50) {
  const clean = raw.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (clean.length < 2) throw new Error("The route file has no track.");
  let last = clean[0].ele;
  for (const p of clean) {
    if (!Number.isFinite(p.ele)) p.ele = last;
    else last = p.ele;
  }
  for (let i = clean.length - 1; i >= 0; i--) if (!Number.isFinite(clean[i].ele)) clean[i].ele = last;
  const dist = [0];
  for (let i = 1; i < clean.length; i++) dist.push(dist[i - 1] + hav(clean[i - 1], clean[i]));
  const total = dist[dist.length - 1];
  if (total < 1000) throw new Error("The published line is too short to be a race.");
  const n = Math.floor(total / stepM) + 1;
  const lat: number[] = [];
  const lon: number[] = [];
  const ele: number[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const target = Math.min(total, i * stepM);
    while (j < dist.length - 2 && dist[j + 1] < target) j++;
    const span = dist[j + 1] - dist[j] || 1;
    const t = Math.max(0, Math.min(1, (target - dist[j]) / span));
    const a = clean[j];
    const b = clean[Math.min(clean.length - 1, j + 1)];
    lat.push(a.lat + (b.lat - a.lat) * t);
    lon.push(a.lon + (b.lon - a.lon) * t);
    ele.push(a.ele + (b.ele - a.ele) * t);
  }
  const sm = ele.map((_, i) => {
    let sum = 0;
    let c = 0;
    for (let k = Math.max(0, i - 2); k <= Math.min(ele.length - 1, i + 2); k++) {
      sum += ele[k];
      c++;
    }
    return Math.round(sum / c);
  });
  let up = 0;
  let down = 0;
  let ref = sm[0];
  for (const e of sm) {
    if (e - ref > 3) {
      up += e - ref;
      ref = e;
    } else if (ref - e > 3) {
      down += ref - e;
      ref = e;
    }
  }
  return { stepM, lat, lon, ele: sm, totalM: (n - 1) * stepM, up, down };
}

function zoneFor(lat: number, lon: number) {
  if (lat > 35 && lat < 72 && lon > -15 && lon < 40) {
    if (lon < 1) return "Europe/London";
    if (lon < 7.6) return "Europe/Paris";
    if (lon < 16) return "Europe/Rome";
    if (lon < 24) return "Europe/Berlin";
    return "Europe/Helsinki";
  }
  if (lat > 24 && lat < 50) {
    if (lon <= -115 && lon > -130) return "America/Los_Angeles";
    if (lon <= -102 && lon > -115) return "America/Denver";
    if (lon <= -85 && lon > -102) return "America/Chicago";
    if (lon < -60 && lon > -85) return "America/New_York";
  }
  const hours = Math.round(lon / 15);
  const sign = hours >= 0 ? "-" : "+";
  return `Etc/GMT${sign}${Math.abs(hours)}`;
}

function zonedToUtc(localIso: string, timeZone: string) {
  const [d, t = "00:00:00"] = localIso.split("T");
  const [Y, M, D] = d.split("-").map(Number);
  const [h, m, s] = t.split(":").map(Number);
  const utcGuess = Date.UTC(Y, M - 1, D, h || 0, m || 0, s || 0);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(utcGuess)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return new Date(utcGuess - (asUtc - utcGuess)).toISOString();
}

function sunLocal(lat: number, isoDate: string) {
  const [Y, M, D] = isoDate.split("-").map(Number);
  const start = Date.UTC(Y, 0, 0);
  const now = Date.UTC(Y, M - 1, D);
  const doy = Math.round((now - start) / 86400000);
  const decl = (23.44 * Math.PI) / 180 * Math.sin(((2 * Math.PI) / 365) * (doy - 81));
  const latR = (lat * Math.PI) / 180;
  const cosH = -Math.tan(latR) * Math.tan(decl);
  const H = (Math.acos(Math.max(-1, Math.min(1, cosH))) * 180) / Math.PI;
  return { sunrise: Math.round((12 - H / 15) * 3600), sunset: Math.round((12 + H / 15) * 3600) };
}

function formatStart(isoLocal: string) {
  const [d, t = "07:00"] = isoLocal.split("T");
  const [Y, M, D] = d.split("-").map(Number);
  const dow = new Date(Date.UTC(Y, M - 1, D)).getUTCDay();
  const hm = t.slice(0, 5);
  return { startLocal: `${DAYS[dow]} ${D} ${MONTHS[M - 1]} ${Y}, ${hm}`, dow, clock: Number(hm.slice(0, 2)) * 3600 + Number(hm.slice(3, 5)) * 60, date: d };
}

function cutoffToSec(label: string, startDow: number, startClock: number) {
  const m = /^(sun|mon|tue|wed|thu|fri|sat)\w*\s+(\d{1,2}):(\d{2})\s*(am|pm)?/i.exec(label.trim());
  if (!m) return null;
  let h = Number(m[2]);
  const min = Number(m[3]);
  const ap = m[4]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  const clock = h * 3600 + min * 60;
  const dow = DAYS.findIndex((d) => d.toLowerCase() === m[1].slice(0, 3).toLowerCase());
  let sec = ((dow - startDow + 7) % 7) * 86400 + clock - startClock;
  if (sec < -3 * 3600) sec += 7 * 86400;
  return Math.max(0, sec);
}

type TrackPoint = {
  distance: number;
  elevation?: number;
  gainElevation?: number;
  lossElevation?: number;
  name?: string;
  lat?: number;
  lon?: number;
  supplies?: string;
  isAssistance?: boolean;
  hasBag?: boolean;
  hasMedical?: boolean;
  cutoff?: string | null;
};

function climbsFrom(ele: number[], stepM: number, stations: AidStation[]): Climb[] {
  const climbs: Climb[] = [];
  let s = -1;
  let gain = 0;
  let peak = 0;
  let peakI = 0;
  let drop = 0;
  const flush = () => {
    if (s < 0 || gain < 180 || peakI <= s) return;
    const startKm = (s * stepM) / 1000;
    const endKm = (peakI * stepM) / 1000;
    const lengthKm = endKm - startKm;
    let maxGrade = 0;
    for (let i = s + 6; i <= peakI; i++) maxGrade = Math.max(maxGrade, (ele[i] - ele[i - 6]) / (6 * stepM));
    const station = stations.find((st) => st.km >= endKm - 0.4 && st.km <= endKm + 2.5 && st.kind !== "start");
    const name = station?.name ?? `Climb to ${ele[peakI]} m`;
    climbs.push({
      id: `climb-${climbs.length + 1}`,
      name,
      badge: name,
      startKm: Math.round(startKm * 100) / 100,
      endKm: Math.round(endKm * 100) / 100,
      gain: Math.round(gain),
      net: ele[peakI] - ele[s],
      lengthKm: Math.round(lengthKm * 10) / 10,
      avgGrade: lengthKm > 0 ? Math.round((gain / (lengthKm * 1000)) * 1000) / 10 : 0,
      maxGrade: Math.round(maxGrade * 1000) / 10,
      topEle: ele[peakI],
      baseEle: ele[s],
    });
  };
  for (let i = 1; i < ele.length; i++) {
    const d = ele[i] - ele[i - 1];
    if (s < 0) {
      if (d > 1) {
        s = i - 1;
        gain = 0;
        peak = ele[s];
        peakI = s;
        drop = 0;
      }
      continue;
    }
    if (d >= 0) {
      gain += d;
      drop = 0;
      if (ele[i] >= peak) {
        peak = ele[i];
        peakI = i;
      }
    } else {
      drop -= d;
      if (drop > 40) {
        flush();
        s = -1;
      }
    }
  }
  flush();
  return climbs;
}

function stationsFromPoints(points: TrackPoint[], lat: number[], lon: number[], ele: number[], stepM: number, start: { dow: number; clock: number }) {
  const n = ele.length;
  const idxOf = (km: number) => Math.max(0, Math.min(n - 1, Math.round((km * 1000) / stepM)));
  let prev = 0;
  return points.map((p, index) => {
    const last = index === points.length - 1;
    let i = last ? n - 1 : index === 0 ? 0 : idxOf((p.distance || 0) / 1000);
    if (!last && index > 0 && Number.isFinite(p.lat) && Number.isFinite(p.lon)) {
      let best = Math.max(prev, i);
      let bestD = Infinity;
      const lo = Math.max(prev, idxOf((p.distance || 0) / 1000 - 2));
      const hi = Math.min(n - 1, idxOf((p.distance || 0) / 1000 + 2));
      for (let k = lo; k <= hi; k++) {
        const d = hav({ lat: lat[k], lon: lon[k], ele: 0 }, { lat: p.lat as number, lon: p.lon as number, ele: 0 });
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      i = best;
    }
    prev = i;
    const supplies = (p.supplies || "none").toLowerCase();
    let kind: AidKind = "aid";
    if (index === 0) kind = "start";
    else if (last) kind = "finish";
    else if (p.hasBag) kind = "lifebase";
    else if (supplies === "drink") kind = "water";
    else if (supplies === "none") kind = "checkpoint";
    const services: string[] = [];
    if (supplies === "food" || supplies === "drink" || supplies === "hot") services.push("water");
    if (supplies === "food" || supplies === "hot") services.push("food");
    if (p.hasMedical) services.push("medical");
    if (p.hasBag) services.push("drop bag");
    const cutoffSec = p.cutoff ? cutoffToSec(p.cutoff, start.dow, start.clock) : null;
    return {
      id: index === 0 ? "start" : last ? "finish" : `s-${index}`,
      name: p.name || (index === 0 ? "Start" : last ? "Finish" : `km ${Math.round((i * stepM) / 1000)}`),
      km: Math.round(((i * stepM) / 1000) * 100) / 100,
      officialKm: Math.round(((p.distance || i * stepM) / 1000) * 10) / 10,
      officialDplus: Math.round(p.gainElevation || 0),
      officialDminus: Math.round(p.lossElevation || 0),
      ele: ele[i] ?? 0,
      lat: lat[i],
      lon: lon[i],
      kind,
      services,
      crew: Boolean(p.isAssistance) || kind === "start" || kind === "finish",
      dropBag: Boolean(p.hasBag),
      cutoff: p.cutoff ?? null,
      cutoffSec,
      legNote: null,
    } satisfies AidStation;
  });
}

function round5(n: number) {
  return Math.round(n * 1e5) / 1e5;
}

async function lineFrom(gpxUrl: string | null, polyline: string | null, profile: [number, number][] | null) {
  if (gpxUrl && allowed(gpxUrl)) {
    try {
      const xml = await fetchText(gpxUrl, 20000);
      const pts = parseGpx(xml);
      if (pts.length > 30) return { line: resample(pts), gpx: gpxUrl };
    } catch {
      // The page still has a route line if the file download fails.
    }
  }
  if (polyline && polyline.length > 20) {
    let pts = decodePolyline(polyline, 5);
    let dist = 0;
    for (let i = 1; i < pts.length; i++) dist += hav(pts[i - 1], pts[i]);
    if (profile && profile.length > 2) {
      const official = profile[profile.length - 1][0];
      if (official > 1000 && (dist < official * 0.5 || dist > official * 1.8)) pts = decodePolyline(polyline, 6);
      pts = applyProfile(pts, profile);
    }
    if (pts.length > 30) return { line: resample(pts), gpx: gpxUrl ?? "" };
  }
  throw new Error("The page doesn't include a route line.");
}

async function courseFromUtmb(pageUrl: string, html: string): Promise<CourseData> {
  const data = nextData(html);
  const pp = data?.props?.pageProps;
  if (!pp) throw new Error("That page has no race data.");
  const header = (pp.pageHeader ?? {}) as { title?: string; startDateIso?: string; endDateIso?: string };
  const event = (pp.event ?? {}) as { name?: string; placeName?: string; lat?: number; lng?: number };
  const track = (pp.track ?? {}) as {
    distance?: number;
    gainElevation?: number;
    lossElevation?: number;
    polyline?: string;
    profile?: [number, number][];
    points?: TrackPoint[];
  };
  const gpxUrl = typeof pp.gpxUrl === "string" ? pp.gpxUrl : null;
  if (!track.polyline && !gpxUrl) throw new Error("That page has no route.");
  const { line, gpx } = await lineFrom(gpxUrl, track.polyline ?? null, track.profile ?? null);
  const startIso = header.startDateIso || `${(event as { begin?: string }).begin?.slice(0, 10) ?? "2027-06-26"}T07:00:00`;
  const start = formatStart(startIso);
  const points = Array.isArray(track.points) ? track.points : [];
  const stations = points.length
    ? stationsFromPoints(points, line.lat, line.lon, line.ele, line.stepM, start)
    : [
        { id: "start", name: "Start", km: 0, officialKm: 0, officialDplus: 0, officialDminus: 0, ele: line.ele[0], lat: line.lat[0], lon: line.lon[0], kind: "start" as const, services: [], crew: true, dropBag: false, cutoff: null, cutoffSec: null, legNote: null },
        { id: "finish", name: "Finish", km: line.totalM / 1000, officialKm: line.totalM / 1000, officialDplus: 0, officialDminus: 0, ele: line.ele.at(-1) ?? 0, lat: line.lat.at(-1) ?? 0, lon: line.lon.at(-1) ?? 0, kind: "finish" as const, services: [], crew: true, dropBag: false, cutoff: null, cutoffSec: null, legNote: null },
      ];
  const finish = stations[stations.length - 1];
  let limit = finish?.cutoffSec ?? 0;
  if (header.endDateIso && header.startDateIso) {
    const a = Date.parse(header.startDateIso);
    const b = Date.parse(header.endDateIso);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) limit = Math.max(limit, Math.round((b - a) / 1000));
  }
  if (!limit) limit = Math.round((line.totalM / 1000 / 4) * 3600);
  const zone = zoneFor(line.lat[0], line.lon[0]);
  const sun = sunLocal(line.lat[0], start.date);
  const title = header.title || event.name || "Race";
  const slug = new URL(pageUrl).pathname.split("/").filter(Boolean).pop() || compact(title);
  const officialKm = track.distance ? Math.round((track.distance / 1000) * 10) / 10 : Math.round((line.totalM / 1000) * 10) / 10;
  const gain = Math.round(track.gainElevation || line.up);
  const host = new URL(pageUrl).host;
  const where = points[0]?.name && points[0].name.length > 2 ? points[0].name : event.placeName || "the start";
  return {
    id: slug,
    name: title,
    shortName: title.length > 32 ? `${title.slice(0, 30)}…` : title,
    location: where,
    raceDate: start.date,
    startLocal: start.startLocal,
    startUtc: zonedToUtc(startIso.slice(0, 19), zone),
    timeZone: zone,
    timeLimitSec: limit,
    officialDistanceKm: officialKm,
    officialGainM: gain,
    totalKm: Math.round((line.totalM / 1000) * 100) / 100,
    trackGainM: Math.round(line.up),
    trackLossM: Math.round(line.down),
    sunriseLocalSec: sun.sunrise,
    sunsetLocalSec: sun.sunset,
    source: {
      gpx: gpx,
      page: pageUrl,
      note: `Fetched from ${host}. Organiser lists ${officialKm} km and ${gain.toLocaleString("en-GB")} m of climb. The line is the published route (${Math.round((line.totalM / 1000) * 10) / 10} km).`,
    },
    estimated: false,
    stepM: line.stepM,
    lat: line.lat.map(round5),
    lon: line.lon.map(round5),
    ele: line.ele,
    aidStations: stations,
    climbs: climbsFrom(line.ele, line.stepM, stations),
  };
}

function gpxHrefs(html: string, base: string) {
  const out: string[] = [];
  const add = (href: string) => {
    try {
      const u = new URL(href, base).toString();
      if (/\.gpx(\?|$)/i.test(new URL(u).pathname) && allowed(u) && !out.includes(u)) out.push(u);
    } catch {
      // ignore a bad href
    }
  };
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/https?:\/\/[^"'\\\s>]+\.gpx/gi)) add(m[0]);
  return out;
}

function strip(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function courseFromGpx(pageUrl: string, html: string, phrase: string, stated: number | null): Promise<CourseData | null> {
  const hrefs = gpxHrefs(html, pageUrl);
  if (!hrefs.length) return null;
  const text = strip(html).slice(0, 12000);
  const title = (html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? phrase).split(/[|\-–—]/)[0].trim();
  let km = stated;
  const kmMatch = /(\d+(?:\.\d+)?)\s*(?:km|kilometres|kilometers)\b/i.exec(text);
  const miMatch = /(\d+(?:\.\d+)?)\s*(?:miles|mile)\b/i.exec(text);
  if (kmMatch) km = Number(kmMatch[1]);
  else if (miMatch) km = Number(miMatch[1]) * 1.60934;
  const gainMatch = /(\d{3,5})\s*m(?:\s*\+|\s+of climb|\s+d\+|\s+gain|\s+ascent)?/i.exec(text);
  const gain = gainMatch ? Number(gainMatch[1]) : null;
  const xml = await fetchText(hrefs[0], 20000);
  const pts = parseGpx(xml);
  if (pts.length < 30) return null;
  const line = resample(pts);
  const measured = line.totalM / 1000;
  if (stated != null && !kmClose(measured, stated) && km != null && !kmClose(km, stated)) return null;
  const start = formatStart("2027-06-19T07:00:00");
  const zone = zoneFor(line.lat[0], line.lon[0]);
  const sun = sunLocal(line.lat[0], start.date);
  const stations: AidStation[] = [
    { id: "start", name: "Start", km: 0, officialKm: 0, officialDplus: 0, officialDminus: 0, ele: line.ele[0], lat: line.lat[0], lon: line.lon[0], kind: "start", services: [], crew: true, dropBag: false, cutoff: null, cutoffSec: null, legNote: null },
    { id: "finish", name: "Finish", km: Math.round(measured * 100) / 100, officialKm: Math.round(measured * 10) / 10, officialDplus: Math.round(line.up), officialDminus: Math.round(line.down), ele: line.ele.at(-1) ?? 0, lat: line.lat.at(-1) ?? 0, lon: line.lon.at(-1) ?? 0, kind: "finish", services: [], crew: true, dropBag: false, cutoff: null, cutoffSec: null, legNote: null },
  ];
  const name = title || phrase;
  return {
    id: `gpx-${compact(hrefs[0]).slice(0, 24)}`,
    name,
    shortName: name.length > 32 ? `${name.slice(0, 30)}…` : name,
    location: "published start",
    raceDate: start.date,
    startLocal: start.startLocal,
    startUtc: zonedToUtc("2027-06-19T07:00:00", zone),
    timeZone: zone,
    timeLimitSec: Math.round((measured / 4) * 3600),
    officialDistanceKm: Math.round((km ?? measured) * 10) / 10,
    officialGainM: Math.round(gain ?? line.up),
    totalKm: Math.round(measured * 100) / 100,
    trackGainM: Math.round(line.up),
    trackLossM: Math.round(line.down),
    sunriseLocalSec: sun.sunrise,
    sunsetLocalSec: sun.sunset,
    estimated: false,
    source: {
      gpx: hrefs[0],
      page: pageUrl,
      note: `Route file linked from ${new URL(pageUrl).host}. Start time wasn't on that page, so the clock uses Saturday 07:00.`,
    },
    stepM: line.stepM,
    lat: line.lat.map(round5),
    lon: line.lon.map(round5),
    ele: line.ele,
    aidStations: stations,
    climbs: climbsFrom(line.ele, line.stepM, stations),
  };
}

function pack(course: CourseData): RaceLookup {
  return { choice: { id: course.id, course }, label: course.shortName };
}

async function fromUtmbPage(pageUrl: string, html: string, phrase: string, stated: number | null): Promise<RaceLookup | null> {
  if (!eventHost(pageUrl) && !html.includes("__NEXT_DATA__")) return null;
  const links = raceLinks(html, pageUrl);
  const decision = links.length ? decide(links, phrase, stated) : null;
  if (decision && "ask" in decision) return decision;
  const pp = nextData(html)?.props?.pageProps;
  const selfSlug = new URL(pageUrl).pathname.split("/").filter(Boolean).pop()?.toLowerCase() ?? "";
  const picked = decision && "pick" in decision ? decision.pick : null;
  let htmlForCourse = html;
  let urlForCourse = pageUrl;
  if (picked && picked.slug !== selfSlug) {
    htmlForCourse = await fetchText(picked.url);
    urlForCourse = picked.url;
  } else if (!picked && !pp?.gpxUrl && !(pp?.track as { polyline?: string } | undefined)?.polyline) {
    return null;
  }
  const course = await courseFromUtmb(urlForCourse, htmlForCourse);
  return pack(course);
}

export async function lookupRace(text: string): Promise<RaceLookup> {
  const raw = text.trim();
  if (raw.length < 2) return { ask: "What are you running?" };
  const phrase = raw
    .replace(/^(?:i(?:'m| am)?\s+)?(?:going to |gonna )?(?:run|running|doing|racing)\s+/i, "")
    .replace(/\b(?:next year|this year|please)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const stated = statedKm(raw);
  if (tokens(phrase).length === 0 && stated == null) return { ask: "What are you running? A race name, like Lavaredo 80K." };
  const key = phrase.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.value;

  let links = await search(`${phrase} official race`);
  if (links.length < 2) links = [...new Set([...links, ...(await search(phrase))])];
  const utmb = links.filter((u) => /\/races\/[a-z0-9-]+\/?$/i.test(new URL(u).pathname) && eventHost(u));
  const hosts = [...new Set(links.map(eventHost).filter((h): h is string => Boolean(h)))];
  const first = utmb[0] ? englishUtmb(utmb[0]) : hosts[0] ? `https://${hosts[0]}/` : null;
  if (first) {
    try {
      const html = await fetchText(first);
      const built = await fromUtmbPage(first, html, phrase, stated);
      if (built) {
        cache.set(key, { at: Date.now(), value: built });
        return built;
      }
    } catch {
      // try the other results
    }
  }

  for (const url of links.filter((u) => u !== first).slice(0, 4)) {
    try {
      const html = await fetchText(url);
      if (html.includes("__NEXT_DATA__") && (eventHost(url) || html.includes("gpxUrl"))) {
        const built = await fromUtmbPage(englishUtmb(url), html, phrase, stated);
        if (built) {
          cache.set(key, { at: Date.now(), value: built });
          return built;
        }
      }
      const gpxCourse = await courseFromGpx(url, html, phrase, stated);
      if (gpxCourse) {
        const packed = pack(gpxCourse);
        cache.set(key, { at: Date.now(), value: packed });
        return packed;
      }
    } catch {
      // this result didn't publish a route
    }
  }

  return { error: "I couldn't find a published route for that. Try the race name and the distance." };
}
