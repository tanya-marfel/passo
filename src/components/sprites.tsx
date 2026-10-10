import { memo } from "react";
import { cn } from "cn";

type Palette = Record<string, string>;

/**
 * Authentic GBA/DS Pokemon-style palette for Marmo the Marmot Coach.
 */
const MARMO_PALETTE: Palette = {
  k: "#1c120c", // Dark crisp outline
  d: "#5c3318", // Fur deep shadow
  b: "#9c5a2b", // Fur midtone
  h: "#d98c47", // Fur highlight
  l: "#fbe3c5", // Muzzle & belly cream
  s: "#dfbe9b", // Belly shadow
  w: "#ffffff", // Eye shine / teeth / highlights
  e: "#181008", // Pupil dark
  i: "#2563eb", // Eye sapphire blue
  I: "#93c5fd", // Eye shimmer
  p: "#f472b6", // Pink cheek blush
  P: "#e11d48", // Deep blush
  n: "#381e11", // Nose & mouth dark
  R: "#ef4444", // Bandana scarlet
  r: "#991b1b", // Bandana shadow
  y: "#fbbf24", // Gold knot / medal
};

const MARMO_IDLE = [
  ".......kkkk......kkkk.......",
  "......kppppk....kppppk......",
  ".....kppddppkkkkppddppk.....",
  ".....kpddbbddkkddbbddpk.....",
  "....kddbbhhhhbbhhhhbbddk....",
  "...kdbbhhhhhhhbbhhhhhhhbdk..",
  "..kdbbhhkkhhhhhkkhhhhhbbdk..",
  "..kbbhkkewkkhkkewkkhhhhbbk..",
  ".kbbhkkewwIekkewwIekhhhhbbk.",
  ".kbbhkkewiiekkewiiekhhhhbbk.",
  ".kbbhhkkeeeekkeeeekhhhhhbbk.",
  ".kbbhhkppppkssskppppkhhhbbk.",
  ".kbbhkppPPpklllkppPPpkhhbbk.",
  ".kbbhkppppkllnllkppppkhhbbk.",
  "..kbbhkkkkklnnnlkkskkhhbbk..",
  "....kbbbbhlllnwnllskbbbbk...",
  "....kkddbllllsllllkddkk.....",
  "....kRRRRRRRRRRRRRRRRk......",
  "...kRyyyyRRRRRRRRRRRRRk.....",
  "..krRyyyyRrrrrrrrrrrrrk.....",
  ".kbbkRRRkkkbbbbbbkkkbbk.....",
  ".kbhbbkkkllkbbbbkllkkkbbk...",
  "kdbhhhbkllllkkkkllllkbhhbdk.",
  "kdbhhhhkllllllllllllkhhhbdk.",
  "kdbbhhhkllllllllllllkhhhbdk.",
  ".kddbbbkllllslllslllkbbddk..",
  "..kkdddkllllllllllllkddkk...",
  "....kddkkkkkkkkkkkkddk......",
];

const MARMO_TALK = [
  ".......kkkk......kkkk.......",
  "......kppppk....kppppk......",
  ".....kppddppkkkkppddppk.....",
  ".....kpddbbddkkddbbddpk.....",
  "....kddbbhhhhbbhhhhbbddk....",
  "...kdbbhhhhhhhbbhhhhhhhbdk..",
  "..kdbbhhkkhhhhhkkhhhhhbbdk..",
  "..kbbhkkewkkhkkewkkhhhhbbk..",
  ".kbbhkkewwIekkewwIekhhhhbbk.",
  ".kbbhkkewiiekkewiiekhhhhbbk.",
  ".kbbhhkkeeeekkeeeekhhhhhbbk.",
  ".kbbhhkppppkssskppppkhhhbbk.",
  ".kbbhkppPPpklllkppPPpkhhbbk.",
  ".kbbhkppppkllnllkppppkhhbbk.",
  "..kbbhkkkkklnnnlkkskkhhbbk..",
  "....kbbbbhlllnnnllskbbbbk...",
  "....kkddbllllnnnllkddkk.....",
  "....kRRRRRRRRRRRRRRRRk......",
  "...kRyyyyRRRRRRRRRRRRRk.....",
  "..krRyyyyRrrrrrrrrrrrrk.....",
  ".kbbkRRRkkkbbbbbbkkkbbk.....",
  ".kbhbbkkkllkbbbbkllkkkbbk...",
  "kdbhhhbkllllkkkkllllkbhhbdk.",
  "kdbhhhhkllllllllllllkhhhbdk.",
  "kdbbhhhkllllllllllllkhhhbdk.",
  ".kddbbbkllllslllslllkbbddk..",
  "..kkdddkllllllllllllkddkk...",
  "....kddkkkkkkkkkkkkddk......",
];

/**
 * Authentic Pokemon Trainer Running Sprite (GBA / DS generation style).
 */
