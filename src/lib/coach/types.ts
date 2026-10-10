import type { GoalId, PlanProfile } from "@/lib/plan";
import type { RunnerProfile } from "@/lib/profile";
import type { SimEventType } from "@/lib/sim";

export type CoachTrigger = {
  type: SimEventType;
  refId?: string;
  data?: Record<string, number | string | boolean | null>;
  /** what the runner said, for runner_message */
  text?: string;
};

export type LiveSnapshot = {
  t: number;
  d: number;
  hp: number;
  effort: number;
  debt: number;
  status: string[];
  gels: number;
  lastGelAgoMin: number;
  shadowGapSec: number;
  planDeltaSec: number;
  projectedFinishSec: number;
  arrivals: Record<string, number>;
  badges: string[];
  stopAt: string | null;
};

export type CoachProfile = PlanProfile &
  Pick<RunnerProfile, "name" | "type" | "level" | "totals" | "highlights" | "hrDriftPct">;

export type CoachRequest = {
  trigger: CoachTrigger;
  live: LiveSnapshot;
  profile: CoachProfile;
  goal: GoalId;
  targetSec?: number;
  history: { role: "coach" | "runner"; text: string }[];
};

export type CoachAction =
  | { type: "set_effort"; value: number; reason?: string; durationMin?: number }
  | { type: "eat" }
  | { type: "salt" }
  | { type: "caffeine" }
  | { type: "layer_up" }
  | { type: "quick_aid"; stationId?: string }
  | { type: "pace_climb"; climbId?: string }
  | { type: "easy_start" };

export type CoachStep = {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  ms?: number;
};

export type CoachResponse = {
  engine: "gemini" | "offline";
  model?: string;
  decision: "speak" | "silent";
  message: string;
  tone: "calm" | "urgent" | "celebrate";
  actions: CoachAction[];
  steps: CoachStep[];
  latencyMs: number;
  note?: string;
};

/** NDJSON lines sent by /api/coach when the client accepts application/x-ndjson. */
export type CoachStreamEvent =
  | { type: "start"; engine: CoachResponse["engine"]; model?: string }
  | { type: "step"; step: CoachStep }
  | { type: "done"; response: CoachResponse }
  | { type: "error"; error: string };

export const COACH_STREAM_TYPE = "application/x-ndjson";
