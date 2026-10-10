"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import type { RaceFrame } from "@/lib/engine";
import { MapFallback } from "@/components/race/map-fallback";

const RaceMap = dynamic(() => import("@/components/race/race-map"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center bg-[#0b1020] text-sm text-muted-foreground">Loading map…</div>
  ),
});

export function RaceMapClient({
  getFrame,
  runnerD,
  shadowD,
  follow,
  onFollowChange,
}: {
  getFrame: () => RaceFrame;
  runnerD: number;
  shadowD: number;
  follow: boolean;
  onFollowChange: (follow: boolean) => void;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const onFail = useCallback((reason: string) => setFailed(reason), []);
  if (failed) return <MapFallback runnerD={runnerD} shadowD={shadowD} reason={failed} />;
  return <RaceMap getFrame={getFrame} follow={follow} onFollowChange={onFollowChange} onFail={onFail} />;
}