const RUNNER_PALETTE: Palette = {
  k: "#0d131f", // Dark crisp outline
  R: "#ef4444", // Cap crimson
  r: "#b91c1c", // Cap deep crimson shadow
  w: "#ffffff", // White cap band / eye shine / socks
  h: "#1e293b", // Dark spiky hair
  H: "#334155", // Hair highlight
  s: "#fbcfe8", // Skin highlight
  S: "#f6ad55", // Skin warm tone
  d: "#c05621", // Skin shadow
  e: "#0f172a", // Pupil dark
  i: "#0284c7", // Iris blue
  T: "#10b981", // Emerald jersey
  t: "#047857", // Emerald shadow
  v: "#f1f5f9", // Hydration vest strap
  V: "#94a3b8", // Vest shadow
  N: "#1e1b4b", // Running shorts navy
  n: "#0f0d2b", // Shorts shadow
  O: "#f97316", // Running shoes bright orange
  o: "#c2410c", // Shoe shadow
};

const RUNNER_SPRITE = [
  "........kkkkkkkk........",
  "......kkRRRRRRRRkk......",
  "....kkRRRwwwwRRRRRkk....",
  "...kRRRRRwwwwRRRRRRRk...",
  "...kRRRRRRRRRRRRRRRRk...",
  "...krrrrrrkkkrrrrrrk....",
  "....khhhhkkSehhhhkk.....",
  "...khHhhhhkSwekkh.......",
  "...khhhhhkdSikSk........",
  "....k..kkkdSSSkk........",
  "......kTTTkkddk.........",
  "....kkTTvTTTTTkk........",
  "...kSTTvvvTTTTTTk.......",
  "..kSSdTvvvTtTTTTtk......",
  "..kdddktvvtttttTTk......",
  "...kk..ktvtt..ktTk......",
  "......kNNNNNk..kk.......",
  ".....kNNNnNNNk..........",
  ".....knnnknnnk..........",
  ".....kSSk.kSSSk.........",
  "....kdSk...kdSSk........",
  "...kwwk.....kwwk........",
  "..kOOwk....kOOwwk.......",
  "..kkkk......kkkk........",
];

/**
 * Spectral Shadow Rival Pokemon Sprite with glowing eyes and ghost aura.
 */
const SHADOW_PALETTE: Palette = {
  k: "#17062e", // Deep void outline
  R: "#6b21a8", // Violet cap
  r: "#4c1d95", // Deep purple shadow
  w: "#e9d5ff", // Spectral lavender glow
  h: "#2e1065", // Dark shadow hair
  H: "#3b0764", // Shadow highlight
  s: "#c084fc", // Spectral skin
  S: "#9333ea", // Spectral skin mid
  d: "#581c87", // Spectral skin shadow
  e: "#f43f5e", // Glowing red pupil
  i: "#fb7185", // Luminous rose iris
  T: "#7e22ce", // Spectral jersey
  t: "#581c87", // Jersey shadow
  v: "#d8b4fe", // Ghost aura straps
  V: "#a855f7", // Aura shadow
  N: "#1e1b4b", // Shadow shorts
  n: "#0f0d2b", // Shorts shadow
  O: "#a855f7", // Ghost runner shoes
  o: "#7e22ce", // Shoe shadow
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
      className={cn("pixelated select-none", className)}
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

export function MarmoSprite({
  height = 72,
  className,
  talking,
}: {
  height?: number;
  className?: string;
  talking?: boolean;
}) {
  return (
    <PixelSprite
      rows={talking ? MARMO_TALK : MARMO_IDLE}
      palette={MARMO_PALETTE}
      height={height}
      title="Marmo the marmot coach"
      className={cn(talking ? "animate-talk" : "animate-bob", className)}
    />
  );
}

export function RunnerSprite({ height = 32, className }: { height?: number; className?: string }) {
  return (
    <PixelSprite
      rows={RUNNER_SPRITE}
      palette={RUNNER_PALETTE}
      height={height}
      title="Trainer (You)"
      className={cn("animate-bob", className)}
    />
  );
}

export const TrainerSprite = RunnerSprite;

export function ShadowSprite({ height = 32, className }: { height?: number; className?: string }) {
  return (
    <PixelSprite
      rows={RUNNER_SPRITE}
      palette={SHADOW_PALETTE}
      height={height}
      title="Shadow Rival"
      className={cn(
        "animate-flicker drop-shadow-[0_0_8px_rgba(168,85,247,0.85)]",
        className,
      )}
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
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className={cn("pixelated select-none", className)}
      aria-hidden
    >
      <polygon points="5,1 11,1 15,5 15,11 11,15 5,15 1,11 1,5" fill={stroke} />
      <polygon points="5.8,2.6 10.2,2.6 13.4,5.8 13.4,10.2 10.2,13.4 5.8,13.4 2.6,10.2 2.6,5.8" fill={fill} />
      <polygon points="8,4 12,8 8,12 4,8" fill={earned ? dark : "#1e293b"} opacity={earned ? 0.75 : 0.6} />
      {earned && <rect x="5" y="4" width="2" height="2" fill="#ffffff" opacity="0.9" />}
      {earned && <rect x="9" y="10" width="2" height="1" fill="#ffffff" opacity="0.4" />}
    </svg>
  );
}
