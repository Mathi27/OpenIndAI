import i18next from "i18next";
import en from "./locales/en.json";
import ta from "./locales/ta.json";
import hi from "./locales/hi.json";
import type { Language } from "../mission/types";

export const LANGUAGES: { id: Language; label: string }[] = [
  { id: "en", label: "English" },
  { id: "ta", label: "தமிழ்" },
  { id: "hi", label: "हिन्दी" },
];

const listeners = new Set<() => void>();

export function initI18n(lang: Language): void {
  void i18next.init({
    lng: lang,
    fallbackLng: "en",
    resources: { en: { translation: en }, ta: { translation: ta }, hi: { translation: hi } },
    interpolation: { escapeValue: false }, // all output goes through textContent
    initAsync: false,
    returnNull: false,
  });
  applyDocumentLang(lang);
}

function applyDocumentLang(lang: Language): void {
  document.documentElement.lang = lang;
  document.documentElement.dataset.lang = lang;
}

export function t(key: string, opts?: Record<string, unknown>): string {
  return i18next.t(key, opts as never) as unknown as string;
}

export function exists(key: string): boolean {
  return i18next.exists(key);
}

export function currentLanguage(): Language {
  return (i18next.language as Language) || "en";
}

export async function setLanguage(lang: Language): Promise<void> {
  if (lang === currentLanguage()) return;
  await i18next.changeLanguage(lang);
  applyDocumentLang(lang);
  listeners.forEach((fn) => fn());
}

export function onLanguageChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
