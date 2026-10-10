"use client";

import { useMemo } from "react";
import { course, lngLatAt, climbStartD, climbEndD, STEP_M } from "@/lib/course";

const W = 1000;
const H = 700;

function projector() {
  const lat0 = (Math.min(...course.lat) + Math.max(...course.lat)) / 2;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = course.lon.map((l) => l * k);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...course.lat);
  const maxY = Math.max(...course.lat);
  const pad = 40;
  const s = Math.min((W - 2 * pad) / (maxX - minX), (H - 2 * pad) / (maxY - minY));
  const ox = (W - (maxX - minX) * s) / 2;
  const oy = (H - (maxY - minY) * s) / 2;
  return ([lon, lat]: [number, number]) => [ox + (lon * k - minX) * s, oy + (maxY - lat) * s] as const;
}

/** Flat SVG map used when WebGL or the tile servers are unavailable. */
export function MapFallback({ runnerD, shadowD, reason }: { runnerD: number; shadowD: number; reason?: string }) {
  const geo = useMemo(() => {
    const p = projector();
    const pts = course.lon.map((lon, i) => p([lon, course.lat[i]]));
    const path = (from: number, to: number) => {
      const a = Math.max(0, Math.floor(from / STEP_M));
      const b = Math.min(pts.length - 1, Math.ceil(to / STEP_M));
      return pts
        .slice(a, b + 1)
        .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`)
        .join("");
    };
    return { p, full: path(0, Infinity), gyms: course.climbs.map((c) => path(climbStartD(c), climbEndD(c))), path };
  }, []);

  const [rx, ry] = geo.p(lngLatAt(runnerD));
  const [sx, sy] = geo.p(lngLatAt(shadowD));

  return (
    <div className="relative h-full w-full overflow-hidden bg-[radial-gradient(ellipse_at_top,#1d2a4d,#0b1020)]">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Course map">
        <path d={geo.full} fill="none" stroke="#0b1020" strokeWidth={9} strokeLinejoin="round" />
        <path d={geo.full} fill="none" stroke="#e2e8f0" strokeWidth={4} strokeLinejoin="round" />
        {geo.gyms.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#fbbf24" strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        <path d={geo.path(0, runnerD)} fill="none" stroke="#34d399" strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />
        {course.aidStations.map((s) => {
          const [x, y] = geo.p([s.lon, s.lat]);
          return (
            <g key={s.id}>
              <circle cx={x} cy={y} r={6} fill={s.cutoffSec !== null ? "#f87171" : "#94a3b8"} stroke="#0b1020" strokeWidth={2} />
              <text x={x + 9} y={y + 4} className="fill-slate-300 text-[16px]">
                {s.kind === "finish" ? "" : s.name}
              </text>
            </g>
          );
        })}
        <circle cx={sx} cy={sy} r={10} fill="#a855f7" stroke="#1a0b2e" strokeWidth={3} opacity={0.9} />
        <circle cx={rx} cy={ry} r={18} fill="#34d399" opacity={0.25} />
        <circle cx={rx} cy={ry} r={11} fill="#34d399" stroke="#06261b" strokeWidth={3} />
      </svg>
      {reason && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-black/50 px-2 py-1 text-[11px] text-muted-foreground">
          2D map: {reason}
        </div>
      )}
    </div>
  );
}
