import { course, climbEndD, TOTAL_M } from "@/lib/course";
import { distanceAtTime, timeAtDistance, type GoalId, type Plan } from "@/lib/plan";
import type { RunnerProfile } from "@/lib/profile";
import {
  applyCoachActions,
  initialSim,
  projectRace,
  shadowGapSec,
  stepSim,
  type Badge,
  type SimContext,
  type SimEvent,
  type SimState,
} from "@/lib/sim";
import { requestCoach } from "@/lib/coach/client";
import { offlineCoach } from "@/lib/coach/offline";
import type { CoachRequest, CoachResponse, CoachStep, CoachStreamEvent, CoachTrigger } from "@/lib/coach/types";
import {
  battleText,
  buildCoachRequest,
  nightness,
  statusList,
  triggerPriority,
  TRIGGER_LABEL,
  type BattleLine,
  type BattleTone,
  type StatusId,
} from "@/lib/live";

export type Speaker = {
  speak: (text: string) => Promise<unknown>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  /** Call inside the start click so later Gradium playback is allowed. */
  unlock?: () => void;
};

export type CoachTurn = {
  id: number;
  label: string;
  trigger: CoachTrigger;
  auto: boolean;
  t: number;
  d: number;
  status: "thinking" | "done";
  /** tool calls streamed so far; replaced by response.steps when the turn finishes */
  steps: CoachStep[];
  engine?: CoachResponse["engine"];
  model?: string;
  response?: CoachResponse;
  applied: boolean;
};

export type CoachLine = {
  id: number;
  text: string;
  tone: CoachResponse["tone"];
  label: string;
  engine: CoachResponse["engine"];
  model?: string;
};

export type InjectKind = "cramp" | "storm" | "gels";

export const SPEEDS = [60, 300, 900, 1800] as const;

type UiState = {
  started: boolean;
  playing: boolean;
  speed: number;
  followCoach: boolean;
  holdForCoach: boolean;
  voiceOn: boolean;
  turns: CoachTurn[];
  log: BattleLine[];
  line: CoachLine | null;
  thinking: CoachTurn | null;
  speaking: boolean;
  showFinish: boolean;
};

export type RaceView = UiState & {
  version: number;
  t: number;
  d: number;
  hp: number;
  effort: number;
  gels: number;
  finished: boolean;
  stopAt: string | null;
  status: StatusId[];
  badges: Badge[];
  coachedClimbs: string[];
  coachedStart: boolean;
  shadowD: number;
  planD: number;
  shadowGapSec: number;
  planDeltaSec: number;
  projectedFinishSec: number;
  arrivals: Record<string, number>;
  nightness: number;
  held: boolean;
};

export type RaceFrame = { t: number; d: number; shadowD: number; started: boolean };

type Queued = { trigger: CoachTrigger; prio: 0 | 1 | 2; atT: number; seq: number; auto: boolean };

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function triggerLabel(tr: CoachTrigger) {
  const base = TRIGGER_LABEL[tr.type] ?? tr.type;
  const station = course.aidStations.find((s) => s.id === tr.refId);
  const climb = course.climbs.find((c) => c.id === tr.refId);
  if (climb) return `${base} · ${climb.name}`;
  if (station) return `${base} · ${station.name}`;
  return base;
}

/**
 * Owns the live race: the simulation loop, the coach trigger queue (one agent call in flight),
 * battle text and voice. React subscribes to immutable snapshots via useSyncExternalStore.
 */
export class RaceEngine {
  private s: SimState = initialSim();
  private readonly ctx: SimContext;
  private readonly goal: GoalId;
  private speaker: Speaker | null = null;
  private listeners = new Set<() => void>();
  private raf = 0;
  private lastFrame = 0;
  private lastEmit = 0;
  private dirty = true;
  private holding = false;
  private proj: { finishSec: number; arrivals: Record<string, number> };
  private projAt = -Infinity;
  private queue: Queued[] = [];
  private busy = false;
  private seq = 0;
  private turnSeq = 0;
  private lineSeq = 0;
  private logSeq = 0;
  private epoch = 0;
  private version = 0;
  private history: CoachRequest["history"] = [];
  private ui: UiState = {
    started: false,
    playing: false,
    speed: 300,
    followCoach: true,
    holdForCoach: true,
    voiceOn: true,
    turns: [],
    log: [],
    line: null,
    thinking: null,
    speaking: false,
    showFinish: false,
  };
  private view: RaceView;

