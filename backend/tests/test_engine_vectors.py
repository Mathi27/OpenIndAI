"""The Python engine must satisfy the shared vectors (the TS engine runs the same file)."""
from __future__ import annotations

import json

import pytest

from app import engine
from app.config import SHARED_DIR
from app.content import load_missions

VECTORS = json.loads((SHARED_DIR / "test-vectors" / "silent-pump.json").read_text())
MISSION = load_missions(SHARED_DIR)[VECTORS["mission"]][0]


@pytest.mark.parametrize("case", VECTORS["cases"], ids=[c["name"] for c in VECTORS["cases"]])
def test_vector(case):
    st = engine.EngineState()
    engine.start(st)
    ctx = engine.Context(**case["context"])
    seq = 0
    for ev in case["events"]:
        seq = ev.get("seq", seq + 1)
        event = {k: v for k, v in ev.items() if k in ("type", "target", "value")}
        event["seq"] = seq
        res = engine.apply(MISSION, st, event, ctx)
        assert res["outcome"] == ev["expect"], (ev, res)
        for key in ("reason", "missing", "ruleId", "steps"):
            if key in ev:
                assert res.get(key) == ev[key], (key, ev, res)
    final = case["final"]
    assert st.state == final["state"]
    if "completed" in final:
        assert st.completed == final["completed"]
    if "flags" in final:
        assert st.flags == final["flags"]
    for k, v in final.get("counters", {}).items():
        assert getattr(st.counters, k) == v, k


def test_illegal_transition_raises():
    st = engine.EngineState()
    with pytest.raises(engine.TransitionError):
        engine.assess(st)
    engine.start(st)
    with pytest.raises(engine.TransitionError):
        engine.start(st)


def test_abandon_terminal_rejected():
    st = engine.EngineState()
    engine.start(st)
    engine.abandon(st)
    with pytest.raises(engine.TransitionError):
        engine.abandon(st)
