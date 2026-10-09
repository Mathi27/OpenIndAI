// Client-side mission engine. Mirrors backend/app/engine.py exactly; both are
// tested against shared/test-vectors so they cannot drift. The client copy
// gives instant feedback; the server copy is authoritative for scoring.
import type { GameEvent, MissionDef, Pathway, RuleCondition, Step, Trigger } from "./types";

export type MissionState = "NOT_STARTED" | "BRIEFING" | "ACTIVE" | "PAUSED" | "BLOCKED" | "COMPLETED" | "FAILED" | "ASSESSED";

export const TERMINAL: ReadonlySet<MissionState> = new Set(["COMPLETED", "FAILED", "ASSESSED"]);

const TRANSITIONS: Record<MissionState, MissionState[]> = {
  NOT_STARTED: ["BRIEFING"],
  BRIEFING: ["ACTIVE", "PAUSED", "FAILED"],
  ACTIVE: ["PAUSED", "BLOCKED", "COMPLETED", "FAILED"],
  PAUSED: ["ACTIVE", "BLOCKED", "BRIEFING", "FAILED"],
  BLOCKED: ["ACTIVE", "PAUSED", "FAILED"],
  COMPLETED: ["ASSESSED"],
  FAILED: ["ASSESSED"],
  ASSESSED: [],
};

export interface Counters {
  mistakes: number;
  invalidActions: number;
  incorrectDecisions: number;
  criticalErrors: number;
  hints: number;
  duplicates: number;
  inspections: number;
  toolUses: number;
  checklistOpens: number;
  rejected: number;
}

export interface EngineState {
  state: MissionState;
  resumeState: MissionState | null;
  completed: string[];
  flags: string[];
  criticalCounts: Record<string, number>;
  blockedBy: string | null;
  lastSeq: number;
  counters: Counters;
  missedConcepts: string[];
}

export interface EngineContext {
  pathway: Pathway;
  hintBudget: number;
}

export type Outcome =
  | "rejected"
  | "paused"
  | "resumed"
  | "unblocked"
  | "hint"
  | "no_effect"
  | "critical_block"
  | "critical_fail"
  | "invalid_action"
  | "step_completed"
  | "mistake"
  | "prerequisite_missing"
  | "duplicate"
  | "advisory";

export interface ApplyResult {
  outcome: Outcome;
  reason?: string;
  steps?: string[];
  stepId?: string;
  missing?: string[];
  ruleId?: string;
  feedbackKey?: string | null;
  toolId?: string;
  hintIndex?: number;
  missionCompleted?: boolean;
}

export class TransitionError extends Error {}

export function newState(): EngineState {
  return {
    state: "NOT_STARTED",
    resumeState: null,
    completed: [],
    flags: [],
    criticalCounts: {},
    blockedBy: null,
    lastSeq: 0,
    counters: {
      mistakes: 0,
      invalidActions: 0,
      incorrectDecisions: 0,
      criticalErrors: 0,
      hints: 0,
      duplicates: 0,
      inspections: 0,
      toolUses: 0,
      checklistOpens: 0,
      rejected: 0,
    },
    missedConcepts: [],
  };
}

export function transition(st: EngineState, to: MissionState): void {
  if (!TRANSITIONS[st.state].includes(to)) throw new TransitionError(`illegal transition ${st.state} -> ${to}`);
  st.state = to;
}

function matches(trigger: Trigger, ev: GameEvent): boolean {
  if (trigger.type !== ev.type) return false;
  if (trigger.target != null && ev.target !== trigger.target) return false;
  if (trigger.targets != null && !trigger.targets.includes(ev.target ?? "")) return false;
  if (trigger.value != null && ev.value !== trigger.value) return false;
  return true;
}

/** Progress guard for rules (mirrors engine.py rule_ok). */
export function ruleOk(cond: RuleCondition | null | undefined, st: EngineState): boolean {
  if (!cond) return true;
  if ((cond.completed ?? []).some((c) => !st.completed.includes(c))) return false;
  if ((cond.notCompleted ?? []).some((c) => st.completed.includes(c))) return false;
  if (cond.flag != null && !st.flags.includes(cond.flag)) return false;
  return true;
}

export function isApplicable(step: Step, st: EngineState, ctx: EngineContext): boolean {
  const c = step.condition;
  if (!c) return true;
  if (c.flag != null && !st.flags.includes(c.flag)) return false;
  if (c.pathway != null && c.pathway !== ctx.pathway) return false;
  return true;
}

