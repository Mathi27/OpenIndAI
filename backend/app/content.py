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
    "world_entered",
    "npc_interacted",
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
    "world_entered",
    "npc_interacted",
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
    scene: str | None = None
    hintKeys: list[str] = []


class CriticalError(_Strict):
    id: str
    trigger: Trigger
    response: Literal["block", "fail"]
    setsFlag: str | None = None
    concept: str
    explanationKey: str
    missingKey: str
    dialogue: str | None = None


class CriticalPolicy(_Strict):
    failAfterTotal: int = Field(ge=1)


class MistakeRule(_Strict):
    id: str
    trigger: Trigger
    kind: Literal["incorrect_decision", "invalid_action", "advisory"]
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


class Cinematic(_Strict):
    dayKey: str
    locationKey: str
    titleKey: str


class SceneConfig(_Strict):
    id: Literal["petrochem", "factory", "construction"]
    spawn: Spawn
    cinematic: Cinematic | None = None
    restrictedZones: list[str] = []
    environmentIndicators: list[dict] = []


class BriefingPhase(_Strict):
    allowedEvents: list[EventType] = []


class Npc(_Strict):
    id: str
    nameKey: str
    roleKey: str
    portrait: str
    x: float
    z: float
    heading: float
    maxDistance: float = Field(gt=0, le=10)


class DialogueLine(_Strict):
    speaker: str
    textKey: str
    mood: Literal["friendly", "neutral", "serious", "concerned", "pleased"]


class ComicPanel(_Strict):
    titleKey: str
    panelKeys: list[str] = Field(min_length=1)


class DebriefCondition(_Strict):
    criticalRule: str | None = None
    stepCompleted: str | None = None
    counterAbove: tuple[str, int] | None = None


class DebriefRule(_Strict):
    when: DebriefCondition
    textKey: str


class InteractableOverride(_Strict):
    detailKeys: list[str] | None = None


class EvidenceOverride(_Strict):
    statusKey: str | None = None


class VariantOverrides(_Strict):
    interactables: dict[str, InteractableOverride] = {}
    evidence: dict[str, EvidenceOverride] = {}


class Variant(_Strict):
    id: str = Field(pattern=r"^[A-Z]$")
    labelKey: str
    overrides: VariantOverrides


class VariantPolicy(_Strict):
    rule: Literal["rotate_by_attempt"]
    order: list[str]


class McqConfig(_Strict):
    questionIds: list[str] = Field(min_length=1)
    passFraction: float = Field(gt=0, le=1)


class ContentReview(_Strict):
    status: Literal["draft_unreviewed", "sme_reviewed", "sme_approved"]
    translationStatus: Literal["demonstration_only", "reviewed"]
    lastModified: str


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
    department: str
    designations: list[str]
    roleTitleKey: str
    designedFor: list[Experience]
    category: str
    level: int = Field(ge=1, le=5)
    estimatedMinutes: int = Field(ge=1, le=120)
    titleKey: str
    subtitleKey: str
    descriptionKey: str
    briefingKeys: list[str]
    assignmentKeys: dict[str, str]
    learningObjectiveKeys: list[str]
    debriefKeys: DebriefKeys
    ruleSet: RuleSet
    contentReview: ContentReview
    referenceIds: list[str]
    safetyReferences: list[dict]
    safetyReferencesNoteKey: str | None = None
    prerequisites: Prerequisites
    scene: SceneConfig
    briefingPhase: BriefingPhase
    zones: list[Zone]
    npcs: list[Npc]
    dialogues: dict[str, list[DialogueLine]]
    consequencePanels: dict[str, ComicPanel]
    debriefRules: list[DebriefRule]
    interactables: list[Interactable]
    evidence: list[Evidence]
    decisions: list[Decision]
    tools: list[Tool]
    steps: list[Step]
    criticalErrors: list[CriticalError]
    criticalPolicy: CriticalPolicy
    mistakes: list[MistakeRule]
    variants: list[Variant] = Field(min_length=1)
    variantPolicy: VariantPolicy
    mcq: McqConfig
    hints: Hints
    assistance: dict[Experience, AssistanceProfile]
    scoring: Scoring
    authoring: dict

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
        npc_ids = {n.id for n in self.npcs}
        for name, lines in self.dialogues.items():
            if not lines:
                raise ValueError(f"dialogue {name} is empty")
            for ln in lines:
                if ln.speaker not in npc_ids:
                    raise ValueError(f"dialogue {name} uses unknown speaker {ln.speaker}")
        for c in self.criticalErrors:
            if c.dialogue and c.dialogue not in self.dialogues:
                raise ValueError(f"critical error {c.id} references unknown dialogue {c.dialogue}")
        for z in self.scene.restrictedZones:
            if z not in {zz.id for zz in self.zones}:
                raise ValueError(f"unknown restricted zone {z}")
        step_set = set(step_ids)
        crit_ids = {c.id for c in self.criticalErrors}
        for r in self.debriefRules:
            w = r.when
            if w.criticalRule and w.criticalRule not in crit_ids:
                raise ValueError(f"debrief rule references unknown critical rule {w.criticalRule}")
            if w.stepCompleted and w.stepCompleted not in step_set:
                raise ValueError(f"debrief rule references unknown step {w.stepCompleted}")
        variant_ids = [v.id for v in self.variants]
        if len(set(variant_ids)) != len(variant_ids):
            raise ValueError("duplicate variant ids")
        if sorted(self.variantPolicy.order) != sorted(variant_ids):
            raise ValueError("variantPolicy.order must list every variant exactly once")
        inter_ids = {i.id for i in self.interactables}
        ev_ids = {e.id for e in self.evidence}
        for v in self.variants:
            if set(v.overrides.interactables) - inter_ids:
                raise ValueError(f"variant {v.id} overrides unknown interactables")
            if set(v.overrides.evidence) - ev_ids:
                raise ValueError(f"variant {v.id} overrides unknown evidence")
        # The decision step's correct value and the critical decisions must be declared decisions.
        decision_values = {d.value for d in self.decisions}
        for t in [s.trigger for s in self.steps] + [c.trigger for c in self.criticalErrors]:
            if t.type == "decision_made" and t.value not in decision_values:
                raise ValueError(f"decision value {t.value} is not declared")
        # Every incomplete evidence item must be the target of a step (otherwise it can never be identified).
        flag_targets = {s.trigger.target for s in self.steps if s.trigger.type == "evidence_flagged"}
        for e in self.evidence:
            if not e.complete and e.id not in flag_targets:
                raise ValueError(f"incomplete evidence {e.id} has no identifying step")
            if e.complete and e.id in flag_targets:
                raise ValueError(f"evidence {e.id} is complete but rewarded when flagged")
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
            {n.id for n in self.npcs}
            | {z.id for z in self.zones}
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
        validate_mission_links(mission, shared_dir)
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


