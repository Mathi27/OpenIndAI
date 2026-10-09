"""Typed schemas for the shared catalogue and mission definitions, with
cross-reference validation. Content lives in /shared so that the frontend and
backend read the exact same files."""
from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

EVENT_TYPES = (
    "briefing_acknowledged",
    "zone_entered",
    "object_inspected",
    "tool_selected",
    "tool_used",
    "checklist_opened",
    "evidence_flagged",
    "decision_made",
    "hint_requested",
    "block_acknowledged",
    "paused",
    "resumed",
)
EventType = Literal[
    "briefing_acknowledged",
    "zone_entered",
    "object_inspected",
    "tool_selected",
    "tool_used",
    "checklist_opened",
    "evidence_flagged",
    "decision_made",
    "hint_requested",
    "block_acknowledged",
    "paused",
    "resumed",
]
Experience = Literal["fresher", "mid", "senior"]
Pathway = Literal["standard", "pip"]
Language = Literal["en", "ta", "hi"]

MAX_STEPS = 20


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


# ---------------------------------------------------------------- catalogue
class DesignationDef(_Strict):
    id: str
    categories: list[str]


class IndustryDef(_Strict):
    id: str
    accent: str
    designations: list[DesignationDef]
    categories: list[str]


class LevelDef(_Strict):
    level: int = Field(ge=1, le=5)
    id: str


class Catalogue(_Strict):
    schemaVersion: int
    levels: list[LevelDef]
    experienceLevels: list[Experience]
    pathways: list[Pathway]
    languages: list[Language]
    industries: list[IndustryDef]
    missions: list[str]

    @model_validator(mode="after")
    def _check(self) -> "Catalogue":
        if [lv.level for lv in self.levels] != [1, 2, 3, 4, 5]:
            raise ValueError("catalogue must define exactly levels 1..5")
        seen: set[str] = set()
        for ind in self.industries:
            for d in ind.designations:
                if d.id in seen:
                    raise ValueError(f"duplicate designation {d.id}")
                seen.add(d.id)
                unknown = set(d.categories) - set(ind.categories)
                if unknown:
                    raise ValueError(f"designation {d.id} references unknown categories {unknown}")
        return self

    def industry(self, industry_id: str) -> IndustryDef | None:
        return next((i for i in self.industries if i.id == industry_id), None)

    def designation(self, industry_id: str, designation_id: str) -> DesignationDef | None:
        ind = self.industry(industry_id)
        if ind is None:
            return None
        return next((d for d in ind.designations if d.id == designation_id), None)


# ---------------------------------------------------------------- missions
class Trigger(_Strict):
    type: EventType
    target: str | None = None
    targets: list[str] | None = None
    value: str | None = None


class Condition(_Strict):
    flag: str | None = None
    pathway: Pathway | None = None


class Step(_Strict):
    id: str
    titleKey: str
    trigger: Trigger
    requires: list[str] = []
    condition: Condition | None = None
    optional: bool = False
    points: int = Field(ge=0, le=100)
    marker: str | None = None
    concept: str
    outOfOrder: Literal["ignore", "mistake"] = "ignore"
    outOfOrderKey: str | None = None
    hintKeys: list[str] = []


class CriticalError(_Strict):
    id: str
    trigger: Trigger
    response: Literal["block", "fail"]
    setsFlag: str | None = None
    concept: str
    explanationKey: str
    missingKey: str


class CriticalPolicy(_Strict):
    failAfterTotal: int = Field(ge=1)


class MistakeRule(_Strict):
    id: str
    trigger: Trigger
    kind: Literal["incorrect_decision", "invalid_action"]
    feedbackKey: str
    concept: str


class Interactable(_Strict):
    id: str
    nameKey: str
    type: str
    actions: list[str]
    maxDistance: float = Field(gt=0, le=10)
    promptKey: str
    detailKeys: list[str]


class Zone(_Strict):
    id: str
    nameKey: str
    minX: float
    maxX: float
    minZ: float
    maxZ: float


class Evidence(_Strict):
    id: str
    labelKey: str
    statusKey: str
    complete: bool


class Decision(_Strict):
    value: str
    labelKey: str


class Tool(_Strict):
    id: str
    nameKey: str
    descKey: str
    allowedTargets: list[str]
    requiresTarget: bool


class Hints(_Strict):
    budget: dict[Experience, int]
    penalty: int = Field(ge=0)


class AssistanceProfile(_Strict):
    objectiveDetail: Literal["full", "standard", "minimal"]
    worldMarkers: bool
    minimapMarkers: bool
    autoHintSeconds: int | None


