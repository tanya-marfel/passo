import { COACH_STREAM_TYPE, type CoachRequest, type CoachResponse, type CoachStreamEvent } from "@/lib/coach/types";

/** Calls /api/coach, reporting tool steps while the agent runs. Throws if no final answer arrives. */
export async function requestCoach(req: CoachRequest, onEvent: (e: CoachStreamEvent) => void, signal?: AbortSignal): Promise<CoachResponse> {
  const r = await fetch("/api/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: `${COACH_STREAM_TYPE}, application/json` },
    body: JSON.stringify(req),
    signal,
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  if (!r.body || !r.headers.get("content-type")?.includes(COACH_STREAM_TYPE)) return (await r.json()) as CoachResponse;

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += decoder.decode(value, { stream: true });
    let nl = buf.indexOf("\n");
    while (nl >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      nl = buf.indexOf("\n");
      if (!line) continue;
      const e = JSON.parse(line) as CoachStreamEvent;
      if (e.type === "done") return e.response;
      if (e.type === "error") throw new Error(e.error);
      onEvent(e);
    }
    if (done) break;
  }
  throw new Error("The coach stream ended without an answer");
}