  constructor(profile: RunnerProfile, plan: Plan, goal: GoalId) {
    this.ctx = { profile, plan };
    this.goal = goal;
    this.proj = projectRace(this.s, this.ctx);
    this.view = this.compute(true);
  }

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  getView = () => this.view;

  getFrame = (): RaceFrame => ({
    t: this.s.t,
    d: this.s.d,
    shadowD: distanceAtTime(this.ctx.plan.shadow, this.s.t),
    started: this.ui.started,
  });

  setSpeaker(speaker: Speaker | null) {
    this.speaker = speaker;
  }

  mount() {
    cancelAnimationFrame(this.raf);
    this.lastFrame = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  unmount() {
    cancelAnimationFrame(this.raf);
    this.epoch++;
    this.busy = false;
    this.queue = [];
    this.speaker?.stop();
  }

  // Controls -----------------------------------------------------------------

  start(): void {
    if (this.s.finished) return;
    this.speaker?.unlock?.();
    const resuming = this.ui.started;
    if (!this.ui.started) {
      this.ui.started = true;
      this.pushLog("The race begins in Cortina! Headlamps on.", "system");
      this.enqueue({ type: "race_start" }, 0);
    }
    this.ui.playing = true;
    // Pause leaves the current coach line's speak() open, and holdForCoach keeps
    // the clock frozen until that promise settles. Resume has to run the clock now.
    if (resuming) this.holding = false;
    this.speaker?.resume();
    this.emitNow();
  }

  play(): void {
    this.start();
  }

  pause() {
    this.ui.playing = false;
    this.speaker?.pause();
    this.emitNow();
  }

  togglePlay() {
    if (this.ui.playing) this.pause();
    else this.play();
  }

  setSpeed(speed: number) {
    this.ui.speed = speed;
    this.emitNow();
  }

  setFollowCoach(on: boolean) {
    this.ui.followCoach = on;
    this.pushLog(on ? "You will follow Marmo's advice." : "You stop listening to Marmo. Old habits return...", on ? "system" : "shadow");
    this.emitNow();
  }

  setHoldForCoach(on: boolean) {
    this.ui.holdForCoach = on;
    if (!on) this.holding = false;
    this.emitNow();
  }

  setVoiceOn(on: boolean) {
    this.ui.voiceOn = on;
    if (!on) this.speaker?.stop();
    this.emitNow();
  }

  setEffort(value: number) {
    this.s.effort = value;
    this.s.effortRestore = null;
    this.projAt = -Infinity;
    this.emitNow();
  }

  closeFinish() {
    this.ui.showFinish = false;
    this.emitNow();
  }

  inject(kind: InjectKind) {
    const s = this.s;
    if (!this.ui.started || s.finished) return;
    if (kind === "cramp") {
      s.cramp = { until: s.t + 25 * 60, relieved: false };
      this.handleEvents([{ type: "cramp", t: s.t, d: s.d }]);
    } else if (kind === "storm") {
      s.storm = { until: s.t + 50 * 60, layered: false };
      this.handleEvents([{ type: "storm", t: s.t, d: s.d }]);
    } else {
      s.skipGels += 2;
      this.handleEvents([{ type: "missed_fuel", t: s.t, d: s.d }]);
    }
    this.projAt = -Infinity;
    this.emitNow();
  }

  ask(text: string, auto = false) {
    const q = text.trim();
    if (!q) return;
    if (!auto) {
      this.history.push({ role: "runner", text: q });
      this.pushLog(`You: "${q}"`, "info");
    }
    this.enqueue({ type: "runner_message", text: q }, 0, auto);
    this.emitNow();
  }

  reset() {
    this.epoch++;
    this.queue = [];
    this.busy = false;
    this.holding = false;
    this.speaker?.stop();
    this.s = initialSim();
    this.history = [];
    this.ui = { ...this.ui, started: false, playing: false, turns: [], log: [], line: null, thinking: null, speaking: false, showFinish: false };
    this.projAt = -Infinity;
    this.emitNow();
  }

  /** Jump to a distance. Going back restarts the race; the coach keeps working while skipping. */
  seek(targetD: number) {
    const target = Math.max(0, Math.min(TOTAL_M - 200, targetD));
    if (target < 50) return this.reset();
    this.epoch++;
    this.queue = [];
    this.busy = false;
    this.holding = false;
    this.speaker?.stop();
    this.ui.thinking = null;
    this.ui.speaking = false;
    this.ui.showFinish = false;
    if (target < this.s.d - 1 || this.s.finished) {
      this.s = initialSim();
      this.history = [];
      this.ui.log = [];
    }
    const from = this.s.d;
    const badgesBefore = this.s.badges.length;
    this.autoRun(target);
    this.ui.started = true;
    const gained = this.s.badges.length - badgesBefore;
    this.pushLog(
      `${target >= from ? "Skipped ahead" : "Rewound"} to km ${(this.s.d / 1000).toFixed(1)}${gained > 0 ? `, ${gained} new badge${gained > 1 ? "s" : ""} on the way` : ""}.`,
      "system",
    );
    this.projAt = -Infinity;
    this.ask("Quick status update, where am I?", true);
  }

  // Loop ---------------------------------------------------------------------

  private tick = (now: number) => {
    // Up to 1 s per frame keeps the race speed honest on slow (software-rendered) maps; stepSim sub-steps internally.
    const dtReal = this.lastFrame ? Math.min(1, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;
    if (this.ui.playing && !this.holding && !this.s.finished && dtReal > 0) {
      const prevT = this.s.t;
      const evs = stepSim(this.s, dtReal * this.ui.speed, this.ctx, { checkins: true });
      this.shadowMoves(prevT, this.s.t);
      this.handleEvents(evs);
      this.dirty = true;
    }
    if (this.dirty && now - this.lastEmit > 90) this.emit(now);
    this.raf = requestAnimationFrame(this.tick);
  };

  private autoRun(targetD: number) {
    let guard = 0;
    while (this.s.d < targetD && !this.s.finished && guard++ < 5000) {
      const evs = stepSim(this.s, 60, this.ctx, { checkins: true });
      for (const e of evs) {
        if (e.type === "summit" || e.type === "shadow_pass" || e.type === "shadow_ahead") {
          const bt = battleText(e, this.ctx.profile);
          if (bt) this.pushLog(bt.text, bt.tone, e);
        }
        if (!this.ui.followCoach) continue;
        const prio = triggerPriority(e);
        if (prio === null || (prio === 2 && e.type !== "checkin")) continue;
        const req = buildCoachRequest({ type: e.type, refId: e.refId, data: e.data }, this.s, this.ctx, this.goal, []);
        const res = offlineCoach(req, undefined, this.ctx.plan);
        applyCoachActions(this.s, res.actions);
        if (res.decision === "speak") this.s.lastCoachT = this.s.t;
      }
    }
  }

  private shadowMoves(prevT: number, t: number) {
    const { plan } = this.ctx;
    const a = distanceAtTime(plan.shadow, prevT);
    const b = distanceAtTime(plan.shadow, t);
    for (const m of plan.shadowMoves) {
      const md = m.km * 1000;
      if (md > a && md <= b) this.pushLog(`Your Shadow used ${m.move}!`, "shadow");
    }
  }

  private handleEvents(evs: SimEvent[]) {
    for (const e of evs) {
      const bt = battleText(e, this.ctx.profile);
      if (bt) this.pushLog(bt.text, bt.tone, e);
      const prio = triggerPriority(e);
      if (prio !== null) this.enqueue({ type: e.type, refId: e.refId, data: e.data }, prio);
    }
  }

  private pushLog(text: string, tone: BattleTone, at?: Pick<SimEvent, "t" | "d">) {
    const line: BattleLine = { id: ++this.logSeq, t: at?.t ?? this.s.t, d: at?.d ?? this.s.d, text, tone };
    this.ui.log = [line, ...this.ui.log].slice(0, 80);
    this.dirty = true;
  }

  // Coach --------------------------------------------------------------------

  private enqueue(trigger: CoachTrigger, prio: 0 | 1 | 2, auto = false) {
    if (trigger.type !== "runner_message" && this.queue.some((q) => q.trigger.type === trigger.type && q.trigger.refId === trigger.refId)) return;
    this.queue.push({ trigger, prio, atT: this.s.t, seq: this.seq++, auto });
    this.queue.sort((a, b) => a.prio - b.prio || a.seq - b.seq);
    while (this.queue.length > 5) {
      let i = -1;
      for (let k = this.queue.length - 1; k >= 0; k--) if (this.queue[k].prio === 2) {
        i = k;
        break;
      }
      this.queue.splice(i >= 0 ? i : this.queue.length - 1, 1);
    }
    if (prio <= 1 && this.ui.holdForCoach) this.holding = true;
    void this.pump();
  }

  private isStale(q: Queued) {
    if (q.prio === 2 && this.s.t - q.atT > 30 * 60) return true;
    if (q.trigger.type === "climb_ahead") {
      const c = course.climbs.find((x) => x.id === q.trigger.refId);
      if (c && this.s.d > climbEndD(c)) return true;
    }
    return false;
  }

  private async pump(): Promise<void> {
    if (this.busy) return;
    let next = this.queue.shift();
    while (next && this.isStale(next)) next = this.queue.shift();
    if (!next) {
      this.holding = false;
      this.dirty = true;
      return;
    }
    this.busy = true;
    const epoch = this.epoch;
    if (next.prio <= 1 && this.ui.holdForCoach) this.holding = true;

    let turn: CoachTurn = {
      id: ++this.turnSeq,
      label: next.auto ? "Status update" : triggerLabel(next.trigger),
      trigger: next.trigger,
      auto: next.auto,
      t: this.s.t,
      d: this.s.d,
      status: "thinking",
      steps: [],
      applied: false,
    };
    const update = (patch: Partial<CoachTurn>) => {
      turn = { ...turn, ...patch };
      this.ui.turns = this.ui.turns.map((x) => (x.id === turn.id ? turn : x));
      if (this.ui.thinking?.id === turn.id) this.ui.thinking = turn.status === "thinking" ? turn : null;
    };
    this.ui.thinking = turn;
    this.ui.turns = [turn, ...this.ui.turns].slice(0, 30);
    this.emitNow();

    const req = buildCoachRequest(next.trigger, this.s, this.ctx, this.goal, this.history);
    const onEvent = (e: CoachStreamEvent) => {
      if (epoch !== this.epoch) return;
      if (e.type === "start") update({ engine: e.engine, model: e.model });
      else if (e.type === "step") update({ steps: [...(turn.steps ?? []), e.step] });
      this.emitNow();
    };
    let res: CoachResponse;
    try {
      res = await requestCoach(req, onEvent, AbortSignal.timeout(30000));
    } catch {
      res = offlineCoach(req, "The coach API was unreachable, so Marmo answered on-device.", this.ctx.plan);
    }
    if (epoch !== this.epoch) return;

    const applied = this.ui.followCoach && res.actions.length > 0;
    if (applied) {
      applyCoachActions(this.s, res.actions);
      this.projAt = -Infinity;
    }
    update({ status: "done", response: res, applied, steps: res.steps ?? turn.steps ?? [], engine: res.engine, model: res.model });
    this.ui.thinking = null;

    if (res.decision === "speak" && res.message) {
      this.history = [...this.history, { role: "coach" as const, text: res.message }].slice(-8);
      this.s.lastCoachT = this.s.t;
      this.ui.line = { id: ++this.lineSeq, text: res.message, tone: res.tone, label: turn.label, engine: res.engine, model: res.model };
      this.ui.speaking = true;
      this.emitNow();
      const reading = delay(Math.min(9000, res.message.length * 26) + 1200);
      const voice = this.ui.voiceOn && this.speaker ? this.speaker.speak(res.message) : Promise.resolve();
      await Promise.all([reading, voice]);
      if (epoch !== this.epoch) return;
      this.ui.speaking = false;
    }

    if (next.trigger.type === "finish") {
      this.ui.showFinish = true;
      this.ui.playing = false;
    }
    this.busy = false;
    if (!this.queue.some((q) => q.prio <= 1)) this.holding = false;
    this.emitNow();
    void this.pump();
  }

  // Snapshots ----------------------------------------------------------------

  private compute(force = false): RaceView {
    const s = this.s;
    const { plan, profile } = this.ctx;
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    if (force || now - this.projAt > 400) {
      this.proj = projectRace(s, this.ctx);
      this.projAt = now;
    }
    return {
      ...this.ui,
      version: ++this.version,
      t: s.t,
      d: s.d,
      hp: s.hp,
      effort: s.effort,
      gels: s.gels,
      finished: s.finished,
      stopAt: s.stopAt,
      status: statusList(s, profile),
      badges: [...s.badges],
      coachedClimbs: Object.keys(s.coached.climbs),
      coachedStart: s.coached.start,
      shadowD: distanceAtTime(plan.shadow, s.t),
      planD: distanceAtTime(plan.timeline, s.t),
      shadowGapSec: shadowGapSec(s, plan),
      planDeltaSec: s.t - timeAtDistance(plan.timeline, s.d),
      projectedFinishSec: this.proj.finishSec,
      arrivals: this.proj.arrivals,
      nightness: nightness(s.t),
      held: this.holding,
    };
  }

  private emit(now: number) {
    this.lastEmit = now;
    this.dirty = false;
    this.view = this.compute();
    for (const l of this.listeners) l();
  }

  private emitNow() {
    this.emit(typeof performance !== "undefined" ? performance.now() : 0);
  }
}
