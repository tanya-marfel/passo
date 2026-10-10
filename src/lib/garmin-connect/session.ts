import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import type { Activity } from "@/lib/garmin";
import { secureCookie } from "./config";

const SESSION_COOKIE = "rr_garmin";
const STATE_COOKIE = "rr_garmin_state";
const COOKIE_PATH = "/api/garmin";
const SESSION_TTL_S = 12 * 3600;
const STATE_TTL_S = 10 * 60;

export type GarminTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  refreshExpiresAt: number;
};

export type GarminSession = {
  tokens: GarminTokens;
  userId: string | null;
  permissions: string[];
  activities: Activity[];
  skipped: { file: string; reason: string }[];
  seen: Set<string>;
  notice: string | null;
  backfill: Promise<void> | null;
  pulled: boolean;
  expiresAt: number;
};

type Pending = { verifier: string; expiresAt: number };

type Bag = {
  sessions: Map<string, GarminSession>;
  pending: Map<string, Pending>;
  byUser: Map<string, string>;
};

const g = globalThis as typeof globalThis & { __rrGarmin?: Bag };
const bag: Bag = (g.__rrGarmin ??= { sessions: new Map(), pending: new Map(), byUser: new Map() });

function sweep() {
  const now = Date.now();
  for (const [id, pending] of bag.pending) if (pending.expiresAt < now) bag.pending.delete(id);
  for (const [id, session] of bag.sessions) {
    if (session.expiresAt >= now) continue;
    bag.sessions.delete(id);
    if (session.userId && bag.byUser.get(session.userId) === id) bag.byUser.delete(session.userId);
  }
}

const cookieBase = (request: Request, maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: secureCookie(request),
  path: COOKIE_PATH,
  maxAge,
});

export function rememberLogin(res: NextResponse, state: string, verifier: string, request: Request) {
  sweep();
  bag.pending.set(state, { verifier, expiresAt: Date.now() + STATE_TTL_S * 1000 });
  res.cookies.set(STATE_COOKIE, state, cookieBase(request, STATE_TTL_S));
}

export async function takeLogin(state: string | null): Promise<string | null> {
  sweep();
  const jar = await cookies();
  const cookieState = jar.get(STATE_COOKIE)?.value ?? null;
  jar.delete({ name: STATE_COOKIE, path: COOKIE_PATH });
  if (!state || state !== cookieState) return null;
  const pending = bag.pending.get(state);
  bag.pending.delete(state);
  if (!pending || pending.expiresAt < Date.now()) return null;
  return pending.verifier;
}

export async function saveSession(tokens: GarminTokens, request: Request, res: NextResponse): Promise<GarminSession> {
  sweep();
  const jar = await cookies();
  const previous = jar.get(SESSION_COOKIE)?.value;
  if (previous) drop(previous);
  const id = randomBytes(24).toString("base64url");
  const session: GarminSession = {
    tokens,
    userId: null,
    permissions: [],
    activities: [],
    skipped: [],
    seen: new Set(),
    notice: null,
    backfill: null,
    pulled: false,
    expiresAt: Date.now() + SESSION_TTL_S * 1000,
  };
  bag.sessions.set(id, session);
  res.cookies.set(SESSION_COOKIE, id, cookieBase(request, SESSION_TTL_S));
  return session;
}

export function bindUser(session: GarminSession, userId: string) {
  session.userId = userId;
  for (const [id, stored] of bag.sessions) {
    if (stored === session) bag.byUser.set(userId, id);
  }
}

export function sessionForUser(userId: string) {
  sweep();
  const id = bag.byUser.get(userId);
  return (id && bag.sessions.get(id)) || null;
}

export async function currentSession(): Promise<GarminSession | null> {
  sweep();
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id) return null;
  return bag.sessions.get(id) ?? null;
}

function drop(id: string) {
  const session = bag.sessions.get(id);
  bag.sessions.delete(id);
  if (session?.userId && bag.byUser.get(session.userId) === id) bag.byUser.delete(session.userId);
}

export async function clearSession() {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) drop(id);
  jar.delete({ name: SESSION_COOKIE, path: COOKIE_PATH });
  jar.delete({ name: STATE_COOKIE, path: COOKIE_PATH });
}
