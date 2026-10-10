import { connection } from "next/server";
import { gradiumVoiceId } from "@/lib/gradium";
import { gemmaReady } from "@/lib/coach/gemma";
import { coachMode, warmupCoach } from "@/lib/coach/run";

export async function GET() {
  await connection();
  const coach = coachMode();
  warmupCoach();
  return Response.json({
    gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    geminiModel: process.env.GEMINI_MODEL || "auto",
    gemma: coach === "gemma",
    gemmaReady: gemmaReady(),
    coach,
    gradium: Boolean(process.env.GRADIUM_API_KEY),
    voice: gradiumVoiceId(),
  });
}
