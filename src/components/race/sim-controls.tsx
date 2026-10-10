"use client";

import { useState } from "react";
import {
  CloudLightning,
  Compass,
  Cookie,
  Gauge,
  MessageSquare,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { cn } from "cn";
import { SPEEDS, type RaceEngine, type RaceView } from "@/lib/engine";
import { jumpTargets } from "@/lib/live";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const SPEED_HINT: Record<number, { label: string; desc: string }> = {
  60: { label: "1×", desc: "1 sec = 1 race minute" },
  300: { label: "5×", desc: "1 sec = 5 race minutes" },
  900: { label: "15×", desc: "1 sec = 15 race minutes" },
  1800: { label: "30×", desc: "1 sec = 30 race minutes" },
};

export function SimControls({
  view,
  engine,
  className,
}: {
  view: RaceView;
  engine: RaceEngine;
  className?: string;
}) {
  const [showOptions, setShowOptions] = useState(false);
  const effortPct = Math.round(view.effort * 100);
  const jumps = jumpTargets();

  const isCramp = view.status.includes("cramp");
  const isStorm = view.status.includes("storm");

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {/* Playback & Speed Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="default"
            onClick={() => engine.togglePlay()}
            disabled={view.finished}
            className="min-w-28 font-medium shadow-sm transition active:scale-[0.98]"
            aria-label={view.playing ? "Pause race (Space)" : view.started ? "Resume race (Space)" : "Start race (Space)"}
          >
            {view.playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
            <span>{view.playing ? "Pause" : view.started ? "Resume" : "Start"}</span>
            <kbd className="hidden rounded bg-black/20 px-1 py-0.5 text-[10px] font-mono text-muted-foreground sm:inline-block">
              Space
            </kbd>
          </Button>

          {/* Speed Pills */}
          <div className="flex items-center rounded-lg border border-white/10 bg-white/[0.04] p-0.5" role="group" aria-label="Simulation speed">
            {SPEEDS.map((s) => (
              <Tooltip key={s}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => engine.setSpeed(s)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-semibold tabular-nums transition",
                      view.speed === s
                        ? "bg-foreground text-background shadow"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    aria-pressed={view.speed === s}
                  >
                    {SPEED_HINT[s].label}
                  </button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">
                  <p className="font-semibold">{SPEED_HINT[s].label} Speed</p>
                  <p className="text-muted-foreground">{SPEED_HINT[s].desc}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>

          {/* Speaking Indicator */}
          {view.held && view.playing && (
            <div className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs text-primary animate-pulse">
              <MessageSquare className="size-3" />
              <span>Marmo is deciding…</span>
            </div>
          )}

          {/* Reset Shortcut */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => engine.reset()}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Restart simulation"
              >
                <RotateCcw className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Restart race from Cortina (km 0)</TooltipContent>
          </Tooltip>
        </div>

        {/* Runner Effort Slider */}
        <div className="flex min-w-44 flex-1 items-center gap-2.5 sm:max-w-64">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 cursor-help">
                <Gauge className="size-3.5 text-muted-foreground" />
                <Label className="text-xs font-medium text-muted-foreground">Effort</Label>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-48 text-xs">
              Runner pacing intensity. 100% matches your planned pace. Lower saves energy; higher pushes pace.
            </TooltipContent>
          </Tooltip>

          <Slider
            min={85}
            max={115}
            step={1}
            value={[effortPct]}
            onValueChange={([v]) => engine.setEffort(v / 100)}
            aria-label="Runner effort intensity"
            className="flex-1"
          />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => engine.setEffort(1.0)}
                className={cn(
                  "rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums transition hover:bg-white/10",
                  effortPct > 102 ? "text-amber-300" : effortPct < 98 ? "text-sky-300" : "text-foreground",
                )}
                title="Click to reset effort to 100%"
              >
                {effortPct}%
              </button>
            </TooltipTrigger>
            <TooltipContent>Reset to 100%</TooltipContent>
          </Tooltip>
        </div>

        {/* Jump Navigation & Quick Toggles */}
        <div className="flex items-center gap-2">
          {/* Waypoint Jump Select */}
          <Select
            value=""
            onValueChange={(id) => {
              const target = jumps.find((j) => j.id === id);
              if (target) engine.seek(target.d);
            }}
          >
            <SelectTrigger size="sm" className="w-38 text-xs border-white/10 bg-white/[0.03]" aria-label="Jump to a waypoint">
              <Compass className="size-3 text-muted-foreground mr-1 shrink-0" />
              <SelectValue placeholder="Jump to…" />
            </SelectTrigger>
            <SelectContent align="end" className="max-h-72">
              {jumps.map((j) => (
                <SelectItem key={j.id} value={j.id} className="text-xs">
                  <span className="flex items-center justify-between gap-3 w-full">
                    <span className="font-medium">{j.label}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">{j.detail}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Test Scenarios & Options Toggle Button */}
          <Button
            size="sm"
            variant={showOptions ? "secondary" : "outline"}
            onClick={() => setShowOptions((v) => !v)}
            className="text-xs gap-1.5 border-white/10"
            aria-label="Toggle simulation test tools and options"
          >
            <Settings2 className="size-3.5" />
            <span className="hidden sm:inline">Tools</span>
          </Button>
        </div>
      </div>

      {/* Expandable Tools Drawer: Test Injections & Settings */}
      {showOptions && (
        <div className="animate-rise flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-2.5 text-xs">
          {/* Test Scenario Injections */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground mr-1">Inject:</span>
            <Button
              size="sm"
              variant={isCramp ? "destructive" : "secondary"}
              onClick={() => engine.inject("cramp")}
              disabled={!view.started || view.finished}
              className="h-7 text-xs gap-1"
            >
              <Zap className="size-3 text-red-300" />
              <span>Cramp</span>
            </Button>
            <Button
              size="sm"
              variant={isStorm ? "default" : "secondary"}
              onClick={() => engine.inject("storm")}
              disabled={!view.started || view.finished}
              className="h-7 text-xs gap-1"
            >
              <CloudLightning className="size-3 text-sky-300" />
              <span>Storm</span>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => engine.inject("gels")}
              disabled={!view.started || view.finished}
              className="h-7 text-xs gap-1"
            >
              <Cookie className="size-3 text-amber-300" />
              <span>Skip Gels</span>
            </Button>
          </div>

          {/* Coach Behavior Toggles */}
          <div className="flex flex-wrap items-center gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5">
                  <Switch
                    id="follow-coach"
                    checked={view.followCoach}
                    onCheckedChange={(v) => engine.setFollowCoach(v)}
                  />
                  <Label htmlFor="follow-coach" className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    Follow Marmo
                  </Label>
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-56 text-xs">
                When enabled, the runner follows coach advice. When off, the runner repeats your historical mistakes.
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5">
                  <Switch
                    id="pause-to-talk"
                    checked={view.holdForCoach}
                    onCheckedChange={(v) => engine.setHoldForCoach(v)}
                  />
                  <Label htmlFor="pause-to-talk" className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    Pause for speech
                  </Label>
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-56 text-xs">
                Pauses the clock while Marmo decides. The runner keeps moving once she starts talking.
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5">
                  <Switch
                    id="voice-toggle"
                    checked={view.voiceOn}
                    onCheckedChange={(v) => engine.setVoiceOn(v)}
                  />
                  <Label htmlFor="voice-toggle" className="cursor-pointer text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                    {view.voiceOn ? <Volume2 className="size-3" /> : <VolumeX className="size-3" />}
                    <span>Voice</span>
                  </Label>
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-56 text-xs">
                Speak the coaching lines aloud.
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  );
}
