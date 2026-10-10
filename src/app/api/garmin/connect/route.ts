import { NextResponse } from "next/server";
import { GARMIN_AUTHORIZE_URL, garminConfigured, garminClientId, garminRedirectUri, publicOrigin } from "@/lib/garmin-connect/config";
import { createPkce } from "@/lib/garmin-connect/api";
import { rememberLogin } from "@/lib/garmin-connect/session";

function home(request: Request, flag: string, reason?: string) {
  const url = new URL("/", publicOrigin(request));
  url.searchParams.set("garmin", flag);
  if (reason) url.searchParams.set("reason", reason);
  return url;
}

export async function GET(request: Request) {
  if (!garminConfigured()) {
    return NextResponse.redirect(
      home(request, "error", "Add GARMIN_CLIENT_ID and GARMIN_CLIENT_SECRET from your Garmin Connect developer app, then restart the server."),
    );
  }
  const { verifier, challenge, state } = createPkce();
  const redirectUri = garminRedirectUri(request);
  const auth = new URL(GARMIN_AUTHORIZE_URL);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("client_id", garminClientId());
  auth.searchParams.set("code_challenge", challenge);
  auth.searchParams.set("code_challenge_method", "S256");
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("state", state);
  const res = NextResponse.redirect(auth);
  rememberLogin(res, state, verifier, request);
  return res;
}
