import { pullRecent, requestBackfill } from "@/lib/garmin-connect/api";
import { currentSession } from "@/lib/garmin-connect/session";

export async function GET() {
  const session = await currentSession();
  if (!session) return Response.json({ error: "Connect Garmin first." }, { status: 401 });

  if (!session.backfill) {
    session.backfill = requestBackfill(session).catch(() => {
      session.notice = "Signed in on Garmin. Your runs arrive once Garmin can reach this app's webhook.";
    });
  }
  await session.backfill;
  await pullRecent(session).catch(() => undefined);

  const ready = session.activities.length > 0;
  return Response.json({
    status: ready ? "ready" : "waiting",
    activities: session.activities,
    skipped: session.skipped.slice(0, 20),
    message: ready ? null : (session.notice ?? "Signed in on Garmin. Waiting for your runs to arrive."),
  });
}
