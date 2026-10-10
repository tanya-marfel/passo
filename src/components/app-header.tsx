import type { ReactNode } from "react";
import { cn } from "cn";
import type { PartnerStatus } from "@/hooks/use-partner-status";
import { MarmoSprite } from "@/components/sprites";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function Pill({ on, label, hint }: { on: boolean | undefined; label: string; hint: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium whitespace-nowrap",
            on === undefined ? "border-white/10 text-muted-foreground" : on ? "border-you/40 bg-you/10 text-you" : "border-amber-300/30 bg-amber-300/10 text-amber-200",
          )}
        >
          <span className={cn("size-1.5 rounded-full", on === undefined ? "bg-muted-foreground" : on ? "bg-you" : "bg-amber-300")} />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{hint}</TooltipContent>
    </Tooltip>
  );
}

export function PartnerPills({ status, className }: { status: PartnerStatus | null; className?: string }) {
  const model = status?.geminiModel && status.geminiModel !== "auto" ? ` · ${status.geminiModel}` : "";
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <Pill
        on={status ? status.gemini : undefined}
        label={!status ? "Coach…" : status.gemini ? `Gemini agent${model}` : "Offline coach"}
        hint={
          status?.gemini
            ? "Marmo's decisions come from Gemini with function calling over the course, your patterns and live race state."
            : "No GEMINI_API_KEY on the server, so Marmo uses the built-in rule engine with the same tools. Add the key to switch to Gemini."
        }
      />
      <Pill
        on={status ? status.gradium : undefined}
        label={!status ? "Voice…" : status.gradium ? "Gradium voice" : "Browser voice"}
        hint={
          status?.gradium
            ? "Marmo speaks with Gradium text-to-speech and understands you with Gradium speech-to-text."
            : "No GRADIUM_API_KEY on the server, so Marmo uses your browser's built-in voice and speech recognition."
        }
      />
    </div>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <MarmoSprite height={34} className="animate-none" />
      <div className="leading-none">
        <div className="font-pixel text-[13px] tracking-tight text-primary">RIVAL RUN</div>
        <div className="mt-1 text-[10px] tracking-wide text-muted-foreground uppercase">Beat your shadow</div>
      </div>
    </div>
  );
}

export function AppHeader({ status, children, className }: { status: PartnerStatus | null; children?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-2.5 sm:px-6", className)}>
      <Logo />
      <div className="flex flex-wrap items-center gap-2">
        <PartnerPills status={status} />
        {children}
      </div>
    </header>
  );
}
