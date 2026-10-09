import { describe, expect, it } from "vitest";
import en from "../src/i18n/locales/en.json";
import ta from "../src/i18n/locales/ta.json";
import hi from "../src/i18n/locales/hi.json";
import mission from "../../shared/missions/og-hazrec-l1-silent-pump.json";
import questions from "../../shared/content/questions.json";
import catalogue from "../../shared/catalogue.json";

type Tree = { [k: string]: string | Tree };

function leaves(obj: Tree, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) => (typeof v === "string" ? [`${prefix}${k}`] : leaves(v, `${prefix}${k}.`)));
}

function lookup(obj: Tree, key: string): unknown {
  return key.split(".").reduce<unknown>((o, p) => (o && typeof o === "object" ? (o as Tree)[p] : undefined), obj);
}

/** Collect every translation key referenced by content (fields named *Key / *Keys and hint arrays). */
function contentKeys(node: unknown, out = new Set<string>(), field = ""): Set<string> {
  if (typeof node === "string") {
    if (/Key$|Keys$/.test(field) || field === "hintKeys" || /^\d+$/.test(field)) {
      if (/^[a-zA-Z]+(\.[\w-]+)+$/.test(node) && !node.startsWith("REF-")) out.add(node);
    }
  } else if (Array.isArray(node)) {
    node.forEach((n) => contentKeys(n, out, field));
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) if (k !== "authoring") contentKeys(v, out, k);
  }
  return out;
}

const locales = { en, ta, hi } as Record<string, Tree>;

describe("locale dictionaries", () => {
  const enKeys = leaves(en as Tree);
  for (const lang of ["ta", "hi"]) {
    it(`${lang} has every English key`, () => {
      const have = new Set(leaves(locales[lang]));
      expect(enKeys.filter((k) => !have.has(k))).toEqual([]);
    });
    it(`${lang} has no stray keys`, () => {
      const base = new Set(enKeys);
      expect(leaves(locales[lang]).filter((k) => !base.has(k))).toEqual([]);
    });
  }
  it("interpolation placeholders match across languages", () => {
    const bad: string[] = [];
    for (const k of enKeys) {
      const vars = (s: unknown) => (String(s).match(/{{\w+}}/g) ?? []).sort().join(",");
      for (const lang of ["ta", "hi"]) if (vars(lookup(en as Tree, k)) !== vars(lookup(locales[lang], k))) bad.push(`${lang}:${k}`);
    }
    expect(bad).toEqual([]);
  });
});

describe("content keys resolve in all languages", () => {
  const keys = [...contentKeys(mission), ...contentKeys(questions)];
  for (const ind of catalogue.industries) {
    keys.push(`industry.${ind.id}.name`);
    ind.designations.forEach((d) => keys.push(`designation.${d.id}`));
    ind.categories.forEach((c) => keys.push(`category.${c}`));
  }
  for (const s of mission.steps) {
    if (!s.optional) keys.push(s.titleKey.replace(".step.", ".instruction."));
    keys.push(`concept.${s.concept}`);
    if (s.scene) keys.push(`scene.${s.scene}`);
  }
  for (const lang of ["en", "ta", "hi"]) {
    it(`${lang}: all referenced keys exist and are strings`, () => {
      const missing = [...new Set(keys)].filter((k) => typeof lookup(locales[lang], k) !== "string");
      expect(missing).toEqual([]);
    });
  }
});

describe("UI keys used in source exist", () => {
  // Node's fs is available in Vitest; scan for literal t("…") / tx("…") calls.
  it("every literal key resolves in en, ta and hi", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".ts")) files.push(p);
      }
    };
    walk(join(__dirname, "../src"));
    const keys = new Set<string>();
    for (const f of files) {
      for (const m of readFileSync(f, "utf8").matchAll(/\bt[x]?\(\s*"([a-zA-Z]+(?:\.[\w-]+)+)"/g)) keys.add(m[1]);
    }
    expect(keys.size).toBeGreaterThan(150);
    const missing: string[] = [];
    for (const lang of ["en", "ta", "hi"]) for (const k of keys) if (typeof lookup(locales[lang], k) !== "string") missing.push(`${lang}:${k}`);
    expect(missing).toEqual([]);
  });
});
