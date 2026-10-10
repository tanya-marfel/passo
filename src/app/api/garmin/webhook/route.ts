import { followPings } from "@/lib/garmin-connect/api";
import { ingestGarminPayload } from "@/lib/garmin-connect/ingest";

export function GET() {
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  const expected = process.env.GARMIN_WEBHOOK_TOKEN?.trim();
  if (expected && new URL(request.url).searchParams.get("token") !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const pings = ingestGarminPayload(body, null);
  await followPings(pings);
  return Response.json({ ok: true });
}
