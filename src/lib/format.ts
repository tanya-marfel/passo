import { localClockSec } from "@/lib/course";

export function fmtDuration(sec: number, withSeconds = false) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (withSeconds) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function fmtHm(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function fmtDelta(sec: number) {
  const sign = sec < 0 ? "-" : "+";
  const a = Math.abs(Math.round(sec));
  if (a < 60) return `${sign}${a}s`;
  if (a < 3600) return `${sign}${Math.round(a / 60)} min`;
  return `${sign}${fmtDuration(a)}`;
}

export function fmtPace(secPerKm: number) {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return "--:--";
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const DAYS = ["Fri", "Sat", "Sun", "Mon"];

/** Race clock seconds -> local wall clock, e.g. "Sat 04:30". */
export function fmtClock(raceSec: number, withDay = true) {
  const c = localClockSec(raceSec);
  const h = Math.floor(c / 3600);
  const m = Math.floor((c % 3600) / 60);
  const dayIdx = Math.floor((23 * 3600 + raceSec) / 86400);
  const hm = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return withDay ? `${DAYS[Math.min(DAYS.length - 1, dayIdx)]} ${hm}` : hm;
}

export const fmtKm = (m: number, digits = 1) => `${(m / 1000).toFixed(digits)} km`;

export function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
