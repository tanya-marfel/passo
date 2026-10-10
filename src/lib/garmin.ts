export type ActivityPoint = {
  /** seconds since activity start */
  t: number;
  /** cumulative distance in metres */
  d: number;
  ele: number | null;
  hr: number | null;
};

export type Activity = {
  id: string;
  name: string;
  sport: string;
  startMs: number;
  points: ActivityPoint[];
  source: "gpx" | "tcx" | "fit" | "sample";
  fileName?: string;
};

export type ImportResult = {
  activities: Activity[];
  skipped: { file: string; reason: string }[];
};

type RawPoint = { time: number; lat?: number; lon?: number; ele?: number; dist?: number; hr?: number };

const R = 6371000;
function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function child(el: Element, local: string): Element | null {
  for (const c of Array.from(el.children)) if (c.localName === local) return c;
  return null;
}

function descendant(el: Element, local: string): Element | null {
  const all = el.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) if (all[i].localName === local) return all[i];
  return null;
}

function num(el: Element | null) {
  if (!el?.textContent) return undefined;
  const v = parseFloat(el.textContent);
  return Number.isFinite(v) ? v : undefined;
}

function toActivity(
  raw: RawPoint[],
  meta: { name: string; sport: string; source: Activity["source"]; fileName: string },
): Activity | string {
  const pts = raw.filter((p) => Number.isFinite(p.time)).sort((a, b) => a.time - b.time);
  if (pts.length < 30) return "too few points with timestamps";
  const hasDist = pts.filter((p) => p.dist !== undefined).length > pts.length * 0.8;
  const hasPos = pts.filter((p) => p.lat !== undefined && p.lon !== undefined).length > pts.length * 0.8;
  if (!hasDist && !hasPos) return "no GPS or distance data";

  const out: ActivityPoint[] = [];
  const t0 = pts[0].time;
  let d = 0;
  let last: RawPoint | null = null;
  let lastDist = 0;
  for (const p of pts) {
    if (hasDist && p.dist !== undefined) {
      d = Math.max(d, p.dist);
    } else if (hasPos && last && p.lat !== undefined && p.lon !== undefined && last.lat !== undefined && last.lon !== undefined) {
      d += haversine(last.lat, last.lon, p.lat, p.lon);
    }
    if (p.lat !== undefined || p.dist !== undefined) last = p;
    const tt = (p.time - t0) / 1000;
    if (out.length && tt <= out[out.length - 1].t) continue;
    out.push({ t: tt, d, ele: p.ele ?? null, hr: p.hr && p.hr > 30 ? p.hr : null });
    lastDist = d;
  }
  const durationS = out[out.length - 1].t;
  if (lastDist < 2000) return "shorter than 2 km";
  if (durationS < 600) return "shorter than 10 minutes";
  return {
    id: `${meta.fileName}-${t0}`,
    name: meta.name,
    sport: meta.sport,
    startMs: t0,
    points: out,
    source: meta.source,
    fileName: meta.fileName,
  };
}

function parseGpx(text: string, fileName: string) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return "not valid XML";
  const trk = descendant(doc.documentElement, "trk");
  const name = (trk && child(trk, "name")?.textContent?.trim()) || fileName.replace(/\.[^.]+$/, "");
  const sport = (trk && child(trk, "type")?.textContent?.trim()) || "running";
  const raw: RawPoint[] = [];
  const all = doc.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (el.localName !== "trkpt") continue;
    const time = child(el, "time")?.textContent;
    if (!time) continue;
    raw.push({
      time: Date.parse(time),
      lat: parseFloat(el.getAttribute("lat") ?? ""),
      lon: parseFloat(el.getAttribute("lon") ?? ""),
      ele: num(child(el, "ele")),
      hr: num(descendant(el, "hr")),
    });
  }
  return toActivity(raw, { name, sport, source: "gpx", fileName });
}

function parseTcx(text: string, fileName: string) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return "not valid XML";
  const act = descendant(doc.documentElement, "Activity");
  const sport = act?.getAttribute("Sport")?.toLowerCase() ?? "running";
  const raw: RawPoint[] = [];
  const all = doc.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (el.localName !== "Trackpoint") continue;
    const time = child(el, "Time")?.textContent;
    if (!time) continue;
    const pos = child(el, "Position");
    const hrEl = child(el, "HeartRateBpm");
    raw.push({
      time: Date.parse(time),
      lat: pos ? num(child(pos, "LatitudeDegrees")) : undefined,
      lon: pos ? num(child(pos, "LongitudeDegrees")) : undefined,
      ele: num(child(el, "AltitudeMeters")),
      dist: num(child(el, "DistanceMeters")),
      hr: hrEl ? num(child(hrEl, "Value")) : undefined,
    });
  }
  return toActivity(raw, { name: fileName.replace(/\.[^.]+$/, ""), sport, source: "tcx", fileName });
}