function satisfied(m: MissionDef, stepId: string, st: EngineState, ctx: EngineContext): boolean {
  if (st.completed.includes(stepId)) return true;
  const step = m.steps.find((s) => s.id === stepId)!;
  return !isApplicable(step, st, ctx);
}

export function missingRequirements(m: MissionDef, step: Step, st: EngineState, ctx: EngineContext): string[] {
  return step.requires.filter((r) => !satisfied(m, r, st, ctx));
}

export function remainingRequired(m: MissionDef, st: EngineState, ctx: EngineContext): string[] {
  return m.steps.filter((s) => !s.optional && isApplicable(s, st, ctx) && !st.completed.includes(s.id)).map((s) => s.id);
}

/** First required, applicable, incomplete step whose prerequisites are met. */
export function currentStep(m: MissionDef, st: EngineState, ctx: EngineContext): Step | null {
  for (const s of m.steps) {
    if (s.optional || st.completed.includes(s.id) || !isApplicable(s, st, ctx)) continue;
    if (missingRequirements(m, s, st, ctx).length === 0) return s;
  }
  return null;
}

/** Steps relevant to show in the checklist: required + applicable (+ completed optional ones). */
export function visibleSteps(m: MissionDef, st: EngineState, ctx: EngineContext): Step[] {
  return m.steps.filter((s) => isApplicable(s, st, ctx) && (!s.optional || st.completed.includes(s.id)));
}

function addMissed(st: EngineState, concept: string): void {
  if (!st.missedConcepts.includes(concept)) st.missedConcepts.push(concept);
}

export function start(st: EngineState): void {
  transition(st, "BRIEFING");
}

export function apply(m: MissionDef, st: EngineState, ev: GameEvent, ctx: EngineContext): ApplyResult {
  if (!Number.isInteger(ev.seq) || ev.seq <= st.lastSeq) return { outcome: "rejected", reason: "stale_seq" };
  st.lastSeq = ev.seq;
  const reject = (reason: string): ApplyResult => {
    st.counters.rejected += 1;
    return { outcome: "rejected", reason };
  };

  if (st.state === "NOT_STARTED") return reject("not_started");
  if (TERMINAL.has(st.state)) return reject("terminal");

  if (ev.type === "paused") {
    if (st.state === "PAUSED") return reject("already_paused");
    st.resumeState = st.state;
    transition(st, "PAUSED");
    return { outcome: "paused" };
  }
  if (ev.type === "resumed") {
    if (st.state !== "PAUSED") return reject("not_paused");
    const target = st.resumeState ?? "ACTIVE";
    st.resumeState = null;
    transition(st, target);
    return { outcome: "resumed" };
  }
  if (st.state === "PAUSED") return reject("paused");

  if (st.state === "BRIEFING") {
    if (ev.type === "briefing_acknowledged") {
      // The briefing can only be acknowledged once its own prerequisites (e.g. meeting the supervisor) are met.
      const bstep = m.steps.find((s) => s.trigger.type === "briefing_acknowledged");
      if (bstep) {
        const missing = missingRequirements(m, bstep, st, ctx);
        if (missing.length) {
          st.counters.rejected += 1;
          return { outcome: "rejected", reason: "briefing_prerequisites", missing };
        }
      }
      transition(st, "ACTIVE");
      return processActive(m, st, ev, ctx);
    }
    if (m.briefingPhase.allowedEvents.includes(ev.type)) return processActive(m, st, ev, ctx);
    return reject("briefing");
  }
  if (st.state === "BLOCKED") {
    if (ev.type !== "block_acknowledged") return reject("blocked");
    st.blockedBy = null;
    transition(st, "ACTIVE");
    const r = processActive(m, st, ev, ctx);
    return r.outcome === "no_effect" ? { outcome: "unblocked" } : r;
  }
  if (ev.type === "briefing_acknowledged") return reject("briefing_done");
  if (ev.type === "block_acknowledged") return reject("not_blocked");
  return processActive(m, st, ev, ctx);
}

