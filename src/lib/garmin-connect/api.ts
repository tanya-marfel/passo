import { createHash, randomBytes } from "node:crypto";
import { GARMIN_API, GARMIN_TOKEN_URL, garminCallbackUrl, garminClientId, garminClientSecret } from "./config";
import { bindUser, sessionForUser, type GarminSession, type GarminTokens } from "./session";
import { ingestGarminPayload, type GarminPing } from "./ingest";

export class GarminAuthError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export function createPkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge, state: randomBytes(24).toString("base64url") };
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
};

function tokensFrom(body: TokenResponse, previous?: GarminTokens): GarminTokens {
  if (!body.access_token) throw new GarminAuthError("Garmin didn't return an access token.");
  const now = Date.now();
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token || previous?.refreshToken || "",
    expiresAt: now + Math.max(60, body.expires_in ?? 3600) * 1000,
    refreshExpiresAt: now + Math.max(60, body.refresh_token_expires_in ?? 0) * 1000,
  };
}

async function tokenRequest(fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  let res: Response;
  try {
    res = await fetch(GARMIN_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new GarminAuthError("Couldn't reach Garmin to finish sign-in.");
  }
  const json = (await res.json().catch(() => null)) as TokenResponse | null;
  if (!res.ok || !json?.access_token) {
    throw new GarminAuthError("Garmin didn't accept the sign-in. Check the client id, secret and redirect URI.");
  }
  return json;
}

export async function exchangeCode(code: string, verifier: string, redirectUri: string) {
  const json = await tokenRequest({
    grant_type: "authorization_code",
    client_id: garminClientId(),
    client_secret: garminClientSecret(),
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
  });
  return tokensFrom(json);
}

async function refresh(tokens: GarminTokens) {
  if (!tokens.refreshToken) throw new GarminAuthError("Garmin sign-in expired. Connect again.");
  const json = await tokenRequest({
    grant_type: "refresh_token",
    client_id: garminClientId(),
    client_secret: garminClientSecret(),
    refresh_token: tokens.refreshToken,
  });
  return tokensFrom(json, tokens);
}

export async function accessToken(session: GarminSession) {
  if (session.tokens.expiresAt > Date.now() + 60_000) return session.tokens.accessToken;
  session.tokens = await refresh(session.tokens);
  return session.tokens.accessToken;
}

async function garminFetch(token: string, path: string, init?: RequestInit) {
  return fetch(`${GARMIN_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(20000),
  });
}

function permissionList(body: unknown): string[] {
  if (Array.isArray(body)) return body.filter((x) => typeof x === "string");
  if (body && typeof body === "object" && Array.isArray((body as { permissions?: unknown }).permissions)) {
    return (body as { permissions: unknown[] }).permissions.filter((x) => typeof x === "string") as string[];
  }
  return [];
}

export async function loadAccount(session: GarminSession) {
  const token = await accessToken(session);
  const idRes = await garminFetch(token, "/user/id");
  if (idRes.ok) {
    const body = (await idRes.json().catch(() => null)) as { userId?: unknown } | null;
    if (typeof body?.userId === "string" && body.userId) bindUser(session, body.userId);
  }
  const permRes = await garminFetch(token, "/user/permissions");
  if (permRes.ok) session.permissions = permissionList(await permRes.json().catch(() => null));
}

const DAY = 86400;

/** Ask Garmin to push the last year of activities. Delivery is asynchronous, to the registered webhook. */
export async function requestBackfill(session: GarminSession) {
  const token = await accessToken(session);
  const now = Math.floor(Date.now() / 1000);
  let accepted = 0;
  for (let i = 0; i < 4; i++) {
    const end = now - i * 89 * DAY;
    const start = end - 89 * DAY;
    const path = `/backfill/activities?summaryStartTimeInSeconds=${start}&summaryEndTimeInSeconds=${end}`;
    let res = await garminFetch(token, path);
    if (res.status === 405) res = await garminFetch(token, path, { method: "POST" });
    if (res.status === 202 || res.status === 409) {
      accepted++;
      continue;
    }
    if (res.status === 429) break;
    if (res.status === 403) {
      session.notice = "Garmin connected, but this account didn't allow historical activities. Connect again and allow Activity Export and Historical Data.";
      break;
    }
    if (accepted === 0) session.notice = "Garmin connected. Your runs arrive once Garmin can reach this app's webhook.";
    break;
  }
  if (accepted > 0 && !session.notice) {
    session.notice = "Signed in on Garmin. Waiting for your runs to arrive.";
  }
}

export async function pullRecent(session: GarminSession) {
  if (session.pulled) return;
  session.pulled = true;
  const token = await accessToken(session);
  const end = Math.floor(Date.now() / 1000);
  const res = await garminFetch(token, `/activityDetails?uploadStartTimeInSeconds=${end - DAY}&uploadEndTimeInSeconds=${end}`);
  if (!res.ok) return;
  const pings = ingestGarminPayload(await res.json().catch(() => null), session.userId);
  await Promise.all(pings.map((ping) => followPing(ping.userId, ping.callbackURL)));
}

export async function followPings(pings: GarminPing[]) {
  await Promise.all(pings.map((ping) => followPing(ping.userId, ping.callbackURL).catch(() => undefined)));
}

export async function deregister(session: GarminSession) {
  try {
    const token = await accessToken(session);
    await garminFetch(token, "/user/registration", { method: "DELETE" });
  } catch {
    // Local sign-out still succeeds if Garmin is unreachable.
  }
}

/** Follow a Garmin ping URL and store whatever activities it returns. */
export async function followPing(userId: string, callbackURL: string) {
  const session = sessionForUser(userId);
  const url = garminCallbackUrl(callbackURL);
  if (!session || !url) return;
  const token = await accessToken(session);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) return;
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("json")) {
    ingestGarminPayload(await res.json().catch(() => null), userId);
    return;
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const { importActivityBytes } = await import("@/lib/garmin");
  const parsed = await importActivityBytes(`${userId}.fit`, bytes);
  session.activities = dedupe(session.activities, parsed.activities);
  session.skipped.push(...parsed.skipped);
}

function dedupe(current: GarminSession["activities"], extra: GarminSession["activities"]) {
  const seen = new Set(current.map((a) => a.startMs));
  const merged = [...current];
  for (const activity of extra) {
    if (seen.has(activity.startMs)) continue;
    seen.add(activity.startMs);
    merged.push(activity);
  }
  return merged.sort((a, b) => b.startMs - a.startMs).slice(0, 80);
}
