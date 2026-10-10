import { geminiCoach } from "@/lib/coach/gemini";
import { gemmaCoach, warmupGemma } from "@/lib/coach/gemma";
import { offlineCoach } from "@/lib/coach/offline";
import type { CoachRequest, CoachResponse, CoachStreamEvent } from "@/lib/coach/types";

export type CoachMode = "gemini" | "gemma" | "offline";

export function coachMode(): CoachMode {
  const choice = process.env.COACH?.trim().toLowerCase();
  const key = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  if (choice === "offline" || choice === "rules") return "offline";
  if (choice === "gemma") return "gemma";
  if (choice === "gemini") return key ? "gemini" : "gemma";
  return key ? "gemini" : "gemma";
}

export function warmupCoach() {
  if (coachMode() === "offline") return;
  if (process.env.COACH?.trim().toLowerCase() === "gemini") return;
  warmupGemma();
}

export async function runCoach(req: CoachRequest, onEvent?: (e: CoachStreamEvent) => void): Promise<CoachResponse> {
  const mode = coachMode();
  if (mode === "gemini") {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (key) {
      const res = await geminiCoach(req, key, onEvent);
      if (res.engine === "gemini") return res;
    }
  }
  if (mode !== "offline") {
    try {
      return await gemmaCoach(req, onEvent);
    } catch (err) {
      const note = `Gemma unavailable (${err instanceof Error ? err.message : "error"}), using the built-in coach.`;
      onEvent?.({ type: "start", engine: "offline" });
      return offlineCoach(req, note);
    }
  }
  onEvent?.({ type: "start", engine: "offline" });
  return offlineCoach(req, "Using the built-in coach.");
}
