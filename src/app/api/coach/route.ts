import { geminiCoach } from "@/lib/coach/gemini";
import { offlineCoach } from "@/lib/coach/offline";
import { COACH_STREAM_TYPE, type CoachRequest, type CoachResponse, type CoachStreamEvent } from "@/lib/coach/types";

const NO_KEY_NOTE = "No GEMINI_API_KEY set, using the offline coach.";

export async function POST(request: Request) {
  let req: CoachRequest;
  try {
    req = (await request.json()) as CoachRequest;
    if (!req?.trigger?.type || !req.live || !req.profile?.model) throw new Error("missing fields");
  } catch {
    return Response.json({ error: "Invalid coach request" }, { status: 400 });
  }
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const run = (onEvent?: (e: CoachStreamEvent) => void): Promise<CoachResponse> =>
    key ? geminiCoach(req, key, onEvent) : Promise.resolve(offlineCoach(req, NO_KEY_NOTE));

  if (!request.headers.get("accept")?.includes(COACH_STREAM_TYPE)) {
    try {
      return Response.json(await run());
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "Coach failed" }, { status: 500 });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: CoachStreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      try {
        if (!key) send({ type: "start", engine: "offline" });
        send({ type: "done", response: await run(send) });
      } catch (err) {
        send({ type: "error", error: err instanceof Error ? err.message : "Coach failed" });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": `${COACH_STREAM_TYPE}; charset=utf-8`,
      // no-transform keeps compression from buffering the stream until it ends
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
