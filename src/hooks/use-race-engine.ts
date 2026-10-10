"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { RaceEngine, type Speaker } from "@/lib/engine";
import type { GoalId, Plan } from "@/lib/plan";
import type { RunnerProfile } from "@/lib/profile";

export function useRaceEngine(profile: RunnerProfile, plan: Plan, goal: GoalId, speaker: Speaker) {
  const [engine] = useState(() => new RaceEngine(profile, plan, goal));
  useEffect(() => {
    engine.mount();
    return () => engine.unmount();
  }, [engine]);
  useEffect(() => {
    engine.setSpeaker(speaker);
  }, [engine, speaker]);
  const view = useSyncExternalStore(engine.subscribe, engine.getView, engine.getView);
  return { engine, view };
}
