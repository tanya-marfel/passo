"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { RunnerProfile } from "@/lib/profile";
import type { GoalId } from "@/lib/plan";

const PROFILE_KEY = "rival-run.profile.v1";
const GOAL_KEY = "rival-run.goal.v1";
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function notify() {
  for (const l of listeners) l();
}

function read(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private mode or quota: keep working in memory only.
    memory.set(key, value);
  }
  notify();
}

const memory = new Map<string, string | null>();

function snapshot(key: string) {
  return memory.has(key) ? memory.get(key) ?? null : read(key);
}

export function saveProfile(p: RunnerProfile) {
  write(PROFILE_KEY, JSON.stringify(p));
}

export function clearProfile() {
  write(PROFILE_KEY, null);
}

export function saveGoal(goal: GoalId) {
  write(GOAL_KEY, goal);
}

export function useStoredProfile(): RunnerProfile | null {
  const raw = useSyncExternalStore(subscribe, () => snapshot(PROFILE_KEY), () => null);
  return useMemo(() => {
    if (!raw) return null;
    try {
      const p = JSON.parse(raw) as RunnerProfile;
      return p?.model && Array.isArray(p.patterns) ? p : null;
    } catch {
      return null;
    }
  }, [raw]);
}

export function useStoredGoal(): GoalId {
  const raw = useSyncExternalStore(subscribe, () => snapshot(GOAL_KEY), () => null);
  return raw === "safe" || raw === "stretch" ? raw : "model";
}
