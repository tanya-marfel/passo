import { speakable } from "@/lib/speech";

const GRADIUM_TTS = "https://api.gradium.ai/api/post/speech/tts";
const DEFAULT_VOICE = "ubuXFxVQwVYnZQhy";
const cache = new Map<string, ArrayBuffer>();

export async function POST(request: Request) {
  const key = process.env.GRADIUM_API_KEY;
  if (!key) return Response.json({ fallback: true, reason: "No GRADIUM_API_KEY set" }, { status: 501 });
  let text = "";
  try {
    const body = (await request.json()) as { text?: string };
    text = speakable(String(body.text ?? "")).slice(0, 600);
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!text) return Response.json({ error: "Empty text" }, { status: 400 });

  const voiceId = process.env.GRADIUM_VOICE_ID || DEFAULT_VOICE;
  const cacheKey = `${voiceId}:${text}`;
  const hit = cache.get(cacheKey);
  if (hit) return new Response(hit, { headers: { "Content-Type": "audio/wav", "X-Voice-Cache": "hit" } });

  try {
    const res = await fetch(GRADIUM_TTS, {
      method: "POST",
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voice_id: voiceId,
        output_format: "wav",
        only_audio: true,
        json_config: JSON.stringify({ padding_bonus: -0.6 }),
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const reason = (await res.text()).slice(0, 200);
      return Response.json({ fallback: true, reason: `Gradium ${res.status}: ${reason}` }, { status: 502 });
    }
    const audio = await res.arrayBuffer();
    if (cache.size > 200) cache.delete(cache.keys().next().value as string);
    cache.set(cacheKey, audio);
    return new Response(audio, { headers: { "Content-Type": "audio/wav", "X-Voice-Cache": "miss" } });
  } catch (err) {
    return Response.json({ fallback: true, reason: err instanceof Error ? err.message : "TTS failed" }, { status: 502 });
  }
}
