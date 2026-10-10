"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Map as MLMap, Marker, NavigationControl, setWorkerUrl, type ExpressionSpecification, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, LineString } from "geojson";
import { Box, Crosshair, Expand } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { course, courseGeoJSON, lineBetween, lngLatAt, bearingAt, courseBounds, climbStartD, climbEndD } from "@/lib/course";
import type { RaceFrame } from "@/lib/engine";
import { nightness } from "@/lib/live";
import { RunnerSprite, ShadowSprite } from "@/components/sprites";
import { StationPin } from "@/components/race/station-pin";
import { Button } from "@/components/ui/button";

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const DEM_TILES = ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"];
const FOLLOW_ZOOM = 13.3;
const FOLLOW_PITCH = 62;

type Props = {
  getFrame: () => RaceFrame;
  follow: boolean;
  onFollowChange: (follow: boolean) => void;
  onFail: (reason: string) => void;
  className?: string;
};

function gymsGeoJSON(): FeatureCollection<LineString> {
  return {
    type: "FeatureCollection",
    features: course.climbs.map((c) => ({
      ...lineBetween(climbStartD(c), climbEndD(c)),
      properties: { id: c.id, label: c.name },
    })),
  };
}

function lerpAngle(a: number, b: number, k: number) {
  const diff = ((((b - a) % 360) + 540) % 360) - 180;
  return a + diff * k;
}

/** True when WebGL runs on the CPU (SwiftShader, llvmpipe), where 3D terrain renders at a few frames per second. */
function softwareWebGL() {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return false;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return /swiftshader|llvmpipe|softpipe|software/i.test(renderer);
  } catch {
    return false;
  }
}

const LOW_FPS = 12;

