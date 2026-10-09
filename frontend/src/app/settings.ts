// Device-local preferences (audio, controls, graphics). Language is also
// mirrored to the server profile when signed in.
import type { Language } from "../mission/types";

export type Quality = "low" | "medium" | "high";

export interface Settings {
  language: Language;
  master: number;
  effects: number;
  ambient: number;
  narration: number;
  narrationEnabled: boolean;
  muted: boolean;
  captions: boolean;
  sensitivity: number;
  invertY: boolean;
  quality: Quality;
  showFps: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  language: "en",
  master: 0.8,
  effects: 0.8,
  ambient: 0.5,
  narration: 0.8,
  narrationEnabled: false,
  muted: false,
  captions: true,
  sensitivity: 1,
  invertY: false,
  quality: "high",
  showFps: false,
};

const KEY = "oi.settings.v1";
const listeners = new Set<(s: Settings) => void>();
let current: Settings = load();

function clamp01(n: unknown, d: number): number {
  return typeof n === "number" && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : d;
}

/** Validates untrusted stored data field-by-field, falling back to defaults. */
export function sanitize(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    language: r.language === "ta" || r.language === "hi" || r.language === "en" ? r.language : d.language,
    master: clamp01(r.master, d.master),
    effects: clamp01(r.effects, d.effects),
    ambient: clamp01(r.ambient, d.ambient),
    narration: clamp01(r.narration, d.narration),
    narrationEnabled: typeof r.narrationEnabled === "boolean" ? r.narrationEnabled : d.narrationEnabled,
    muted: typeof r.muted === "boolean" ? r.muted : d.muted,
    captions: typeof r.captions === "boolean" ? r.captions : d.captions,
    sensitivity: typeof r.sensitivity === "number" && r.sensitivity >= 0.2 && r.sensitivity <= 3 ? r.sensitivity : d.sensitivity,
    invertY: typeof r.invertY === "boolean" ? r.invertY : d.invertY,
    quality: r.quality === "low" || r.quality === "medium" || r.quality === "high" ? r.quality : d.quality,
    showFps: typeof r.showFps === "boolean" ? r.showFps : d.showFps,
  };
}

function load(): Settings {
  try {
    return sanitize(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  current = sanitize({ ...current, ...patch });
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage may be unavailable (private mode) */
  }
  listeners.forEach((fn) => fn(current));
  return current;
}

export function onSettingsChange(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