# ---------------------------------------------------------------- question bank & references
class McqOption(_Strict):
    id: str
    textKey: str


class Question(_Strict):
    id: str
    version: int
    missionIds: list[str]
    concept: str
    stemKey: str
    options: list[McqOption] = Field(min_length=2)
    correct: str
    explanationKey: str
    referenceIds: list[str]
    reviewStatus: Literal["draft_unreviewed", "sme_reviewed", "sme_approved"]

    @model_validator(mode="after")
    def _check(self) -> "Question":
        ids = [o.id for o in self.options]
        if len(set(ids)) != len(ids):
            raise ValueError(f"question {self.id} has duplicate options")
        if self.correct not in ids:
            raise ValueError(f"question {self.id} correct answer is not an option")
        return self


class QuestionBank(_Strict):
    schemaVersion: int
    reviewStatus: str
    note: str
    questions: list[Question]


class Reference(_Strict):
    id: str
    organization: str
    title: str
    version: str | None
    topic: str
    clause: str | None
    trainingInterpretation: str
    verificationStatus: str
    smeApproval: Literal["not_approved", "approved"]
    industries: list[str]


class ReferenceRegistry(_Strict):
    schemaVersion: int
    note: str
    references: list[Reference]


@lru_cache(maxsize=4)
def load_questions(shared_dir: Path) -> dict[str, Question]:
    bank = QuestionBank.model_validate(_read_json(shared_dir / "content" / "questions.json")[0])
    return {q.id: q for q in bank.questions}


@lru_cache(maxsize=4)
def load_references(shared_dir: Path) -> dict[str, Reference]:
    reg = ReferenceRegistry.model_validate(_read_json(shared_dir / "content" / "references.json")[0])
    for r in reg.references:
        # Never allow an unverified reference to carry a clause number.
        if r.clause is not None and r.verificationStatus.startswith("UNVERIFIED"):
            raise ValueError(f"reference {r.id} cites a clause while unverified")
    return {r.id: r for r in reg.references}


def validate_mission_links(mission: MissionDef, shared_dir: Path) -> None:
    questions = load_questions(shared_dir)
    refs = load_references(shared_dir)
    concepts = {s.concept for s in mission.steps} | {c.concept for c in mission.criticalErrors}
    for qid in mission.mcq.questionIds:
        q = questions.get(qid)
        if q is None:
            raise ValueError(f"mission {mission.id} uses unknown question {qid}")
        if mission.id not in q.missionIds:
            raise ValueError(f"question {qid} is not linked to mission {mission.id}")
        if q.concept not in concepts:
            raise ValueError(f"question {qid} tests concept {q.concept} not covered by mission {mission.id}")
        for r in q.referenceIds:
            if r not in refs:
                raise ValueError(f"question {qid} uses unknown reference {r}")
    for r in mission.referenceIds:
        if r not in refs:
            raise ValueError(f"mission {mission.id} uses unknown reference {r}")


def apply_variant(raw: dict, variant_id: str) -> dict:
    """Return the effective mission definition dict for a scenario variant."""
    import copy

    out = copy.deepcopy(raw)
    variant = next((v for v in out["variants"] if v["id"] == variant_id), None)
    if variant is None:
        raise ValueError(f"unknown variant {variant_id}")
    ov = variant["overrides"]
    for item in out["interactables"]:
        patch = ov.get("interactables", {}).get(item["id"])
        if patch and patch.get("detailKeys"):
            item["detailKeys"] = patch["detailKeys"]
    for ev in out["evidence"]:
        patch = ov.get("evidence", {}).get(ev["id"])
        if patch and patch.get("statusKey"):
            ev["statusKey"] = patch["statusKey"]
    out["activeVariant"] = variant_id
    return out
