"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Compass, Mountain, MoveRight } from "lucide-react";
import { cn } from "cn";
import {
  course,
  N_POINTS,
  STEP_M,
  TOTAL_M,
  eleAt,
  gradeAt,
  climbStartD,
  climbEndD,
  stationD,
} from "@/lib/course";
import { timeAtDistance, type Plan } from "@/lib/plan";
import { fmtClock } from "@/lib/format";
import { BADGE_COLORS } from "@/components/sprites";

type Props = {
  plan?: Plan;
  runnerD?: number;
  shadowD?: number;
  planD?: number;
  earned?: string[];
  onSeek?: (d: number) => void;
  height?: number;
  className?: string;
};

const PAD = { l: 38, r: 10, t: 20, b: 24 };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function ElevationProfile({
  plan,
  runnerD,
  shadowD,
  planD,
  earned = [],
  onSeek,
  height = 140,
  className,
}: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hoverD, setHoverD] = useState<number | null>(null);
  const [dragD, setDragD] = useState<number | null>(null);

  const geo = useMemo(() => {
    const w = Math.max(320, width);
    const h = height;
    const minE = Math.floor((Math.min(...course.ele) - 80) / 100) * 100;
    const maxE = Math.ceil((Math.max(...course.ele) + 60) / 100) * 100;
    const x = (d: number) => PAD.l + (d / TOTAL_M) * (w - PAD.l - PAD.r);
    const y = (e: number) => PAD.t + ((maxE - e) / (maxE - minE)) * (h - PAD.t - PAD.b);
    const step = Math.max(1, Math.floor(N_POINTS / ((w - PAD.l - PAD.r) / 1.5)));
    let line = "";
    for (let i = 0; i < N_POINTS; i += step) line += `${i ? "L" : "M"}${x(i * STEP_M).toFixed(1)},${y(course.ele[i]).toFixed(1)}`;
    line += `L${x(TOTAL_M).toFixed(1)},${y(course.ele[N_POINTS - 1]).toFixed(1)}`;
    const base = y(minE);
    const area = `${line}L${x(TOTAL_M).toFixed(1)},${base}L${x(0).toFixed(1)},${base}Z`;
    const ticksE: number[] = [];
    for (let e = Math.ceil(minE / 500) * 500; e <= maxE; e += 500) ticksE.push(e);
    const ticksKm: number[] = [];
    for (let k = 0; k <= TOTAL_M / 1000; k += w < 640 ? 20 : 10) ticksKm.push(k);
    return { w, h, x, y, line, area, base, ticksE, ticksKm, minE, maxE };
  }, [width, height]);

  const toD = (clientX: number) => {
    const el = ref.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const px = clientX - r.left;
    return Math.max(0, Math.min(TOTAL_M, ((px - PAD.l) / (geo.w - PAD.l - PAD.r)) * TOTAL_M));
  };

  const shownD = dragD ?? hoverD;
  const hoverInfo = useMemo(() => {
    if (shownD === null) return null;
    const st = course.aidStations.find((s) => Math.abs(stationD(s) - shownD) < 700);
    const climb = course.climbs.find((c) => shownD >= climbStartD(c) && shownD <= climbEndD(c));
    const planT = plan ? timeAtDistance(plan.timeline, shownD) : null;
    return { d: shownD, ele: eleAt(shownD), grade: gradeAt(shownD), st, climb, planT };
  }, [shownD, plan]);

  const runnerX = runnerD !== undefined ? geo.x(runnerD) : null;

  // Real-time telemetry calculations
  const runnerKm = runnerD !== undefined ? runnerD / 1000 : null;
  const currentEle = runnerD !== undefined ? Math.round(eleAt(runnerD)) : null;
  const currentGrade = runnerD !== undefined ? Math.round(gradeAt(runnerD) * 100) : null;
  const currentClimb = runnerD !== undefined ? course.climbs.find((c) => runnerD >= climbStartD(c) && runnerD <= climbEndD(c)) : null;

  return (
    <div className={cn("flex flex-col select-none", className)}>
      {/* Live Profile Telemetry Header (when runner distance is provided) */}
      {runnerKm !== null && currentEle !== null && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pb-1.5 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-foreground tabular-nums">
              km {runnerKm.toFixed(1)}{" "}
              <span className="text-muted-foreground font-normal">/ {(TOTAL_M / 1000).toFixed(0)}</span>
            </span>
            <span className="flex items-center gap-1 tabular-nums">
              <Mountain className="size-3 text-muted-foreground" />
              <span className="font-medium text-foreground">{currentEle} m</span>
            </span>
            {currentGrade !== null && (
              <span className="flex items-center gap-0.5 tabular-nums">
                {currentGrade > 0 ? (
                  <ArrowUpRight className="size-3 text-amber-400" />
                ) : currentGrade < 0 ? (
                  <ArrowDownRight className="size-3 text-sky-400" />
                ) : (
                  <MoveRight className="size-3 text-muted-foreground" />
                )}
                <span className={cn(currentGrade > 4 ? "text-amber-400" : currentGrade < -4 ? "text-sky-400" : "text-muted-foreground")}>
                  {currentGrade > 0 ? `+${currentGrade}%` : `${currentGrade}%`}
                </span>
              </span>
            )}
            {currentClimb && (
              <span className="hidden sm:inline-flex items-center gap-1 text-gym font-medium truncate max-w-48">
                <Compass className="size-3" />
                <span>{currentClimb.name}</span>
              </span>
            )}
          </div>
          {onSeek && (
            <span className="text-[10px] text-muted-foreground/75 hidden sm:inline-block">
              Click or drag elevation to jump
            </span>
          )}
        </div>
      )}

      {/* SVG Elevation Profile Canvas */}
      <div
        ref={ref}
        className={cn("relative w-full touch-none", onSeek && "cursor-crosshair")}
        style={{ height }}
        onPointerMove={(e) => {
          const d = toD(e.clientX);
          if (dragD !== null) setDragD(d);
          else setHoverD(d);
        }}
        onPointerLeave={() => {
          setHoverD(null);
        }}
        onPointerDown={(e) => {
          if (!onSeek) return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setDragD(toD(e.clientX));
        }}
        onPointerUp={(e) => {
          if (!onSeek || dragD === null) return;
          const d = toD(e.clientX);
          setDragD(null);
          onSeek(d);
        }}
        onPointerCancel={() => setDragD(null)}
      >
        {width > 0 && (
          <svg
            width={geo.w}
            height={geo.h}
            className="absolute inset-0 overflow-visible"
            role="img"
            aria-label="Lavaredo 120K elevation profile"
          >
            <defs>
              <linearGradient id="ep-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.7 0.01 90)" stopOpacity="0.25" />
                <stop offset="100%" stopColor="oklch(0.7 0.01 90)" stopOpacity="0.02" />
              </linearGradient>
              <linearGradient id="ep-done" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--you)" stopOpacity="0.55" />
                <stop offset="100%" stopColor="var(--you)" stopOpacity="0.08" />
              </linearGradient>
              <clipPath id="ep-done-clip">
                <rect x={0} y={0} width={runnerX ?? 0} height={geo.h} />
              </clipPath>
            </defs>

            {/* Elevation grid lines & labels */}
            {geo.ticksE.map((e) => (
              <g key={e}>
                <line x1={PAD.l} x2={geo.w - PAD.r} y1={geo.y(e)} y2={geo.y(e)} stroke="white" strokeOpacity="0.06" />
                <text x={PAD.l - 6} y={geo.y(e) + 3} textAnchor="end" className="fill-muted-foreground text-[9px] tabular-nums">
                  {e}
                </text>
              </g>
            ))}

            {/* Gym climb zones */}
            {course.climbs.map((c, i) => {
              const x1 = geo.x(climbStartD(c));
              const x2 = geo.x(climbEndD(c));
              const won = earned.includes(c.id);
              const [light] = BADGE_COLORS[c.id] ?? ["#fde68a"];
              return (
                <g key={c.id}>
                  <rect
                    x={x1}
                    y={PAD.t - 4}
                    width={Math.max(2, x2 - x1)}
                    height={geo.base - PAD.t + 4}
                    fill={light}
                    fillOpacity={won ? 0.18 : 0.06}
                  />
                  <text
                    x={(x1 + x2) / 2}
                    y={PAD.t - 7}
                    textAnchor="middle"
                    className="text-[9px] font-semibold"
                    fill={won ? light : "oklch(0.7 0.01 80)"}
                  >
                    {geo.w >= 560 ? `G${i + 1}` : i + 1}
                  </text>
                </g>
              );
            })}

            {/* Mountain Profile Curves */}
            <path d={geo.area} fill="url(#ep-area)" />
            <path d={geo.line} fill="none" stroke="oklch(0.85 0.01 90)" strokeOpacity="0.45" strokeWidth="1.25" />

            {/* Completed Runner Elevation Fill */}
            {runnerX !== null && (
              <g clipPath="url(#ep-done-clip)">
                <path d={geo.area} fill="url(#ep-done)" />
                <path d={geo.line} fill="none" stroke="var(--you)" strokeWidth="2" />
              </g>
            )}

            {/* Aid station tick pins */}
            {course.aidStations.map((s) => {
              const sx = geo.x(stationD(s));
              const cut = s.cutoffSec !== null;
              return (
                <g key={s.id}>
                  <line
                    x1={sx}
                    x2={sx}
                    y1={geo.base}
                    y2={geo.base + 5}
                    stroke={cut ? "var(--cutoff)" : "white"}
                    strokeOpacity={cut ? 0.9 : 0.4}
                    strokeWidth={cut ? 2 : 1}
                  />
                  {cut && <polygon points={`${sx - 3.5},${geo.base + 5} ${sx + 3.5},${geo.base + 5} ${sx},${geo.base + 10}`} fill="var(--cutoff)" />}
                  {s.kind === "lifebase" && <rect x={sx - 3} y={geo.base + 5} width={6} height={5} fill="var(--gym)" />}
                </g>
              );
            })}

            {/* Distance Kilometer ticks */}
            {geo.ticksKm.map((k) => (
              <text key={k} x={geo.x(k * 1000)} y={geo.h - 2} textAnchor="middle" className="fill-muted-foreground text-[9px] tabular-nums">
                {k}k
              </text>
            ))}

            {/* Plan Marker */}
            {planD !== undefined && planD > 0 && (
              <g>
                <line x1={geo.x(planD)} x2={geo.x(planD)} y1={PAD.t} y2={geo.base} stroke="white" strokeOpacity="0.45" strokeDasharray="3 3" />
                <text x={geo.x(planD)} y={PAD.t + 10} textAnchor="middle" className="text-[9px]" fill="white" fillOpacity="0.6">
                  Plan
                </text>
              </g>
            )}

            {/* Shadow Marker */}
            {shadowD !== undefined && (
              <g>
                <circle cx={geo.x(shadowD)} cy={geo.y(eleAt(shadowD))} r={4.5} fill="var(--shadow-rival)" />
                <text x={geo.x(shadowD)} y={geo.y(eleAt(shadowD)) - 8} textAnchor="middle" className="text-[9px] font-medium" fill="var(--shadow-rival)">
                  Shadow
                </text>
              </g>
            )}

            {/* Runner Marker */}
            {runnerD !== undefined && runnerX !== null && (
              <g>
                <line x1={runnerX} x2={runnerX} y1={PAD.t} y2={geo.base} stroke="var(--you)" strokeOpacity="0.45" />
                <circle cx={runnerX} cy={geo.y(eleAt(runnerD))} r={9} fill="var(--you)" opacity="0.25" className="animate-ping" />
                <circle cx={runnerX} cy={geo.y(eleAt(runnerD))} r={5.5} fill="var(--you)" stroke="#06261b" strokeWidth="2" />
              </g>
            )}

            {/* Interactive Hover / Scrub Line */}
            {hoverInfo && (
              <g pointerEvents="none">
                <line
                  x1={geo.x(hoverInfo.d)}
                  x2={geo.x(hoverInfo.d)}
                  y1={PAD.t - 4}
                  y2={geo.base}
                  stroke="var(--primary)"
                  strokeOpacity="0.9"
                  strokeDasharray={dragD !== null ? undefined : "2 2"}
                />
                <circle cx={geo.x(hoverInfo.d)} cy={geo.y(hoverInfo.ele)} r={4} fill="var(--primary)" />
              </g>
            )}
          </svg>
        )}

        {/* Hover / Scrub Tooltip */}
        {hoverInfo && width > 0 && (
          <div
            className="pointer-events-none absolute top-1 z-10 max-w-60 rounded-lg border border-white/15 bg-black/90 p-2 text-[11px] leading-tight shadow-xl backdrop-blur-md"
            style={{
              left: Math.min(Math.max(geo.x(hoverInfo.d) + 10, 8), geo.w - 230),
            }}
          >
            <div className="font-semibold text-foreground tabular-nums flex items-center justify-between gap-2">
              <span>km {(hoverInfo.d / 1000).toFixed(1)} · {Math.round(hoverInfo.ele)} m</span>
              <span className={hoverInfo.grade >= 0 ? "text-amber-400" : "text-sky-400"}>
                {hoverInfo.grade >= 0 ? "+" : ""}
                {Math.round(hoverInfo.grade * 100)}%
              </span>
            </div>
            {hoverInfo.climb && (
              <div className="mt-1 text-gym font-medium truncate">
                Gym: {hoverInfo.climb.name} (+{hoverInfo.climb.gain}m)
              </div>
            )}
            {hoverInfo.st && (
              <div className="mt-0.5 text-foreground truncate">
                {hoverInfo.st.name}
                {hoverInfo.st.cutoff && <span className="text-red-300"> · cut-off {hoverInfo.st.cutoff}</span>}
              </div>
            )}
            {hoverInfo.planT !== null && (
              <div className="mt-0.5 text-muted-foreground">Target: {fmtClock(hoverInfo.planT)}</div>
            )}
            {onSeek && (
              <div className="mt-1 text-[10px] text-primary font-medium">
                {dragD !== null ? "Release to jump here" : "Click to jump here"}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
