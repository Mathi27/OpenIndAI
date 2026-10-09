"""Server-side assessment. Scores are game scores only and are never a
professional competency certification."""
from __future__ import annotations

from typing import Any

from .content import MissionDef
from .engine import COMPLETED, FAILED, Context, EngineState, is_applicable

OUTCOME_MASTERY = "mastery"
OUTCOME_PASS = "pass"
OUTCOME_NEEDS_PRACTICE = "needs_practice"
OUTCOME_CRITICAL = "critical_error"
OUTCOME_NOT_PASSED = "not_passed"
OUTCOME_ABANDONED = "abandoned"
PASSING_OUTCOMES = {OUTCOME_MASTERY, OUTCOME_PASS}


def assess(mission: MissionDef, st: EngineState, ctx: Context, end_reason: str | None) -> dict[str, Any]:
    if st.state not in (COMPLETED, FAILED):
        raise ValueError("only completed or failed sessions can be assessed")
    sc = mission.scoring
    c = st.counters
    required = [s for s in mission.steps if not s.optional and is_applicable(s, st, ctx)]
    max_points = sum(s.points for s in required) or 1
    earned = sum(s.points for s in required if s.id in st.completed)
    base = round(100 * earned / max_points)
    penalties = {
        "mistakes": c.mistakes * sc.mistakePenalty,
        "invalidActions": c.invalidActions * sc.invalidActionPenalty,
        "hints": c.hints * sc.hintPenalty,
        "criticalErrors": c.criticalErrors * sc.criticalPenalty,
    }
    score = max(0, min(100, base - sum(penalties.values())))

    if end_reason == "abandoned":
        outcome = OUTCOME_ABANDONED
    elif st.state == FAILED:
        outcome = OUTCOME_NOT_PASSED
    elif c.criticalErrors > 0:
        # A critical safety error always prevents mastery, regardless of points.
        outcome = OUTCOME_CRITICAL
    elif score >= sc.masteryThreshold:
        outcome = OUTCOME_MASTERY
    elif score >= sc.passThreshold:
        outcome = OUTCOME_PASS
    else:
        outcome = OUTCOME_NEEDS_PRACTICE

    return {
        "score": score,
        "outcome": outcome,
        "basePoints": base,
        "penalties": penalties,
        "requiredSteps": len(required),
        "completedRequiredSteps": sum(1 for s in required if s.id in st.completed),
        "completedSteps": list(st.completed),
        "missedConcepts": list(st.missedConcepts),
        "counters": {
            "mistakes": c.mistakes,
            "invalidActions": c.invalidActions,
            "incorrectDecisions": c.incorrectDecisions,
            "criticalErrors": c.criticalErrors,
            "hints": c.hints,
            "inspections": c.inspections,
            "toolUses": c.toolUses,
            "checklistOpens": c.checklistOpens,
        },
        "criticalCounts": dict(st.criticalCounts),
        "certificationNotice": "game_score_not_certification",
    }
