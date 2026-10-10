import type { ReactNode } from "react";
import { cn } from "cn";
import type { PartnerStatus } from "@/hooks/use-partner-status";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function Status({ on, label, hint }: { on: boolean | undefined; label: string; hint: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("text-xs whitespace-nowrap", on ? "text-foreground/80" : "text-muted-foreground")}>{label}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-56">{hint}</TooltipContent>
    </Tooltip>
  );
}

export function PartnerPills({ status, className }: { status: PartnerStatus | null; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Status
        on={status?.gemini}
        label={!status ? "Coach" : status.gemini ? "Coach on" : "Coach off"}
        hint={status?.gemini ? "Live decisions use Gemini." : "Using the built-in coach. Add a Gemini key on the server to switch."}
      />
      <Status
        on={status?.gradium}
        label={!status ? "Voice" : status.gradium ? "Voice on" : "Browser voice"}
        hint={status?.gradium ? "Speech uses Gradium." : "Using the browser's voice."}
      />
    </div>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-sm font-semibold tracking-tight text-foreground">Passo</span>
      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        Dolomites
      </span>
    </div>
  );
}

export function AppHeader({ status, children, className }: { status: PartnerStatus | null; children?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-3 sm:px-8", className)}>
      <Logo />
      <div className="flex flex-wrap items-center gap-4">
        <PartnerPills status={status} />
        {children}
      </div>
    </header>
  );
}
