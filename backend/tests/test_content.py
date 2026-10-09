from __future__ import annotations

import copy
import json

import pytest
from pydantic import ValidationError

from app.config import SHARED_DIR
from app.content import MissionDef, load_catalogue

RAW = json.loads((SHARED_DIR / "missions" / "og-hazrec-l1-silent-pump.json").read_text())


def test_catalogue_has_three_industries_and_six_roles_each():
    cat = load_catalogue(SHARED_DIR)
    assert [i.id for i in cat.industries] == ["oil_gas", "heavy_mfg", "construction"]
    assert all(len(i.designations) == 6 for i in cat.industries)
    assert [len(i.categories) for i in cat.industries] == [12, 10, 10]


def test_mission_valid():
    m = MissionDef.model_validate(RAW)
    assert m.level == 1 and m.ruleSet.status == "provisional"


def test_unknown_requirement_rejected():
    bad = copy.deepcopy(RAW)
    bad["steps"][1]["requires"] = ["nope"]
    with pytest.raises(ValidationError):
        MissionDef.model_validate(bad)


def test_cycle_rejected():
    bad = copy.deepcopy(RAW)
    bad["steps"][0]["requires"] = ["decision_no_go"]
    with pytest.raises(ValidationError, match="cyclic"):
        MissionDef.model_validate(bad)


def test_unknown_trigger_target_rejected():
    bad = copy.deepcopy(RAW)
    bad["steps"][2]["trigger"]["target"] = "ghost_object"
    with pytest.raises(ValidationError, match="unknown target"):
        MissionDef.model_validate(bad)


def test_step_limit():
    bad = copy.deepcopy(RAW)
    template = bad["steps"][1]
    bad["steps"] += [dict(template, id=f"extra_{i}", requires=[]) for i in range(20)]
    with pytest.raises(ValidationError, match="at most 20"):
        MissionDef.model_validate(bad)
