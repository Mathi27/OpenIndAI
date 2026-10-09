import type { Experience, Language, Pathway } from "../mission/types";
import type { EngineState } from "../mission/engine";

export interface User { id: number; username: string; role: "trainee" | "admin"; displayName: string; isDevAccount: boolean }
export interface Profile { industry: string | null; designation: string | null; experience: Experience | null; pathway: Pathway; language: Language; complete: boolean }
export interface Me { user: User; profile: Profile }

export interface CatalogueDesignation { id: string; categories: string[] }
export interface CatalogueIndustry { id: string; accent: string; designations: CatalogueDesignation[]; categories: string[] }
export interface Catalogue { schemaVersion: number; levels: { level: number; id: string }[]; experienceLevels: Experience[]; pathways: Pathway[]; languages: Language[]; industries: CatalogueIndustry[] }

export type LevelStatus = "available" | "locked" | "upcoming";
export interface LevelEntry {
  level: number; status: LevelStatus; missionId: string | null; reason?: string | null; lockedByProgress?: boolean;
  titleKey?: string; subtitleKey?: string; attempts?: number; bestScore?: number | null; bestOutcome?: string | null; passed?: boolean;
}
export interface MissionGrid { industry: string; designation: string; categories: { category: string; levels: LevelEntry[] }[] }

export interface SessionResult {
  score: number; outcome: string; basePoints: number; penalties: Record<string, number>;
  requiredSteps: number; completedRequiredSteps: number; completedSteps: string[]; missedConcepts: string[];
  counters: Record<string, number>; criticalCounts: Record<string, number>;
  missionId: string; retryCount: number; finalState: string; endReason: string; totalMs: number; activeMs: number;
  startedAt: number; completedAt: number; experience: Experience; pathway: Pathway;
}

export interface SessionInfo {
  id: string; missionId: string; missionVersion: number; state: string; experience: Experience; pathway: Pathway;
  retryCount: number; startedAt: number; endedAt: number | null; endReason: string | null; lastSeq: number;
  hintBudget: number; engine: EngineState; focusConcepts: string[]; result: SessionResult | null;
}

export interface EventResult { seq: number; accepted: boolean; outcome: string; detail: Record<string, unknown> }
export interface EventsResponse { results: EventResult[]; session: SessionInfo }
export interface StoredEvent { seq: number; type: string; target: string | null; value: string | null; accepted: number; outcome: string }
