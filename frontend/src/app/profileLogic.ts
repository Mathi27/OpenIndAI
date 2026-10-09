// Pure helpers for the profile setup flow (unit-tested).
import type { Catalogue, CatalogueIndustry, Profile } from "../api/types";
import type { AssistanceProfile, Experience, MissionDef } from "../mission/types";

export interface Draft {
  industry: string | null;
  designation: string | null;
  experience: Experience | null;
  pathway: "standard" | "pip";
}

export function findIndustry(cat: Catalogue, id: string | null): CatalogueIndustry | undefined {
  return cat.industries.find((i) => i.id === id);
}

export function designationsFor(cat: Catalogue, industry: string | null): string[] {
  return findIndustry(cat, industry)?.designations.map((d) => d.id) ?? [];
}

/** Changing industry clears a designation that the new industry does not offer. */
export function selectIndustry(cat: Catalogue, draft: Draft, industry: string): { draft: Draft; designationReset: boolean } {
  if (!findIndustry(cat, industry)) throw new Error(`unknown industry ${industry}`);
  const keep = draft.designation !== null && designationsFor(cat, industry).includes(draft.designation);
  return {
    draft: { ...draft, industry, designation: keep ? draft.designation : null },
    designationReset: draft.designation !== null && !keep,
  };
}

export function selectDesignation(cat: Catalogue, draft: Draft, designation: string): Draft {
  if (!designationsFor(cat, draft.industry).includes(designation)) throw new Error("designation not valid for industry");
  return { ...draft, designation };
}

export function isComplete(d: Draft): boolean {
  return Boolean(d.industry && d.designation && d.experience);
}

export function draftFromProfile(p: Profile): Draft {
  return { industry: p.industry, designation: p.designation, experience: p.experience, pathway: p.pathway };
}

/** Next setup route for an incomplete profile, or null when complete. */
export function nextSetupRoute(p: Profile): string | null {
  if (!p.industry) return "/setup/industry";
  if (!p.designation) return "/setup/designation";
  if (!p.experience) return "/setup/experience";
  return null;
}

/**
 * Assistance only changes guidance. Critical safety rules come from the
 * mission definition and are never modified by experience or pathway.
 */
export function assistanceFor(m: MissionDef, experience: Experience): AssistanceProfile {
  return m.assistance[experience];
}

export function hintBudgetFor(m: MissionDef, experience: Experience): number {
  return m.hints.budget[experience];
}