class Scoring(_Strict):
    mistakePenalty: int = Field(ge=0)
    invalidActionPenalty: int = Field(ge=0)
    hintPenalty: int = Field(ge=0)
    criticalPenalty: int = Field(ge=0)
    masteryThreshold: int = Field(ge=0, le=100)
    passThreshold: int = Field(ge=0, le=100)


class Spawn(_Strict):
    x: float
    z: float
    heading: float


class SceneConfig(_Strict):
    id: str
    spawn: Spawn
    environmentIndicators: list[dict] = []


class RuleSet(_Strict):
    status: Literal["provisional", "expert_approved"]
    noticeKey: str


class Prerequisites(_Strict):
    missions: list[str] = []


class DebriefKeys(_Strict):
    success: str
    critical: str
    failed: str


class MissionDef(_Strict):
    schemaVersion: int
    id: str
    version: int = Field(ge=1)
    industry: str
    designations: list[str]
    category: str
    level: int = Field(ge=1, le=5)
    titleKey: str
    subtitleKey: str
    descriptionKey: str
    briefingKeys: list[str]
    learningObjectiveKeys: list[str]
    debriefKeys: DebriefKeys
    ruleSet: RuleSet
    safetyReferences: list[dict]
    safetyReferencesNoteKey: str | None = None
    prerequisites: Prerequisites
    scene: SceneConfig
    zones: list[Zone]
    interactables: list[Interactable]
    evidence: list[Evidence]
    decisions: list[Decision]
    tools: list[Tool]
    steps: list[Step]
    criticalErrors: list[CriticalError]
    criticalPolicy: CriticalPolicy
    mistakes: list[MistakeRule]
    hints: Hints
    assistance: dict[Experience, AssistanceProfile]
    scoring: Scoring

    @model_validator(mode="after")
    def _cross_refs(self) -> "MissionDef":
        step_ids = [s.id for s in self.steps]
        if len(step_ids) != len(set(step_ids)):
            raise ValueError("duplicate step ids")
        if len([s for s in self.steps if not s.optional]) > MAX_STEPS:
            raise ValueError(f"missions support at most {MAX_STEPS} required steps")
        for s in self.steps:
            missing = set(s.requires) - set(step_ids)
            if missing:
                raise ValueError(f"step {s.id} requires unknown steps {missing}")
            if s.id in s.requires:
                raise ValueError(f"step {s.id} requires itself")
        self._check_acyclic()
        refs = self.reference_ids()
        for t in [s.trigger for s in self.steps] + [c.trigger for c in self.criticalErrors] + [m.trigger for m in self.mistakes]:
            for tgt in ([t.target] if t.target else []) + (t.targets or []):
                if tgt not in refs:
                    raise ValueError(f"trigger references unknown target {tgt}")
        if not any(not s.optional for s in self.steps):
            raise ValueError("mission needs at least one required step")
        return self

    def _check_acyclic(self) -> None:
        graph = {s.id: s.requires for s in self.steps}
        visiting: set[str] = set()
        done: set[str] = set()

        def visit(n: str) -> None:
            if n in done:
                return
            if n in visiting:
                raise ValueError(f"cyclic step requirements at {n}")
            visiting.add(n)
            for m in graph[n]:
                visit(m)
            visiting.discard(n)
            done.add(n)

        for n in graph:
            visit(n)

    def reference_ids(self) -> set[str]:
        return (
            {z.id for z in self.zones}
            | {i.id for i in self.interactables}
            | {e.id for e in self.evidence}
        )


def _read_json(path: Path) -> tuple[dict, str]:
    raw = path.read_bytes()
    return json.loads(raw), hashlib.sha256(raw).hexdigest()


@lru_cache(maxsize=4)
def load_catalogue(shared_dir: Path) -> Catalogue:
    data, _ = _read_json(shared_dir / "catalogue.json")
    return Catalogue.model_validate(data)


@lru_cache(maxsize=4)
def load_missions(shared_dir: Path) -> dict[str, tuple[MissionDef, str, dict]]:
    """Returns mission_id -> (validated model, checksum, raw dict)."""
    catalogue = load_catalogue(shared_dir)
    out: dict[str, tuple[MissionDef, str, dict]] = {}
    for mission_id in catalogue.missions:
        data, checksum = _read_json(shared_dir / "missions" / f"{mission_id}.json")
        mission = MissionDef.model_validate(data)
        if mission.id != mission_id:
            raise ValueError(f"mission file {mission_id} declares id {mission.id}")
        industry = catalogue.industry(mission.industry)
        if industry is None or mission.category not in industry.categories:
            raise ValueError(f"mission {mission.id} has invalid industry/category")
        for d in mission.designations:
            if catalogue.designation(mission.industry, d) is None:
                raise ValueError(f"mission {mission.id} references unknown designation {d}")
        out[mission_id] = (mission, checksum, data)
    return out
