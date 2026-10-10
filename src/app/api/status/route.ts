import { connection } from "next/server";

export async function GET() {
  await connection();
  return Response.json({
    gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    geminiModel: process.env.GEMINI_MODEL || "auto",
    gradium: Boolean(process.env.GRADIUM_API_KEY),
    voice: process.env.GRADIUM_VOICE_ID || "ubuXFxVQwVYnZQhy",
  });
}