function processActive(m: MissionDef, st: EngineState, ev: GameEvent, ctx: EngineContext): ApplyResult {
  const c = st.counters;
  const target = ev.target ?? null;

  if (ev.type === "hint_requested") {
    if (c.hints >= ctx.hintBudget) {
      c.rejected += 1;
      return { outcome: "rejected", reason: "hint_budget" };
    }
    c.hints += 1;
    return { outcome: "hint", hintIndex: c.hints };
  }
  if (ev.type === "checklist_opened") c.checklistOpens += 1;
  if (ev.type === "tool_selected") return { outcome: "no_effect" };
  if (ev.type === "object_inspected") c.inspections += 1;
  if (ev.type === "tool_used") c.toolUses += 1;

  // 1. Critical safety errors first — assessed only once the trainee has been
  //    briefed (ACTIVE); before that no assignment exists to violate.
  for (const rule of st.state === "ACTIVE" ? m.criticalErrors : []) {
    if (!matches(rule.trigger, ev) || !ruleOk(rule.condition, st)) continue;
    st.criticalCounts[rule.id] = (st.criticalCounts[rule.id] ?? 0) + 1;
    c.criticalErrors += 1;
    addMissed(st, rule.concept);
    if (rule.setsFlag && !st.flags.includes(rule.setsFlag)) st.flags.push(rule.setsFlag);
    if (rule.response === "fail" || c.criticalErrors >= m.criticalPolicy.failAfterTotal) {
      transition(st, "FAILED");
      return { outcome: "critical_fail", ruleId: rule.id };
    }
    st.blockedBy = rule.id;
    transition(st, "BLOCKED");
    return { outcome: "critical_block", ruleId: rule.id };
  }

  // 2. Tool validity.
  if (ev.type === "tool_used") {
    const tool = m.tools.find((t) => t.id === ev.value);
    if (!tool) {
      c.rejected += 1;
      return { outcome: "rejected", reason: "unknown_tool" };
    }
    if (tool.requiresTarget && !target) {
      c.invalidActions += 1;
      return { outcome: "invalid_action", reason: "tool_needs_target", toolId: tool.id };
    }
    if (target && !tool.allowedTargets.includes("*") && !tool.allowedTargets.includes(target)) {
      c.invalidActions += 1;
      return { outcome: "invalid_action", reason: "tool_not_allowed", toolId: tool.id };
    }
  }

  // 3. Steps.
  const completedNow: string[] = [];
  let mistake: { step: Step; missing: string[] } | null = null;
  let ignored: { step: Step; missing: string[] } | null = null;
  let duplicate = false;
  for (const step of m.steps) {
    if (!isApplicable(step, st, ctx) || !matches(step.trigger, ev)) continue;
    if (st.completed.includes(step.id)) {
      duplicate = true;
      continue;
    }
    const missing = missingRequirements(m, step, st, ctx);
    if (missing.length) {
      if (step.outOfOrder === "mistake" && !mistake) mistake = { step, missing };
      else if (!ignored) ignored = { step, missing };
      continue;
    }
    st.completed.push(step.id);
    completedNow.push(step.id);
  }
  if (completedNow.length) {
    const r: ApplyResult = { outcome: "step_completed", steps: completedNow };
    if (st.state === "ACTIVE" && remainingRequired(m, st, ctx).length === 0) {
      transition(st, "COMPLETED");
      r.missionCompleted = true;
    }
    return r;
  }
  if (mistake) {
    c.mistakes += 1;
    addMissed(st, mistake.step.concept);
    return { outcome: "mistake", stepId: mistake.step.id, missing: mistake.missing, feedbackKey: mistake.step.outOfOrderKey ?? null };
  }
  if (ignored) return { outcome: "prerequisite_missing", stepId: ignored.step.id, missing: ignored.missing };
  if (duplicate) {
    c.duplicates += 1;
    return { outcome: "duplicate" };
  }

  // 4. Non-critical mistake rules.
  for (const rule of m.mistakes) {
    if (!matches(rule.trigger, ev) || !ruleOk(rule.condition, st)) continue;
    // Advisory rules are contextual warnings only: no penalty.
    if (rule.kind === "advisory") return { outcome: "advisory", ruleId: rule.id, feedbackKey: rule.feedbackKey };
    let outcome: Outcome;
    if (rule.kind === "incorrect_decision") {
      c.mistakes += 1;
      c.incorrectDecisions += 1;
      outcome = "mistake";
    } else {
      c.invalidActions += 1;
      outcome = "invalid_action";
    }
    addMissed(st, rule.concept);
    return { outcome, ruleId: rule.id, feedbackKey: rule.feedbackKey };
  }
  return { outcome: "no_effect" };
}
