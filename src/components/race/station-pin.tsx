import { Droplets, Flag, Tent, UtensilsCrossed, Mountain } from "lucide-react";
import { cn } from "cn";
import type { AidStation } from "@/lib/course";

const KIND_STYLE: Record<AidStation["kind"], string> = {
  start: "bg-primary text-primary-foreground",
  finish: "bg-primary text-primary-foreground",
  aid: "bg-rose-500 text-white",
  water: "bg-sky-500 text-white",
  checkpoint: "bg-slate-200 text-slate-900",
  lifebase: "bg-gym text-slate-950",
};

function StationIcon({ kind }: { kind: AidStation["kind"] }) {
  const props = { className: "size-2.5", strokeWidth: 2.5 };
  switch (kind) {
    case "lifebase":
      return <Tent {...props} />;
    case "water":
      return <Droplets {...props} />;
    case "checkpoint":
      return <Mountain {...props} />;
    case "aid":
      return <UtensilsCrossed {...props} />;
    default:
      return <Flag {...props} />;
  }
}

export function StationBadge({ kind, className }: { kind: AidStation["kind"]; className?: string }) {
  return (
    <span className={cn("grid size-4 shrink-0 place-items-center rounded-full", KIND_STYLE[kind], className)}>
      <StationIcon kind={kind} />
    </span>
  );
}

export function StationPin({ station }: { station: AidStation }) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-1 rounded-full border border-white/35 bg-slate-950/85 py-0.5 pr-2 pl-0.5 text-[10px] leading-none font-medium whitespace-nowrap text-white shadow-md">
        <StationBadge kind={station.kind} />
        <span className="station-name">{station.kind === "finish" ? "Finish" : station.name}</span>
        {station.cutoff && <span className="station-name text-red-300 tabular-nums">{station.cutoff.replace(/^\w+ /, "")}</span>}
      </div>
      <div className="h-2 w-px bg-white/70" />
    </div>
  );
}
