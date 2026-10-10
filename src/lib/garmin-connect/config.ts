/** Official Garmin Connect OAuth 2.0 PKCE. The user signs in on connect.garmin.com, never here. */

/** Garmin's current consent page. It sends the browser to the Garmin Connect sign-in, then back here after the user allows access. */
export const GARMIN_AUTHORIZE_URL = "https://connect.garmin.com/partner/oauth2Confirm";
export const GARMIN_TOKEN_URL = "https://diauth.garmin.com/di-oauth2-service/oauth/token";
export const GARMIN_API = "https://apis.garmin.com/wellness-api/rest";

const CALLBACK_HOSTS = new Set(["apis.garmin.com", "healthapi.garmin.com"]);

export function garminConfigured() {
  return Boolean(process.env.GARMIN_CLIENT_ID?.trim() && process.env.GARMIN_CLIENT_SECRET?.trim());
}

export function garminClientId() {
  const id = process.env.GARMIN_CLIENT_ID?.trim();
  if (!id) throw new Error("GARMIN_CLIENT_ID is not set");
  return id;
}

export function garminClientSecret() {
  const secret = process.env.GARMIN_CLIENT_SECRET?.trim();
  if (!secret) throw new Error("GARMIN_CLIENT_SECRET is not set");
  return secret;
}

export function publicOrigin(request: Request) {
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host");
  if (proto && host) return `${proto}://${host}`;
  return url.origin;
}

/** Must match the redirect URI registered on the Garmin developer portal. */
export function garminRedirectUri(request: Request) {
  const explicit = process.env.GARMIN_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  return `${publicOrigin(request)}/api/garmin/callback`;
}

export function secureCookie(request: Request) {
  return new URL(publicOrigin(request)).protocol === "https:";
}

/** Garmin ping callbacks are fetched server-side, so the host has to be Garmin's. */
export function garminCallbackUrl(raw: string) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && CALLBACK_HOSTS.has(url.hostname) ? url : null;
  } catch {
    return null;
  }
}
