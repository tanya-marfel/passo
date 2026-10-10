import { geminiCoach } from "@/lib/coach/gemini";
import { offlineCoach } from "@/lib/coach/offline";
import type { CoachRequest } from "@/lib/coach/types";

export async function POST(request: Request) {
  let req: CoachRequest;
  try {
    req = (await request.json()) as CoachRequest;
    if (!req?.trigger?.type || !req.live || !req.profile?.model) throw new Error("missing fields");
  } catch {
    return Response.json({ error: "Invalid coach request" }, { status: 400 });
  }
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  try {
    const res = key ? await geminiCoach(req, key) : offlineCoach(req, "No GEMINI_API_KEY set, using the offline coach.");
    return Response.json(res);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Coach failed" }, { status: 500 });
  }
}
