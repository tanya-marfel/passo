const DAY: Record<string, string> = { Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };

/** Rewrites coach text so a TTS voice reads numbers and units naturally. */
export function speakable(text: string) {
  return text
    .replace(/\b(Fri|Sat|Sun) (\d{1,2}):(\d{2})\b/g, (_, d: string, h: string, m: string) => `${DAY[d]} ${Number(h)}:${m}`)
    .replace(/(?<![:\w])(\d{1,2}):(\d{2})(?![:\d])(?!\s*(am|pm))/g, (match, h: string, m: string, _x, offset: number, all: string) => {
      const before = all.slice(Math.max(0, offset - 10), offset);
      if (/(Friday|Saturday|Sunday) $/.test(before)) return match;
      const mins = Number(m);
      return mins ? `${Number(h)} hours ${mins}` : `${Number(h)} hours`;
    })
    .replace(/(\d+(?:\.\d+)?)\s?km\b/g, "$1 kilometres")
    .replace(/(\d+)\s?m\/h\b/g, "$1 metres per hour")
    .replace(/(\d+)\s?ml\b/g, "$1 millilitres")
    .replace(/(\d+)\s?m\b/g, "$1 metres")
    .replace(/(\d+) h (\d+) min\b/g, "$1 hours $2 minutes")
    .replace(/(\d+) h\b/g, "$1 hours")
    .replace(/(\d+) min\b/g, "$1 minutes")
    .replace(/(\d+)%/g, "$1 percent")
    .replace(/\bHP\b/g, "energy")
    .replace(/\s+/g, " ")
    .trim();
}