async function parseFit(bytes: Uint8Array, fileName: string) {
  const { Decoder, Stream } = await import("@garmin/fitsdk");
  const stream = Stream.fromBuffer(bytes);
  if (!Decoder.isFIT(stream)) return "not a FIT file";
  const decoder = new Decoder(stream);
  const { messages } = decoder.read({ convertDateTimesToDates: true });
  const session = messages.sessionMesgs?.[0];
  const sport = String(session?.subSport && session.subSport !== "generic" ? `${session.sport}_${session.subSport}` : session?.sport ?? "running");
  if (session?.sport && !/run|walk|hik|trail|generic/i.test(String(session.sport))) return `not a running activity (${session.sport})`;
  const semi = 180 / 2 ** 31;
  const raw: RawPoint[] = (messages.recordMesgs ?? []).map((r) => ({
    time: r.timestamp instanceof Date ? r.timestamp.getTime() : NaN,
    lat: typeof r.positionLat === "number" ? r.positionLat * semi : undefined,
    lon: typeof r.positionLong === "number" ? r.positionLong * semi : undefined,
    ele: (r.enhancedAltitude ?? r.altitude) as number | undefined,
    dist: r.distance as number | undefined,
    hr: r.heartRate as number | undefined,
  }));
  return toActivity(raw, { name: fileName.replace(/\.[^.]+$/, ""), sport, source: "fit", fileName });
}

export type ImportProgress = (message: string) => void;

const MAX_ACTIVITY_FILES_PER_ZIP = 150;
const MAX_FILE_BYTES = 1.5e9;
const ACTIVITY_FILE = /\.(fit|gpx|tcx)$/i;
const basename = (path: string) => path.split("/").pop() ?? path;
const yieldToUi = () => new Promise((r) => setTimeout(r, 0));

async function parseZip(name: string, bytes: Uint8Array, depth: number, result: ImportResult, progress?: ImportProgress) {
  if (depth > 2) return;
  const { unzipSync } = await import("fflate");
  const listed: { path: string; size: number }[] = [];
  unzipSync(bytes, {
    filter: (f) => {
      if (!f.name.startsWith("__MACOSX/") && /\.(fit|gpx|tcx|zip)$/i.test(f.name)) listed.push({ path: f.name, size: f.originalSize });
      return false;
    },
  });
  // A full account export keeps the uploaded FIT files in nested ZIPs. Long runs are the biggest files, so read those first.
  const zips = listed.filter((e) => /\.zip$/i.test(e.path));
  const activities = listed.filter((e) => ACTIVITY_FILE.test(e.path)).sort((a, b) => b.size - a.size);
  const chosen = [...zips, ...activities.slice(0, MAX_ACTIVITY_FILES_PER_ZIP)];
  if (!chosen.length) {
    result.skipped.push({ file: name, reason: "zip contains no FIT, GPX or TCX files" });
    return;
  }
  if (activities.length > MAX_ACTIVITY_FILES_PER_ZIP) {
    result.skipped.push({ file: name, reason: `read the ${MAX_ACTIVITY_FILES_PER_ZIP} largest of ${activities.length} activity files` });
  }
  const keep = new Set(chosen.map((e) => e.path));
  const entries = unzipSync(bytes, { filter: (f) => keep.has(f.name) });
  for (let i = 0; i < chosen.length; i++) {
    if (i % 4 === 0) {
      progress?.(`Reading ${basename(name)}: file ${i + 1} of ${chosen.length}…`);
      await yieldToUi();
    }
    await parseEntry(basename(chosen[i].path), entries[chosen[i].path], depth + 1, result, progress);
  }
}

async function parseEntry(name: string, bytes: Uint8Array, depth: number, result: ImportResult, progress?: ImportProgress) {
  const lower = name.toLowerCase();
  try {
    if (lower.endsWith(".zip")) return await parseZip(name, bytes, depth, result, progress);
    let parsed: Activity | string;
    if (lower.endsWith(".fit")) parsed = await parseFit(bytes, name);
    else if (lower.endsWith(".gpx")) parsed = parseGpx(new TextDecoder().decode(bytes), name);
    else if (lower.endsWith(".tcx")) parsed = parseTcx(new TextDecoder().decode(bytes).trim(), name);
    else parsed = "unsupported file type (use .fit, .gpx, .tcx or .zip)";
    if (typeof parsed === "string") result.skipped.push({ file: name, reason: parsed });
    else if (/cycl|bik|swim/i.test(parsed.sport)) result.skipped.push({ file: name, reason: `not a run (${parsed.sport})` });
    else result.activities.push(parsed);
  } catch (err) {
    result.skipped.push({ file: name, reason: err instanceof Error ? err.message : "could not be parsed" });
  }
}

export async function importFiles(files: File[], progress?: ImportProgress): Promise<ImportResult> {
  const result: ImportResult = { activities: [], skipped: [] };
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (f.size > MAX_FILE_BYTES) {
      result.skipped.push({ file: f.name, reason: "too large to read in the browser; unzip it and drop the FIT files from DI-Connect-Uploaded-Files" });
      continue;
    }
    if (files.length > 1) {
      progress?.(`Reading file ${i + 1} of ${files.length}…`);
      await yieldToUi();
    }
    await parseEntry(f.name, new Uint8Array(await f.arrayBuffer()), 0, result, progress);
  }
  const seen = new Set<number>();
  result.activities = result.activities
    .filter((a) => (seen.has(a.startMs) ? false : (seen.add(a.startMs), true)))
    .sort((a, b) => b.startMs - a.startMs)
    .slice(0, 120);
  return result;
}
