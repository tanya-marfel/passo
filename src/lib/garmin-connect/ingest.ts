import { activityFromSamples, type Activity, type RawPoint } from "@/lib/garmin";
import { sessionForUser, type GarminSession } from "./session";

type Sample = {
  startTimeInSeconds?: number;
  latitudeInDegree?: number;
  longitudeInDegree?: number;
  elevationInMeters?: number;
  heartRate?: number;
  heartRateInBeatsPerMinute?: number;
  totalDistanceInMeters?: number;
  clockDurationInSeconds?: number;
};

type Detail = {
  userId?: string;
  summaryId?: string;
  activityId?: number;
  activityName?: string;
  callbackURL?: string;
  summary?: Record<string, unknown> & {
    activityName?: string;
    activityType?: string;
    startTimeInSeconds?: number;
  };
  samples?: Sample[];
};

const RUN = /run|walk|hik|trail|obstacle/i;

function isRun(type: string) {
  return RUN.test(type) && !/bike|cycl|swim|row|ski/i.test(type);
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function activityName(detail: Detail) {
  const named = detail.activityName || detail.summary?.activityName;
  if (typeof named === "string" && named.trim()) return named.trim();
  const type = String(detail.summary?.activityType ?? "Run").replaceAll("_", " ").toLowerCase();
  const start = num(detail.summary?.startTimeInSeconds);
  const when = start ? new Date(start * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "run";
  return `${type} · ${when}`;
}

function downsample<T>(items: T[], max: number) {
  if (items.length <= max) return items;
  const step = (items.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(items[Math.round(i * step)]);
  return out;
}

function detailToActivity(detail: Detail): Activity | string | null {
  const summary = detail.summary ?? {};
  const sport = String(summary.activityType ?? "running");
  if (summary.isParent === true) return null;
  if (!isRun(sport)) return `not a run (${sport})`;
  const id = String(detail.summaryId ?? detail.activityId ?? summary.startTimeInSeconds ?? "");
  if (!id) return "activity had no id";
  const samples = downsample(detail.samples ?? [], 3000);
  if (samples.length < 30) return "Garmin sent this run without a GPS track";
  const start = num(summary.startTimeInSeconds) ?? num(samples[0]?.startTimeInSeconds) ?? 0;
  const raw: RawPoint[] = [];
  for (const sample of samples) {
    const clock = num(sample.clockDurationInSeconds);
    const at = num(sample.startTimeInSeconds);
    const time = at !== undefined ? at * 1000 : clock !== undefined ? start * 1000 + clock * 1000 : NaN;
    raw.push({
      time,
      lat: num(sample.latitudeInDegree),
      lon: num(sample.longitudeInDegree),
      ele: num(sample.elevationInMeters),
      dist: num(sample.totalDistanceInMeters),
      hr: num(sample.heartRate) ?? num(sample.heartRateInBeatsPerMinute),
    });
  }
  return activityFromSamples(raw, { name: activityName(detail), sport, source: "garmin-api", fileName: id });
}

function addActivity(session: GarminSession, activity: Activity, key: string) {
  if (session.seen.has(key) || session.activities.some((a) => a.startMs === activity.startMs)) return;
  session.seen.add(key);
  session.activities = [...session.activities, activity].sort((a, b) => b.startMs - a.startMs).slice(0, 80);
}

export function ingestDetails(details: Detail[], fallbackUserId: string | null) {
  const pings: { userId: string; callbackURL: string }[] = [];
  for (const detail of details) {
    const userId = detail.userId || fallbackUserId;
    if (!userId) continue;
    const session = sessionForUser(userId);
    if (!session) continue;
    if (detail.callbackURL && !detail.samples?.length) {
      pings.push({ userId, callbackURL: detail.callbackURL });
      continue;
    }
    const parsed = detailToActivity(detail);
    const key = String(detail.summaryId ?? detail.activityId ?? "");
    if (!parsed || !key) continue;
    if (typeof parsed === "string") session.skipped.push({ file: activityName(detail), reason: parsed });
    else addActivity(session, parsed, key);
  }
  return pings;
}

export type GarminPing = { userId: string; callbackURL: string };

/** Accepts a Garmin push body, a ping body, or a bare activity-details array. Returns ping URLs still to fetch. */
export function ingestGarminPayload(body: unknown, fallbackUserId: string | null): GarminPing[] {
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;
  if (Array.isArray(record.deregistrations)) {
    for (const item of record.deregistrations) {
      const userId = item && typeof item === "object" ? (item as { userId?: unknown }).userId : null;
      if (typeof userId !== "string") continue;
      const session = sessionForUser(userId);
      if (!session) continue;
      session.activities = [];
      session.notice = "This Garmin account disconnected Rival Run.";
    }
  }
  const details = [
    ...(Array.isArray(body) ? body : []),
    ...(Array.isArray(record.activityDetails) ? record.activityDetails : []),
    ...(Array.isArray(record.activities) ? record.activities : []),
  ] as Detail[];
  const pings = ingestDetails(details, fallbackUserId);
  const files = Array.isArray(record.activityFiles) ? record.activityFiles : [];
  for (const file of files) {
    if (!file || typeof file !== "object") continue;
    const row = file as { userId?: unknown; callbackURL?: unknown };
    if (typeof row.userId === "string" && typeof row.callbackURL === "string") pings.push({ userId: row.userId, callbackURL: row.callbackURL });
  }
  return pings;
}