export default function RaceMap({ getFrame, follow, onFollowChange, onFail, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<{ runner: Marker; shadow: Marker } | null>(null);
  const followRef = useRef(follow);
  const getFrameRef = useRef(getFrame);
  const onFailRef = useRef(onFail);
  const onFollowRef = useRef(onFollowChange);
  const [ready, setReady] = useState(false);
  const [lowPower] = useState(softwareWebGL);
  const [terrain, setTerrain] = useState(!lowPower);
  const terrainRef = useRef(terrain);
  const [far, setFar] = useState(false);
  const [els] = useState(() => ({
    runner: document.createElement("div"),
    shadow: document.createElement("div"),
    stations: course.aidStations.map(() => document.createElement("div")),
  }));

  useEffect(() => {
    followRef.current = follow;
    getFrameRef.current = getFrame;
    onFailRef.current = onFail;
    onFollowRef.current = onFollowChange;
    terrainRef.current = terrain;
  }, [follow, getFrame, onFail, onFollowChange, terrain]);

  useEffect(() => {
    if (lowPower) toast.info("3D terrain is off: this browser renders maps without a GPU.", { description: "Turn it back on with the cube button on the map." });
  }, [lowPower]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setWorkerUrl("/maplibre-gl-worker.mjs");
    let map: MLMap;
    try {
      map = new MLMap({
        container,
        style: STYLE_URL,
        center: lngLatAt(0),
        zoom: 10.6,
        pitch: 35,
        bearing: 0,
        maxPitch: 78,
        attributionControl: { compact: true },
      });
    } catch (err) {
      onFailRef.current(err instanceof Error ? err.message : "WebGL is not available");
      return;
    }
    mapRef.current = map;
    map.addControl(new NavigationControl({ visualizePitch: true, showCompass: true }), "top-right");

    const stationMarkers = course.aidStations.map((s, i) =>
      new Marker({ element: els.stations[i], anchor: "bottom" }).setLngLat([s.lon, s.lat]).addTo(map),
    );
    // Offset so the Shadow stays readable when it runs right next to the runner.
    const shadow = new Marker({ element: els.shadow, anchor: "bottom", offset: [-30, 4] }).setLngLat(lngLatAt(0)).addTo(map);
    const runner = new Marker({ element: els.runner, anchor: "bottom" }).setLngLat(lngLatAt(0)).addTo(map);
    markersRef.current = { runner, shadow };
    const markers = [...stationMarkers, shadow, runner];

    const pauseFollow = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent && followRef.current) onFollowRef.current(false);
    };
    map.on("dragstart", pauseFollow);
    map.on("rotatestart", pauseFollow);
    map.on("zoom", () => setFar(map.getZoom() < 11.6));
    map.on("webglcontextlost", () => onFailRef.current("The WebGL context was lost"));

    map.on("load", () => {
      map.addSource("dem", { type: "raster-dem", tiles: DEM_TILES, encoding: "terrarium", tileSize: 256, maxzoom: 14 });
      map.addSource("dem-hillshade", { type: "raster-dem", tiles: DEM_TILES, encoding: "terrarium", tileSize: 256, maxzoom: 14 });
      const firstSymbol = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
      map.addLayer(
        {
          id: "hillshade",
          type: "hillshade",
          source: "dem-hillshade",
          paint: { "hillshade-exaggeration": 0.45, "hillshade-shadow-color": "#3d3424", "hillshade-highlight-color": "#ffffff" },
        },
        firstSymbol,
      );
      if (terrainRef.current) map.setTerrain({ source: "dem", exaggeration: 1.35 });
      map.setSky({
        "sky-color": "#6ea8ff",
        "horizon-color": "#d6e6ff",
        "fog-color": "#e8eef8",
        "sky-horizon-blend": 0.6,
        "horizon-fog-blend": 0.5,
        "fog-ground-blend": 0.35,
        "atmosphere-blend": 0.8,
      });

      map.addSource("course", { type: "geojson", data: courseGeoJSON() });
      map.addSource("gyms", { type: "geojson", data: gymsGeoJSON() });
      map.addSource("progress", { type: "geojson", data: lineBetween(0, 1) });
      const round = { "line-join": "round", "line-cap": "round" } as const;
      const width = (base: number): ExpressionSpecification => ["interpolate", ["linear"], ["zoom"], 10, base * 0.6, 13, base, 15, base * 1.5];
      map.addLayer({ id: "course-casing", type: "line", source: "course", layout: round, paint: { "line-color": "#0b1020", "line-width": width(9), "line-opacity": 0.9 } });
      map.addLayer({ id: "course-line", type: "line", source: "course", layout: round, paint: { "line-color": "#ffffff", "line-width": width(4.5) } });
      map.addLayer({ id: "gyms-glow", type: "line", source: "gyms", layout: round, paint: { "line-color": "#fbbf24", "line-width": width(16), "line-opacity": 0.3, "line-blur": 5 } });
      map.addLayer({ id: "gyms-line", type: "line", source: "gyms", layout: { "line-join": "round" }, paint: { "line-color": "#fbbf24", "line-width": width(4.5), "line-dasharray": [2, 1.2] } });
      map.addLayer({ id: "progress-casing", type: "line", source: "progress", layout: round, paint: { "line-color": "#022c22", "line-width": width(10), "line-opacity": 0.85 } });
      map.addLayer({ id: "progress-line", type: "line", source: "progress", layout: round, paint: { "line-color": "#34d399", "line-width": width(6) } });
      map.addLayer({
        id: "gyms-label",
        type: "symbol",
        source: "gyms",
        layout: {
          "symbol-placement": "line-center",
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 12,
          "text-letter-spacing": 0.08,
        },
        paint: { "text-color": "#fde68a", "text-halo-color": "#1a1206", "text-halo-width": 2 },
      });
      setReady(true);
      map.flyTo({ center: lngLatAt(0), zoom: FOLLOW_ZOOM, pitch: FOLLOW_PITCH, bearing: bearingAt(0, 1800), duration: 3200, essential: true });
    });

    return () => {
      markers.forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
  }, [els]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let raf = 0;
    let lastProgress = 0;
    let lastD = -1;
    let camBearing = map.getBearing();
    let wasNight: boolean | null = null;
    const introUntil = performance.now() + 3300;
    const runner = markersRef.current?.runner;
    const shadow = markersRef.current?.shadow;
    const fps = { from: 0, frames: 0, done: false };

    const tick = (now: number) => {
      const f = getFrameRef.current();
      if (!fps.done && f.started && now > introUntil) {
        fps.from ||= now;
        fps.frames++;
        if (now - fps.from > 4000) {
          fps.done = true;
          const rate = (fps.frames * 1000) / (now - fps.from);
          if (rate < LOW_FPS && terrainRef.current) {
            setTerrain(false);
            toast.info(`3D terrain is off to keep the race smooth (${Math.round(rate)} fps).`, { description: "Turn it back on with the cube button on the map." });
          }
        }
      }
      const ll = lngLatAt(f.d);
      runner?.setLngLat(ll);
      shadow?.setLngLat(lngLatAt(f.shadowD));
      if (followRef.current && now > introUntil && !map.isMoving()) {
        const target = bearingAt(Math.max(0, f.d - 300), 1800);
        const nb = lerpAngle(camBearing, target, f.d !== lastD ? 0.025 : 0.06);
        if (Math.abs(nb - camBearing) > 0.02 || f.d !== lastD) {
          camBearing = nb;
          map.jumpTo({ center: ll, bearing: camBearing });
        }
      } else camBearing = map.getBearing();
      if (now - lastProgress > 250 && f.d !== lastD) {
        (map.getSource("progress") as GeoJSONSource | undefined)?.setData(lineBetween(0, Math.max(1, f.d)));
        lastProgress = now;
        lastD = f.d;
      }
      const n = f.started ? nightness(f.t) : 1;
      const overlay = overlayRef.current;
      if (overlay) {
        const p = map.project(ll);
        overlay.style.opacity = String(n);
        overlay.style.background = `radial-gradient(circle at ${p.x}px ${p.y - 18}px, rgba(255,236,170,0.22) 0px, rgba(255,236,170,0.08) 60px, rgba(8,12,40,0) 95px, rgba(5,9,32,0.7) 300px)`;
      }
      const isNight = n > 0.5;
      if (isNight !== wasNight) {
        wasNight = isNight;
        map.setSky(
          isNight
            ? { "sky-color": "#0b1233", "horizon-color": "#1e2a55", "fog-color": "#141c3a", "sky-horizon-blend": 0.5, "horizon-fog-blend": 0.5, "fog-ground-blend": 0.3, "atmosphere-blend": 0.4 }
            : { "sky-color": "#6ea8ff", "horizon-color": "#d6e6ff", "fog-color": "#e8eef8", "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.5, "fog-ground-blend": 0.35, "atmosphere-blend": 0.8 },
        );
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (follow) {
      const f = getFrameRef.current();
      map.easeTo({ center: lngLatAt(f.d), zoom: Math.max(map.getZoom(), 12.4), pitch: FOLLOW_PITCH, duration: 900 });
    }
  }, [follow, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setTerrain(terrain ? { source: "dem", exaggeration: 1.35 } : null);
  }, [terrain, ready]);

  const overview = () => {
    const map = mapRef.current;
    if (!map) return;
    onFollowChange(false);
    map.fitBounds(courseBounds(), { padding: 50, pitch: 40, bearing: 0, duration: 1400 });
  };

  return (
    <div className={cn("relative h-full w-full overflow-hidden bg-[#0b1020]", far && "[&_.station-name]:hidden", className)}>
      {/* Inline: maplibre-gl.css is unlayered and its `position: relative` beats Tailwind's layered `absolute`. */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0 transition-opacity duration-700" style={{ opacity: 1 }} />
      {!ready && (
        <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="size-2 animate-ping rounded-full bg-primary" /> Loading the Dolomites in 3D…
          </div>
        </div>
      )}
      <div className="absolute top-[108px] right-[10px] z-10 flex flex-col gap-1.5">
        <Button size="icon-sm" variant={follow ? "default" : "secondary"} onClick={() => onFollowChange(!follow)} aria-label={follow ? "Stop following the runner" : "Follow the runner"} title="Follow runner">
          <Crosshair />
        </Button>
        <Button size="icon-sm" variant="secondary" onClick={overview} aria-label="Show the whole course" title="Whole course">
          <Expand />
        </Button>
        <Button size="icon-sm" variant={terrain ? "default" : "secondary"} onClick={() => setTerrain((v) => !v)} aria-label="Toggle 3D terrain" title="3D terrain">
          <Box />
        </Button>
      </div>
      {createPortal(
        <div className="pointer-events-none flex flex-col items-center">
          <span className="mb-1 rounded-full border border-emerald-500/30 bg-black/75 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 shadow-md backdrop-blur-sm">
            You
          </span>
          <RunnerSprite height={34} />
          <span className="-mt-1 h-1.5 w-7 rounded-full bg-black/60 blur-[1px]" />
        </div>,
        els.runner,
      )}
      {createPortal(
        <div className="pointer-events-none flex flex-col items-center">
          <span className="mb-1 rounded-full border border-purple-500/30 bg-black/75 px-2 py-0.5 text-[10px] font-semibold text-purple-300 shadow-md backdrop-blur-sm">
            Shadow
          </span>
          <ShadowSprite height={34} />
          <span className="-mt-1 h-1.5 w-7 rounded-full bg-purple-950/60 blur-[2px]" />
        </div>,
        els.shadow,
      )}
      {course.aidStations.map((s, i) => createPortal(<StationPin station={s} />, els.stations[i], s.id))}
    </div>
  );
}
