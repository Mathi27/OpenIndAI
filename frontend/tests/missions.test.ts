// Cross-engine parity and content checks for EVERY mission in the catalogue.
// shared/test-vectors/generated.json is produced by the Python engine
// (tools/build_content.py); the TypeScript engine must reproduce it exactly.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { apply, newState, type EngineContext } from "../src/mission/engine";
import type { GameEvent, MissionDef } from "../src/mission/types";
import catalogue from "../../shared/catalogue.json";
import en from "../src/i18n/locales/en.json";
import ta from "../src/i18n/locales/ta.json";
import hi from "../src/i18n/locales/hi.json";
import mEn from "../src/i18n/locales/missions/en.json";
import mTa from "../src/i18n/locales/missions/ta.json";
import mHi from "../src/i18n/locales/missions/hi.json";
import { PROP_TYPES } from "../src/game/world/props";

const shared = join(__dirname, "../../shared");
const missions: Record<string, MissionDef> = Object.fromEntries(
  catalogue.missions.map((id) => [id, JSON.parse(readFileSync(join(shared, "missions", `${id}.json`), "utf8")) as MissionDef]),
);
const vectors = JSON.parse(readFileSync(join(shared, "test-vectors", "generated.json"), "utf8")) as {
  scenarios: { mission: string; name: string; pathway: "standard" | "pip"; events: GameEvent[]; results: Record<string, unknown>[]; final: Record<string, unknown> }[];
};
const questions = [
  ...JSON.parse(readFileSync(join(shared, "content", "questions.json"), "utf8")).questions,
  ...JSON.parse(readFileSync(join(shared, "content", "questions.generated.json"), "utf8")).questions,
] as { id: string; stemKey: string; options: { textKey: string }[]; explanationKey: string }[];

type Tree = { [k: string]: string | Tree };
const lookup = (obj: Tree, key: string): unknown => key.split(".").reduce<unknown>((o, p) => (o && typeof o === "object" ? (o as Tree)[p] : undefined), obj);
const merged: Record<string, Tree[]> = { en: [en as Tree, mEn as Tree], ta: [ta as Tree, mTa as Tree], hi: [hi as Tree, mHi as Tree] };
const has = (lang: string, key: string) => merged[lang].some((t) => typeof lookup(t, key) === "string" && (lookup(t, key) as string).trim().length > 0);

function keysOf(node: unknown, out = new Set<string>(), field = ""): Set<string> {
  if (typeof node === "string") {
    if ((/Key$|Keys$/.test(field) || /^\d+$/.test(field) || ["title", "text", "lines"].includes(field)) && /^(m|mission|story|world|tool|npc|chapter)\.[\w.-]+$/.test(node)) out.add(node);
  } else if (Array.isArray(node)) node.forEach((n) => keysOf(n, out, field));
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) if (k !== "authoring") keysOf(v, out, k);
  return out;
}

describe("TypeScript engine reproduces the Python engine on every mission", () => {
  for (const sc of vectors.scenarios) {
    it(`${sc.mission} · ${sc.name}`, () => {
      const m = missions[sc.mission];
      const st = newState();
      st.state = "BRIEFING";
      const ctx: EngineContext = { pathway: sc.pathway, hintBudget: 99 };
      sc.events.forEach((ev, i) => {
        const r = apply(m, st, { ...ev, target: ev.target ?? null, value: ev.value ?? null }, ctx) as unknown as Record<string, unknown>;
        const exp = sc.results[i];
        const got: Record<string, unknown> = {};
        for (const k of Object.keys(exp)) got[k] = r[k];
        expect(got, `event ${i} ${JSON.stringify(ev)}`).toEqual(exp);
      });
      expect(st.state).toBe(sc.final.state);
      expect(st.completed).toEqual(sc.final.completed);
      expect(st.flags).toEqual(sc.final.flags);
      expect(st.counters).toEqual(sc.final.counters);
    });
  }
});

describe("mission content resolves in en, ta and hi", () => {
  for (const [id, m] of Object.entries(missions)) {
    it(`${id}: every text key exists in all three languages`, () => {
      const keys = keysOf(m);
      keys.add(m.titleKey);
      for (const s of m.steps) if (!s.optional) keys.add(s.titleKey.replace(".step.", ".instruction."));
      for (const q of questions.filter((q) => m.mcq.questionIds.includes(q.id))) {
        keys.add(q.stemKey);
        keys.add(q.explanationKey);
        q.options.forEach((o) => keys.add(o.textKey));
      }
      for (const s of m.steps) keys.add(`concept.${s.concept}`);
      const missing = ["en", "ta", "hi"].flatMap((lang) => [...keys].filter((k) => !has(lang, k)).map((k) => `${lang}:${k}`));
      expect(missing).toEqual([]);
    });
    it(`${id}: world props are known types and every object has a prop`, () => {
      if (m.scene.id !== "complex") return;
      const props = m.scene.props ?? [];
      expect(props.map((p) => p.type).filter((t) => !PROP_TYPES.includes(t))).toEqual([]);
      const ids = new Set(props.map((p) => p.id).filter(Boolean));
      expect(m.interactables.map((i) => i.id).filter((i) => !ids.has(i))).toEqual([]);
    });
  }
});
