"""Server-authoritative mission engine.

This module mirrors `frontend/src/mission/engine.ts`. Both implementations are
exercised against `shared/test-vectors/*.json` so they cannot drift silently.

The engine is a pure state machine: `apply(state, event)` returns a result and
mutates only the passed-in `EngineState`.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from .content import MissionDef, Step, Trigger

NOT_STARTED = "NOT_STARTED"
BRIEFING = "BRIEFING"
ACTIVE = "ACTIVE"
PAUSED = "PAUSED"
BLOCKED = "BLOCKED"
COMPLETED = "COMPLETED"
FAILED = "FAILED"
ASSESSED = "ASSESSED"
TERMINAL = {COMPLETED, FAILED, ASSESSED}

# Allowed state transitions. Anything else is a programming error.
TRANSITIONS: dict[str, set[str]] = {
    NOT_STARTED: {BRIEFING},
    BRIEFING: {ACTIVE, PAUSED, FAILED},
    ACTIVE: {PAUSED, BLOCKED, COMPLETED, FAILED},
    PAUSED: {ACTIVE, BLOCKED, BRIEFING, FAILED},
    BLOCKED: {ACTIVE, PAUSED, FAILED},
    COMPLETED: {ASSESSED},
    FAILED: {ASSESSED},
    ASSESSED: set(),
}


class TransitionError(RuntimeError):
    pass


@dataclass
class Counters:
    mistakes: int = 0
    invalidActions: int = 0
    incorrectDecisions: int = 0
    criticalErrors: int = 0
    hints: int = 0
    duplicates: int = 0
    inspections: int = 0
    toolUses: int = 0
    checklistOpens: int = 0
    rejected: int = 0


@dataclass
class EngineState:
    state: str = NOT_STARTED
    resumeState: str | None = None
    completed: list[str] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)
    criticalCounts: dict[str, int] = field(default_factory=dict)
    blockedBy: str | None = None
    lastSeq: int = 0
    counters: Counters = field(default_factory=Counters)
    missedConcepts: list[str] = field(default_factory=list)

    def to_json(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> "EngineState":
        data = dict(data)
        data["counters"] = Counters(**data.get("counters", {}))
        return cls(**data)


@dataclass
class Context:
    pathway: str = "standard"
    hintBudget: int = 99


def transition(st: EngineState, to: str) -> None:
    if to not in TRANSITIONS[st.state]:
        raise TransitionError(f"illegal transition {st.state} -> {to}")
    st.state = to


def _matches(trigger: Trigger, event: dict[str, Any]) -> bool:
    if trigger.type != event.get("type"):
        return False
    if trigger.target is not None and event.get("target") != trigger.target:
        return False
    if trigger.targets is not None and event.get("target") not in trigger.targets:
        return False
    if trigger.value is not None and event.get("value") != trigger.value:
        return False
    return True


def is_applicable(step: Step, st: EngineState, ctx: Context) -> bool:
    cond = step.condition
    if cond is None:
        return True
    if cond.flag is not None and cond.flag not in st.flags:
        return False
    if cond.pathway is not None and cond.pathway != ctx.pathway:
        return False
    return True


def _satisfied(mission: MissionDef, step_id: str, st: EngineState, ctx: Context) -> bool:
    if step_id in st.completed:
        return True
    step = next(s for s in mission.steps if s.id == step_id)
    return not is_applicable(step, st, ctx)


def missing_requirements(mission: MissionDef, step: Step, st: EngineState, ctx: Context) -> list[str]:
    return [r for r in step.requires if not _satisfied(mission, r, st, ctx)]


def remaining_required(mission: MissionDef, st: EngineState, ctx: Context) -> list[str]:
    return [
        s.id
        for s in mission.steps
        if not s.optional and is_applicable(s, st, ctx) and s.id not in st.completed
    ]


def current_step(mission: MissionDef, st: EngineState, ctx: Context) -> Step | None:
    """First required, applicable, incomplete step whose prerequisites are satisfied."""
    for s in mission.steps:
        if s.optional or s.id in st.completed or not is_applicable(s, st, ctx):
            continue
        if not missing_requirements(mission, s, st, ctx):
            return s
    return None


def _add_missed(st: EngineState, concept: str) -> None:
    if concept not in st.missedConcepts:
        st.missedConcepts.append(concept)


def start(st: EngineState) -> None:
    transition(st, BRIEFING)


def abandon(st: EngineState) -> None:
    if st.state in TERMINAL:
        raise TransitionError("session already terminal")
    if st.state == NOT_STARTED:
        raise TransitionError("session not started")
    transition(st, FAILED)


def assess(st: EngineState) -> None:
    transition(st, ASSESSED)


def apply(mission: MissionDef, st: EngineState, event: dict[str, Any], ctx: Context) -> dict[str, Any]:
    """Apply one event. Returns {"outcome": str, ...details}."""
    seq = event.get("seq")
    if not isinstance(seq, int) or seq <= st.lastSeq:
        return {"outcome": "rejected", "reason": "stale_seq"}
    st.lastSeq = seq
    etype = event.get("type")

    def reject(reason: str) -> dict[str, Any]:
        st.counters.rejected += 1
        return {"outcome": "rejected", "reason": reason}

    if st.state == NOT_STARTED:
        return reject("not_started")
    if st.state in TERMINAL:
        return reject("terminal")

    if etype == "paused":
        if st.state == PAUSED:
            return reject("already_paused")
        st.resumeState = st.state
        transition(st, PAUSED)
        return {"outcome": "paused"}
    if etype == "resumed":
        if st.state != PAUSED:
            return reject("not_paused")
        target = st.resumeState or ACTIVE
        st.resumeState = None
        transition(st, target)
        return {"outcome": "resumed"}
    if st.state == PAUSED:
        return reject("paused")

    if st.state == BRIEFING:
        if etype == "briefing_acknowledged":
            # The briefing can only be acknowledged once its own prerequisites (e.g. meeting the supervisor) are met.
            bstep = next((s for s in mission.steps if s.trigger.type == "briefing_acknowledged"), None)
            if bstep is not None:
                missing = missing_requirements(mission, bstep, st, ctx)
                if missing:
                    st.counters.rejected += 1
                    return {"outcome": "rejected", "reason": "briefing_prerequisites", "missing": missing}
            transition(st, ACTIVE)
            return _process_active(mission, st, event, ctx)
        if etype in mission.briefingPhase.allowedEvents:
            return _process_active(mission, st, event, ctx)
        return reject("briefing")

    if st.state == BLOCKED:
        if etype != "block_acknowledged":
            return reject("blocked")
        st.blockedBy = None
        transition(st, ACTIVE)
        result = _process_active(mission, st, event, ctx)
        if result["outcome"] == "no_effect":
            result = {"outcome": "unblocked"}
        return result

    # ACTIVE
    if etype == "briefing_acknowledged":
        return reject("briefing_done")
    if etype == "block_acknowledged":
        return reject("not_blocked")
    return _process_active(mission, st, event, ctx)


def _process_active(mission: MissionDef, st: EngineState, event: dict[str, Any], ctx: Context) -> dict[str, Any]:
    etype = event.get("type")
    target = event.get("target")
    c = st.counters

    if etype == "hint_requested":
        if c.hints >= ctx.hintBudget:
            c.rejected += 1
            return {"outcome": "rejected", "reason": "hint_budget"}
        c.hints += 1
        return {"outcome": "hint", "hintIndex": c.hints}
    if etype == "checklist_opened":
        c.checklistOpens += 1
    if etype == "tool_selected":
        return {"outcome": "no_effect"}
    if etype == "object_inspected":
        c.inspections += 1
    if etype == "tool_used":
        c.toolUses += 1

    # 1. Critical safety errors take precedence over everything else.
    for rule in mission.criticalErrors:
        if _matches(rule.trigger, event):
            st.criticalCounts[rule.id] = st.criticalCounts.get(rule.id, 0) + 1
            c.criticalErrors += 1
            _add_missed(st, rule.concept)
            if rule.setsFlag and rule.setsFlag not in st.flags:
                st.flags.append(rule.setsFlag)
            if rule.response == "fail" or c.criticalErrors >= mission.criticalPolicy.failAfterTotal:
                transition(st, FAILED)
                return {"outcome": "critical_fail", "ruleId": rule.id}
            st.blockedBy = rule.id
            transition(st, BLOCKED)
            return {"outcome": "critical_block", "ruleId": rule.id}

    # 2. Tool validity.
    if etype == "tool_used":
        tool = next((t for t in mission.tools if t.id == event.get("value")), None)
        if tool is None:
            c.rejected += 1
            return {"outcome": "rejected", "reason": "unknown_tool"}
        if tool.requiresTarget and not target:
            c.invalidActions += 1
            return {"outcome": "invalid_action", "reason": "tool_needs_target", "toolId": tool.id}
        if target and "*" not in tool.allowedTargets and target not in tool.allowedTargets:
            c.invalidActions += 1
            return {"outcome": "invalid_action", "reason": "tool_not_allowed", "toolId": tool.id}

    # 3. Steps.
    completed_now: list[str] = []
    mistake_missing: list[str] | None = None
    mistake_step: Step | None = None
    ignored_missing: list[str] | None = None
    ignored_step: Step | None = None
    duplicate = False
    for step in mission.steps:
        if not is_applicable(step, st, ctx) or not _matches(step.trigger, event):
            continue
        if step.id in st.completed:
            duplicate = True
            continue
        missing = missing_requirements(mission, step, st, ctx)
        if missing:
            if step.outOfOrder == "mistake" and mistake_missing is None:
                mistake_missing, mistake_step = missing, step
            elif ignored_missing is None:
                ignored_missing, ignored_step = missing, step
            continue
        st.completed.append(step.id)
        completed_now.append(step.id)

    if completed_now:
        result: dict[str, Any] = {"outcome": "step_completed", "steps": completed_now}
        if st.state == ACTIVE and not remaining_required(mission, st, ctx):
            transition(st, COMPLETED)
            result["missionCompleted"] = True
        return result
    if mistake_missing is not None and mistake_step is not None:
        c.mistakes += 1
        _add_missed(st, mistake_step.concept)
        return {"outcome": "mistake", "stepId": mistake_step.id, "missing": mistake_missing, "feedbackKey": mistake_step.outOfOrderKey}
    if ignored_missing is not None and ignored_step is not None:
        return {"outcome": "prerequisite_missing", "stepId": ignored_step.id, "missing": ignored_missing}
    if duplicate:
        c.duplicates += 1
        return {"outcome": "duplicate"}

    # 4. Non-critical mistake rules.
    for rule in mission.mistakes:
        if _matches(rule.trigger, event):
            if rule.kind == "advisory":
                # Contextual warning only: no penalty.
                return {"outcome": "advisory", "ruleId": rule.id, "feedbackKey": rule.feedbackKey}
            if rule.kind == "incorrect_decision":
                c.mistakes += 1
                c.incorrectDecisions += 1
                outcome = "mistake"
            else:
                c.invalidActions += 1
                outcome = "invalid_action"
            _add_missed(st, rule.concept)
            return {"outcome": outcome, "ruleId": rule.id, "feedbackKey": rule.feedbackKey}

    return {"outcome": "no_effect"}
