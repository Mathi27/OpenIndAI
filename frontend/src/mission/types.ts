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

export interface CriticalError {
  id: string;
  trigger: Trigger;
  response: "block" | "fail";
  setsFlag?: string | null;
  concept: string;
  explanationKey: string;
  missingKey: string;
  dialogue?: string | null;
}

export interface MistakeRule {
  id: string;
  trigger: Trigger;
  kind: "incorrect_decision" | "invalid_action" | "advisory";
  feedbackKey: string;
  concept: string;
}

export interface Interactable {
  id: string;
  nameKey: string;
  type: string;
  actions: string[];
  maxDistance: number;
  promptKey: string;
  detailKeys: string[];
}

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

export interface Npc { id: string; nameKey: string; roleKey: string; portrait: string; x: number; z: number; heading: number; maxDistance: number }
export type Mood = "friendly" | "neutral" | "serious" | "concerned" | "pleased";
export interface DialogueLine { speaker: string; textKey: string; mood: Mood }
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
    id: "petrochem" | "factory" | "construction";
    spawn: { x: number; z: number; heading: number };
    cinematic?: { dayKey: string; locationKey: string; titleKey: string } | null;
    restrictedZones: string[];
    environmentIndicators: EnvironmentIndicatorDef[];
  };
  briefingPhase: { allowedEvents: EventType[] };
  zones: Zone[];
  npcs: Npc[];
  dialogues: Record<string, DialogueLine[]>;
  consequencePanels: Record<string, { titleKey: string; panelKeys: string[] }>;
  debriefRules: DebriefRule[];
  interactables: Interactable[];
  evidence: { id: string; labelKey: string; statusKey: string; complete: boolean }[];
  decisions: { value: string; labelKey: string }[];
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
