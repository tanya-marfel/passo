import { runCoach } from "@/lib/coach/run";
import { ensureCoachCourse } from "@/lib/races";
import { COACH_STREAM_TYPE, type CoachRequest, type CoachStreamEvent } from "@/lib/coach/types";

export async function POST(request: Request) {
  let req: CoachRequest;
  try {
    req = (await request.json()) as CoachRequest;
    if (!req?.trigger?.type || !req.live || !req.profile?.model) throw new Error("missing fields");
    ensureCoachCourse(req.race);
  } catch {
    return Response.json({ error: "Invalid coach request" }, { status: 400 });
  }

  if (!request.headers.get("accept")?.includes(COACH_STREAM_TYPE)) {
    try {
      return Response.json(await runCoach(req));
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "Coach failed" }, { status: 500 });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: CoachStreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      try {
        send({ type: "done", response: await runCoach(req, send) });
      } catch (err) {
        send({ type: "error", error: err instanceof Error ? err.message : "Coach failed" });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": `${COACH_STREAM_TYPE}; charset=utf-8`,
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
