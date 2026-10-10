import { deregister } from "@/lib/garmin-connect/api";
import { garminConfigured } from "@/lib/garmin-connect/config";
import { clearSession, currentSession } from "@/lib/garmin-connect/session";

function info(connected: boolean, runs = 0) {
  return { configured: garminConfigured(), connected, runs };
}

export async function GET() {
  const session = await currentSession();
  return Response.json(info(Boolean(session), session?.activities.length ?? 0));
}

export async function DELETE() {
  const session = await currentSession();
  if (session) await deregister(session);
  await clearSession();
  return Response.json(info(false));
}
