import { NextResponse } from "next/server";
import { exchangeCode, GarminAuthError, loadAccount, requestBackfill } from "@/lib/garmin-connect/api";
import { garminRedirectUri, publicOrigin } from "@/lib/garmin-connect/config";
import { saveSession, takeLogin } from "@/lib/garmin-connect/session";

function home(request: Request, flag: string, reason?: string) {
  const url = new URL("/", publicOrigin(request));
  url.searchParams.set("garmin", flag);
  if (reason) url.searchParams.set("reason", reason);
  return url;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    const reason = oauthError === "access_denied" ? "You cancelled sign-in on Garmin." : "Garmin didn't complete sign-in.";
    return NextResponse.redirect(home(request, oauthError === "access_denied" ? "denied" : "error", reason));
  }

  const code = url.searchParams.get("code");
  const verifier = await takeLogin(url.searchParams.get("state"));
  if (!code || !verifier) {
    return NextResponse.redirect(home(request, "error", "That Garmin sign-in expired. Connect again."));
  }

  try {
    const tokens = await exchangeCode(code, verifier, garminRedirectUri(request));
    const res = NextResponse.redirect(home(request, "connected"));
    const session = await saveSession(tokens, request, res);
    try {
      await loadAccount(session);
      if (session.permissions.length && !session.permissions.some((p) => /ACTIVITY/i.test(p))) {
        session.notice = "Garmin connected, but activity access wasn't allowed. Connect again and allow activities.";
      }
    } catch {
      session.notice = "Signed in on Garmin. Waiting for your runs to arrive.";
    }
    session.backfill = requestBackfill(session).catch(() => {
      if (!session.notice) session.notice = "Signed in on Garmin. Your runs arrive once Garmin can reach this app's webhook.";
    });
    return res;
  } catch (err) {
    const reason = err instanceof GarminAuthError ? err.message : "Garmin sign-in didn't finish.";
    return NextResponse.redirect(home(request, "error", reason));
  }
}
