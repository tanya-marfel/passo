const GRADIUM_ASR = "https://api.gradium.ai/api/post/speech/asr";

export async function POST(request: Request) {
  const key = process.env.GRADIUM_API_KEY;
  if (!key) return Response.json({ fallback: true, reason: "No GRADIUM_API_KEY set" }, { status: 501 });
  const audio = await request.arrayBuffer();
  if (audio.byteLength < 1000) return Response.json({ error: "Recording too short" }, { status: 400 });

  try {
    const url = `${GRADIUM_ASR}?json_config=${encodeURIComponent(JSON.stringify({ language: "en" }))}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "x-api-key": key, "Content-Type": "audio/wav" },
      body: audio,
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const reason = (await res.text()).slice(0, 200);
      return Response.json({ fallback: true, reason: `Gradium ${res.status}: ${reason}` }, { status: 502 });
    }
    const lines = (await res.text()).split("\n").filter(Boolean);
    const words: string[] = [];
    for (const line of lines) {
      try {
        const msg = JSON.parse(line) as { type?: string; text?: string; message?: string };
        if (msg.type === "text" && msg.text) words.push(msg.text);
        if (msg.type === "error") return Response.json({ fallback: true, reason: msg.message ?? "ASR error" }, { status: 502 });
      } catch {
        // ignore partial lines
      }
    }
    return Response.json({ text: words.join(" ").replace(/\s+/g, " ").trim() });
  } catch (err) {
    return Response.json({ fallback: true, reason: err instanceof Error ? err.message : "STT failed" }, { status: 502 });
  }
}
