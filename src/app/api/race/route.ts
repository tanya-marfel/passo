import { lookupRace } from "@/lib/race-lookup";

export async function POST(request: Request) {
  let text = "";
  try {
    const body = (await request.json()) as { text?: unknown };
    text = typeof body.text === "string" ? body.text : "";
  } catch {
    return Response.json({ error: "Say what you are running." }, { status: 400 });
  }
  try {
    const result = await lookupRace(text);
    if ("error" in result) return Response.json(result, { status: 422 });
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "The lookup didn't finish.";
    return Response.json({ error: message }, { status: 502 });
  }
}
