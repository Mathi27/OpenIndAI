// Mission schema shared with backend/app/content.py (shared/missions/*.json).

export type EventType =
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
}

export interface MistakeRule {
  id: string;
  trigger: Trigger;
  kind: "incorrect_decision" | "invalid_action";
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

export interface MissionDef {
  schemaVersion: number;
  id: string;
  version: number;
  industry: string;
  designations: string[];
  category: string;
  level: number;
  titleKey: string;
  subtitleKey: string;
  descriptionKey: string;
  briefingKeys: string[];
  learningObjectiveKeys: string[];
  debriefKeys: { success: string; critical: string; failed: string };
  ruleSet: { status: "provisional" | "expert_approved"; noticeKey: string };
  safetyReferences: unknown[];
  safetyReferencesNoteKey?: string | null;
  prerequisites: { missions: string[] };
  scene: { id: string; spawn: { x: number; z: number; heading: number }; environmentIndicators: EnvironmentIndicatorDef[] };
  zones: Zone[];
  interactables: Interactable[];
  evidence: { id: string; labelKey: string; statusKey: string; complete: boolean }[];
  decisions: { value: string; labelKey: string }[];
  tools: Tool[];
  steps: Step[];
  criticalErrors: CriticalError[];
  criticalPolicy: { failAfterTotal: number };
  mistakes: MistakeRule[];
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
