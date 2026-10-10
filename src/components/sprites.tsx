import { memo } from "react";
import { cn } from "cn";

type Palette = Record<string, string>;

const MARMO = [
  "....kkk......kkk....",
  "...kdddk....kdddk...",
  "...kdbbkkkkkkbbdk...",
  "..kbbbbbbbbbbbbbbk..",
  ".kbbbbbbbbbbbbbbbbk.",
  ".kRRRRRRRRRRRRRRRRk.",
  ".krrrrrrrrrrrrrrrrk.",
  "kbbbbbbbbbbbbbbbbbbk",
  "kbbbkkbbbbbbbbkkbbbk",
  "kbbkwekbbbbbbkwekbbk",
  "kbbkeekbbbbbbkeekbbk",
  "kbppbbbllllllbbbppbk",
  ".kbbbblllnnlllbbbbk.",
  ".kbbbbllllllllbbbbk.",
  "..kbbbbllwwllbbbbk..",
  "...kkbbbllllbbbkk...",
  "..kbbkkbbbbbbkkbbk..",
  ".kbbbkllllllllkbbbk.",
  ".kbbkllllllllllkbbk.",
  ".kbbkllllllllllkbbk.",
  "..kkkllllllllllkkk..",
  "...kbbllllllllbbk...",
  "..kddddkkkkkkddddk..",
  "..kkkkk......kkkkk..",
];

const MARMO_PALETTE: Palette = {
  k: "#2a1a12",
  d: "#7a4a26",
  b: "#a8703f",
  l: "#e8c08c",
  R: "#ef4b4f",
  r: "#b4282e",
  w: "#ffffff",
  e: "#17110d",
  n: "#3b2418",
  p: "#ee8f7f",
};

const RUNNER = [
  "...kkkkkk...",
  "..kCCCCCCk..",
  "..kCYYCCCk..",
  ".kkkkkkkkkk.",
  "..kssssssk..",
  "..ksessesk..",
  "..kssssssk..",
  "...kssssk...",
  "..kTTTTTTk..",
  ".kTTTTTTTTk.",
  "ksTkTTTTkTsk",
  "kskkTTTTkksk",
  ".k.kNNNNk.k.",
  "...kNkkNk...",
  "...ksk.ksk..",
  "..kOOk.kOOk.",
];

const RUNNER_PALETTE: Palette = {
  k: "#0e1222",
  C: "#14b8a6",
  Y: "#fde047",
  s: "#f2c9a0",
  e: "#1a1a1a",
  T: "#22c55e",
  N: "#1e3a8a",
  O: "#f97316",
};

const SHADOW_PALETTE: Palette = {
  k: "#c084fc",
  C: "#2e1065",
  Y: "#a855f7",
  s: "#3b0764",
  e: "#f0abfc",
  T: "#4c1d95",
  N: "#2e1065",
  O: "#581c87",
};

function runsFor(rows: string[], palette: Palette) {
  const rects: { x: number; y: number; w: number; fill: string }[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      const fill = palette[ch];
      if (!fill) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < row.length && row[x + w] === ch) w++;
      rects.push({ x, y, w, fill });
      x += w;
    }
  });
  return rects;
}

const PixelSprite = memo(function PixelSprite({
  rows,
  palette,
  height,
  className,
  title,
}: {
  rows: string[];
  palette: Palette;
  height: number;
  className?: string;
  title?: string;
}) {
  const w = rows[0].length;
  const h = rows.length;
  const rects = runsFor(rows, palette);
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={(height * w) / h}
      height={height}
      className={cn("pixelated", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </svg>
  );
});

export function MarmoSprite({ height = 72, className, talking }: { height?: number; className?: string; talking?: boolean }) {
  return (
    <PixelSprite
      rows={MARMO}
      palette={MARMO_PALETTE}
      height={height}
      title="Marmo the marmot coach"
      className={cn(talking ? "animate-talk" : "animate-bob", className)}
    />
  );
}

export function RunnerSprite({ height = 32, className }: { height?: number; className?: string }) {
  return <PixelSprite rows={RUNNER} palette={RUNNER_PALETTE} height={height} title="You" className={className} />;
}

export function ShadowSprite({ height = 32, className }: { height?: number; className?: string }) {
  return (
    <PixelSprite
      rows={RUNNER}
      palette={SHADOW_PALETTE}
      height={height}
      title="Your shadow"
      className={cn("animate-flicker drop-shadow-[0_0_6px_rgba(192,132,252,0.8)]", className)}
    />
  );
}

export const BADGE_COLORS: Record<string, [string, string]> = {
  "gym-1": ["#fbbf24", "#b45309"],
  "gym-2": ["#c7d2fe", "#4f46e5"],
  "gym-3": ["#67e8f9", "#0e7490"],
  "gym-4": ["#fda4af", "#e11d48"],
  "gym-5": ["#86efac", "#15803d"],
  "gym-6": ["#fdba74", "#9a3412"],
  "gym-7": ["#e0f2fe", "#0369a1"],
  "gym-8": ["#fde68a", "#a16207"],
};

export function BadgeIcon({
  climbId,
  earned = true,
  size = 28,
  className,
}: {
  climbId: string;
  earned?: boolean;
  size?: number;
  className?: string;
}) {
  const [light, dark] = BADGE_COLORS[climbId] ?? ["#e5e7eb", "#6b7280"];
  const fill = earned ? light : "#334155";
  const stroke = earned ? dark : "#1e293b";
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={cn("pixelated", className)} aria-hidden>
      <polygon points="5,1 11,1 15,5 15,11 11,15 5,15 1,11 1,5" fill={stroke} />
      <polygon points="5.8,2.6 10.2,2.6 13.4,5.8 13.4,10.2 10.2,13.4 5.8,13.4 2.6,10.2 2.6,5.8" fill={fill} />
      <polygon points="8,4 12,8 8,12 4,8" fill={earned ? dark : "#1e293b"} opacity={earned ? 0.75 : 0.6} />
      {earned && <rect x="5" y="4" width="2" height="2" fill="#ffffff" opacity="0.85" />}
    </svg>
  );
}
