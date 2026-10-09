// Mission schema shared with backend/app/content.py (shared/missions/*.json).

export type EventType =
  | "world_entered"
  | "npc_interacted"
  | "briefing_acknowledged"
  | "zone_entered"
  | "object_inspected"
  | "tool_selected"
  | "tool_used"
  | "checklist_opened"
  | "evidence_flagged"
  | "decision_made"
  | "item_selected"
  | "hint_requested"
  | "block_acknowledged"
  | "paused"
  | "resumed";

export type Experience = "fresher" | "mid" | "senior";
export type Pathway = "standard" | "pip";
export type Language = "en" | "ta" | "hi";

export interface Trigger {
  type: EventType;
  target?: string | null;
  targets?: string[] | null;
  value?: string | null;
}

export interface Step {
  id: string;
  titleKey: string;
  trigger: Trigger;
  requires: string[];
  condition?: { flag?: string | null; pathway?: Pathway | null } | null;
  optional?: boolean;
  points: number;
  marker?: string | null;
  concept: string;
  outOfOrder: "ignore" | "mistake";
  outOfOrderKey?: string | null;
  scene?: string | null;
  hintKeys: string[];
}

/** Progress-dependent guard used by rules, talk rules and world events. */
export interface RuleCondition {
  completed?: string[];
  notCompleted?: string[];
  flag?: string | null;
}

export interface CriticalError {
  id: string;
  trigger: Trigger;
  response: "block" | "fail";
  setsFlag?: string | null;
  concept: string;
  explanationKey: string;
  missingKey: string;
  dialogue?: string | null;
  condition?: RuleCondition | null;
}

export interface MistakeRule {
  id: string;
  trigger: Trigger;
  kind: "incorrect_decision" | "invalid_action" | "advisory";
  feedbackKey: string;
  concept: string;
  condition?: RuleCondition | null;
}

export interface Interactable {
  id: string;
  nameKey: string;
  type: string;
  actions: string[];
  maxDistance: number;
  promptKey: string;
  detailKeys: string[];
  panel?: "inspect" | "station" | "document" | "inventory" | "comms" | "route";
  groups?: string[];
  hiddenUntil?: string | null;
  docKind?: "permit" | "record" | "plan" | "notice" | "log" | null;
}

export interface Evidence { id: string; labelKey: string; statusKey: string; complete: boolean; doc?: string | null }
export interface InventoryItem { id: string; nameKey: string; icon: string; detailKey: string; at: string; defect?: boolean }
export interface DecisionGroup { id: string; promptKey: string; ui: "choice" | "comms" | "route" }
export interface Decision { value: string; labelKey: string; group?: string | null; descKey?: string | null; route?: [number, number][] | null }
export interface Prop { id?: string | null; type: string; x: number; z: number; heading?: number; state?: string | null; params?: Record<string, unknown> }
export interface WorldAction { type: "prop_state" | "dialogue" | "banner" | "sound" | "details"; [k: string]: unknown }
export interface WorldEvent { id: string; when: RuleCondition; delay?: number; actions: WorldAction[] }

export interface Zone {
  id: string;
  nameKey: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Tool {
  id: string;
  nameKey: string;
  descKey: string;
  allowedTargets: string[];
  requiresTarget: boolean;
}

export interface AssistanceProfile {
  objectiveDetail: "full" | "standard" | "minimal";
  worldMarkers: boolean;
  minimapMarkers: boolean;
  autoHintSeconds: number | null;
}

export interface EnvironmentIndicatorDef {
  id: string;
  labelKey: string;
  unit: string;
  // Simulated values are scripted by the scenario; nothing is ever "live".
  simulated: { at: number; value: number }[];
  warnAbove?: number;
  warnBelow?: number;
}

export interface TalkRule { when?: RuleCondition | null; dialogue: string }
export interface Npc { id: string; nameKey: string; roleKey: string; portrait: string; x: number; z: number; heading: number; maxDistance: number; talk?: TalkRule[]; hiddenUntil?: string | null }
export type Mood = "friendly" | "neutral" | "serious" | "concerned" | "pleased";
export interface DialogueChoice { labelKey: string; group: string; value: string; next?: string | null }
export interface DialogueLine { speaker: string; textKey: string; mood: Mood; choices?: DialogueChoice[] }
export interface DebriefRule { when: { criticalRule?: string | null; stepCompleted?: string | null; counterAbove?: [string, number] | null }; textKey: string }
export interface Variant { id: string; labelKey: string; overrides: { interactables: Record<string, { detailKeys?: string[] | null }>; evidence: Record<string, { statusKey?: string | null }> } }

export interface MissionDef {
  schemaVersion: number;
  id: string;
  version: number;
  industry: string;
  department: string;
  designations: string[];
  roleTitleKey: string;
  designedFor: Experience[];
  category: string;
  level: number;
  estimatedMinutes: number;
  activeVariant?: string;
  titleKey: string;
  subtitleKey: string;
  descriptionKey: string;
  briefingKeys: string[];
  assignmentKeys: Record<string, string>;
  learningObjectiveKeys: string[];
  debriefKeys: { success: string; critical: string; failed: string };
  ruleSet: { status: "provisional" | "expert_approved"; noticeKey: string };
  contentReview: { status: string; translationStatus: string; lastModified: string };
  referenceIds: string[];
  safetyReferences: unknown[];
  safetyReferencesNoteKey?: string | null;
  prerequisites: { missions: string[] };
  scene: {
    id: "petrochem" | "complex" | "factory" | "construction";
    spawn: { x: number; z: number; heading: number };
    cinematic?: { dayKey: string; locationKey: string; titleKey: string } | null;
    restrictedZones: string[];
    environmentIndicators: EnvironmentIndicatorDef[];
    site?: string | null;
    time?: "day" | "dusk" | "night" | "overcast";
    workPoint?: { x: number; z: number; heading: number } | null;
    briefingNpc?: string | null;
    props?: Prop[];
  };
  briefingPhase: { allowedEvents: EventType[] };
  zones: Zone[];
  npcs: Npc[];
  dialogues: Record<string, DialogueLine[]>;
  consequencePanels: Record<string, { titleKey: string; panelKeys: string[]; art?: string[] }>;
  debriefRules: DebriefRule[];
  interactables: Interactable[];
  evidence: Evidence[];
  decisions: Decision[];
  decisionGroups?: DecisionGroup[];
  inventory?: InventoryItem[];
  worldEvents?: WorldEvent[];
  report?: { evidenceSteps: string[]; decisionSteps: string[] } | null;
  tools: Tool[];
  steps: Step[];
  criticalErrors: CriticalError[];
  criticalPolicy: { failAfterTotal: number };
  mistakes: MistakeRule[];
  variants: Variant[];
  variantPolicy: { rule: string; order: string[] };
  mcq: { questionIds: string[]; passFraction: number };
  hints: { budget: Record<Experience, number>; penalty: number };
  assistance: Record<Experience, AssistanceProfile>;
  scoring: Record<string, number>;
}

export interface GameEvent {
  seq: number;
  type: EventType;
  target?: string | null;
  value?: string | null;
}
