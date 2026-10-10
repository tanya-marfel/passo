"use client";

import { CloudLightning, Cookie, Pause, Play, RotateCcw, Zap } from "lucide-react";
import { cn } from "cn";
import { SPEEDS, type RaceEngine, type RaceView } from "@/lib/engine";
import { JUMP_TARGETS } from "@/lib/live";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const SPEED_HINT: Record<number, string> = {
  60: "1 second = 1 race minute",
  300: "1 second = 5 race minutes",
  900: "1 second = 15 race minutes",
  1800: "1 second = 30 race minutes",
};

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2">
          <Switch id={id} checked={checked} onCheckedChange={onChange} />
          <Label htmlFor={id} className="cursor-pointer text-xs whitespace-nowrap">
            {label}
          </Label>
        </div>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

export function SimControls({ view, engine, className }: { view: RaceView; engine: RaceEngine; className?: string }) {
  const effortPct = Math.round(view.effort * 100);
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2.5", className)}>
      <div className="flex items-center gap-2">
        <Button
          size="lg"
          onClick={() => engine.togglePlay()}
          disabled={view.finished}
          className="min-w-24"
          aria-label={view.playing ? "Pause race" : view.started ? "Resume race" : "Start race"}
        >
          {view.playing ? <Pause /> : <Play />}
          {view.playing ? "Pause" : view.started ? "Resume" : "Start"}
        </Button>
        <div className="flex rounded-lg bg-muted p-0.5" role="group" aria-label="Simulation speed">
          {SPEEDS.map((s) => (
            <Tooltip key={s}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => engine.setSpeed(s)}
                  className={cn(
                    "rounded-md px-2 py-1 text-xs font-medium tabular-nums transition",
                    view.speed === s ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-pressed={view.speed === s}
                >
                  ×{s}
                </button>
              </TooltipTrigger>
              <TooltipContent>{SPEED_HINT[s]}</TooltipContent>
            </Tooltip>
          ))}
        </div>
        {view.held && view.playing && <span className="text-[11px] text-primary">Marmo is talking…</span>}
      </div>

      <div className="flex min-w-48 flex-1 items-center gap-2 sm:max-w-64">
        <Label className="text-xs whitespace-nowrap text-muted-foreground">Effort</Label>
        <Slider min={85} max={115} step={1} value={[effortPct]} onValueChange={([v]) => engine.setEffort(v / 100)} aria-label="Runner effort" />
        <span className={cn("w-10 text-right text-xs tabular-nums", effortPct > 102 ? "text-amber-300" : effortPct < 98 ? "text-sky-300" : "text-muted-foreground")}>
          {effortPct}%
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Toggle id="follow" label="Follow Marmo" hint="When off, the runner ignores the coach and repeats the Shadow's mistakes." checked={view.followCoach} onChange={(v) => engine.setFollowCoach(v)} />
        <Toggle id="hold" label="Pause to talk" hint="Freeze the race clock while Marmo thinks and speaks." checked={view.holdForCoach} onChange={(v) => engine.setHoldForCoach(v)} />
        <Toggle id="voice" label="Voice" hint="Speak Marmo's lines with Gradium (or the browser voice)." checked={view.voiceOn} onChange={(v) => engine.setVoiceOn(v)} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Inject</span>
        <Button size="sm" variant="secondary" onClick={() => engine.inject("cramp")} disabled={!view.started || view.finished}>
          <Zap className="text-red-300" /> Cramp
        </Button>
        <Button size="sm" variant="secondary" onClick={() => engine.inject("storm")} disabled={!view.started || view.finished}>
          <CloudLightning className="text-sky-300" /> Storm
        </Button>
        <Button size="sm" variant="secondary" onClick={() => engine.inject("gels")} disabled={!view.started || view.finished}>
          <Cookie className="text-amber-300" /> Skip gels
        </Button>
      </div>

      <div className="flex items-center gap-1.5">
        <Select value="" onValueChange={(id) => {
          const target = JUMP_TARGETS.find((j) => j.id === id);
          if (target) engine.seek(target.d);
        }}>
          <SelectTrigger size="sm" className="w-44 text-xs" aria-label="Jump to a point of the race">
            <SelectValue placeholder="Jump to…" />
          </SelectTrigger>
          <SelectContent>
            {JUMP_TARGETS.map((j) => (
              <SelectItem key={j.id} value={j.id} className="text-xs">
                <span className="flex flex-col">
                  <span>{j.label}</span>
                  <span className="text-[10px] text-muted-foreground">{j.detail}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon-sm" variant="ghost" onClick={() => engine.reset()} aria-label="Restart the race">
              <RotateCcw />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Restart from Cortina</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
