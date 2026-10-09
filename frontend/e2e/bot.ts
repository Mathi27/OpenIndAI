// Generic mission bot for end-to-end tests. It plays any mission through the
// real game UI: it reads the current objective from the running engine and
// performs the matching player action (walk to/face an object and press E,
// talk to an NPC, click a document field, choose a PPE item, make a decision).
// Teleporting stands in for walking; reachability is checked separately with a
// walkability search over the world's collision map.
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { apply, currentStep, newState } from "../src/mission/engine";
import type { GameEvent, MissionDef, Step } from "../src/mission/types";

const SHARED = join(dirname(fileURLToPath(import.meta.url)), "../../shared");
export const CATALOGUE = JSON.parse(readFileSync(join(SHARED, "catalogue.json"), "utf8")) as { missions: string[] };
const QUESTIONS = [
  ...JSON.parse(readFileSync(join(SHARED, "content", "questions.json"), "utf8")).questions,
  ...JSON.parse(readFileSync(join(SHARED, "content", "questions.generated.json"), "utf8")).questions,
] as { id: string; correct: string }[];

export function loadMission(id: string): MissionDef {
  return JSON.parse(readFileSync(join(SHARED, "missions", `${id}.json`), "utf8")) as MissionDef;
}

export function correctAnswers(m: MissionDef): Record<string, string> {
  return Object.fromEntries(m.mcq.questionIds.map((q) => [q, QUESTIONS.find((x) => x.id === q)!.correct]));
}

const H = { "x-oi-client": "web" };

/** Solve a mission with the TypeScript engine (used to pass prerequisite levels through the API). */
export function solveEvents(m: MissionDef): GameEvent[] {
  const st = newState();
  st.state = "BRIEFING";
  const ctx = { pathway: "standard" as const, hintBudget: 99 };
  const out: GameEvent[] = [];
  for (let i = 0; i < 200; i++) {
    const cur = currentStep(m, st, ctx);
    if (!cur) break;
    const t = cur.trigger;
    const ev: GameEvent = { seq: out.length + 1, type: t.type, target: t.target ?? t.targets?.[0] ?? null, value: t.value ?? null };
    const r = apply(m, st, ev, ctx);
    if (r.outcome !== "step_completed") throw new Error(`${m.id}: ${cur.id} → ${r.outcome}`);
    out.push(ev);
  }
  return out;
}

export async function apiRegister(req: APIRequestContext, username: string): Promise<void> {
  const r = await req.post("/api/auth/register", { headers: H, data: { username, password: "Password123", display_name: `E2E ${username}` } });
  expect(r.status(), await r.text()).toBe(201);
  const p = await req.put("/api/profile", { headers: H, data: { industry: "oil_gas", designation: "og_mech_maint", experience: "fresher", pathway: "standard" } });
  expect(p.status(), await p.text()).toBe(200);
}

/** Pass a mission through the HTTP API (real server validation, scoring and MCQ). */
export async function apiPass(req: APIRequestContext, missionId: string): Promise<void> {
  const s = await req.post("/api/sessions", { headers: H, data: { missionId, abandonOpen: true } });
  expect(s.status(), await s.text()).toBe(201);
  const sid = (await s.json()).id as string;
  const eff = (await (await req.get(`/api/sessions/${sid}/mission`, { headers: H })).json()) as MissionDef;
  const events = solveEvents(eff);
  const r = await req.post(`/api/sessions/${sid}/events`, { headers: H, data: { events } });
  expect(r.status(), await r.text()).toBe(200);
  const mcq = await req.post(`/api/sessions/${sid}/mcq`, { headers: H, data: { answers: correctAnswers(eff) } });
  expect(mcq.status(), await mcq.text()).toBe(200);
  expect((await mcq.json()).learning.criteriaMet).toBe(true);
}

// ---------------------------------------------------------------- in-game helpers
type Oi = Record<string, (...a: unknown[]) => unknown>;
const oi = (page: Page, fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => ((window as unknown as { __oi: Oi }).__oi[f as string] as (...x: unknown[]) => unknown)(...(a as unknown[])), [fn, args] as const);

export async function state(page: Page): Promise<{ state: string; completed: string[]; counters: Record<string, number> }> {
  return (await oi(page, "state")) as never;
}

async function standFor(page: Page, m: MissionDef, id: string): Promise<{ x: number; z: number }> {
  const npc = m.npcs.find((n) => n.id === id);
  if (npc) {
    const hd = (npc.heading * Math.PI) / 180;
    return { x: npc.x + Math.sin(hd) * 2, z: npc.z + Math.cos(hd) * 2 };
  }
  const st = (await oi(page, "stand", id)) as { x: number; z: number } | null;
  expect(st, `stand point for ${id}`).not.toBeNull();
  return st!;
}

export async function face(page: Page, m: MissionDef, id: string): Promise<void> {
  const p = await standFor(page, m, id);
  for (let attempt = 0; ; attempt++) {
    // A scripted scenario change may open a conversation at any moment; finish it first.
    if (await page.locator(".dlg-root:not(.out)").count()) await runDialogue(page);
    await oi(page, "teleport", p.x, p.z);
    const a = (await oi(page, "anchor", id)) as { x: number; y: number; z: number } | null;
    expect(a, `anchor ${id}`).not.toBeNull();
    await oi(page, "lookAt", a!.x, a!.y, a!.z);
    try {
      await expect.poll(async () => oi(page, "target"), { timeout: attempt < 2 ? 3000 : 6000, message: `targeting ${id}` }).toMatchObject({ id, inRange: true });
      return;
    } catch (e) {
      if (attempt >= 2) throw e;
    }
  }
}

async function pressE(page: Page): Promise<void> {
  await page.locator("#game-canvas").focus();
  await page.keyboard.press("KeyE");
}

async function closePanels(page: Page): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const btn = page.locator("#work-close, #inspect-close, #station-close").first();
    if (!(await btn.count())) return;
    await btn.click();
    await page.waitForTimeout(60);
  }
}

/** Advance a dialogue; if it offers `want` ("group:value") pick it. Returns whether a choice was made. */
export async function runDialogue(page: Page, want?: string): Promise<boolean> {
  await expect(page.locator(".dlg-root")).toBeVisible();
  let chose = false;
  for (let i = 0; i < 80; i++) {
    if (!(await page.locator(".dlg-root:not(.out)").count())) {
      // A choice may lead straight into a follow-up conversation.
      await page.waitForTimeout(350);
      if (!(await page.locator(".dlg-root:not(.out)").count())) break;
    }
    if (!chose && want && (await page.locator(`[data-choice="${want}"]`).count())) {
      await page.locator(`[data-choice="${want}"]`).click();
      chose = true;
      continue;
    }
    if (await page.locator(".dlg-choice").count()) {
      await page.locator("#dlg-skip").click();
      continue;
    }
    await page.locator("#dlg-next").click();
    await page.waitForTimeout(60);
  }
  await expect(page.locator(".dlg-root:not(.out)")).toHaveCount(0);
  return chose;
}

async function waitDone(page: Page, step: Step): Promise<void> {
  await expect.poll(async () => (await state(page)).completed, { timeout: 10_000, message: `step ${step.id}` }).toContain(step.id);
}

function holderOf(m: MissionDef, id: string): string | null {
  const ev = m.evidence.find((e) => e.id === id);
  if (ev?.doc) return ev.doc;
  const item = m.inventory?.find((i) => i.id === id);
  if (item) return item.at;
  if (ev) return m.interactables.find((i) => i.panel === "station")?.id ?? null;
  return null;
}

function dialogueHolder(m: MissionDef, want: string): string | null {
  for (const n of m.npcs) {
    for (const r of n.talk ?? []) {
      const lines = m.dialogues[r.dialogue] ?? [];
      const reach = new Set<string>([r.dialogue]);
      for (const l of lines) for (const c of l.choices ?? []) if (c.next) reach.add(c.next);
      for (const d of reach) for (const l of m.dialogues[d] ?? []) for (const c of l.choices ?? []) if (`${c.group}:${c.value}` === want) return n.id;
    }
  }
  return null;
}

/** Open an object's panel with E (the bot is already facing it). */
async function open(page: Page, m: MissionDef, id: string): Promise<void> {
  await face(page, m, id);
  await pressE(page);
  await expect(page.locator(`[data-work="${id}"], [data-inspect="${id}"], #station-title`).first()).toBeVisible();
}

/** Perform the player action for one objective. */
export async function act(page: Page, m: MissionDef, step: Step): Promise<void> {
  const t = step.trigger;
  const target = t.target ?? t.targets?.[0] ?? null;
  switch (t.type) {
    case "npc_interacted":
      await face(page, m, target!);
      await pressE(page);
      await runDialogue(page);
      break;
    case "briefing_acknowledged":
      if (!(await page.locator("#briefing-ack").count())) {
        const npc = m.scene.briefingNpc ?? m.npcs[0].id;
        await face(page, m, npc);
        await pressE(page);
      }
      await page.locator("#briefing-ack").click();
      break;
    case "zone_entered": {
      const z = m.zones.find((zz) => zz.id === target)!;
      await oi(page, "teleport", (z.minX + z.maxX) / 2, (z.minZ + z.maxZ) / 2);
      break;
    }
    case "object_inspected":
      await open(page, m, target!);
      await closePanels(page);
      break;
    case "evidence_flagged": {
      const holder = holderOf(m, target!)!;
      await open(page, m, holder);
      await page.locator(`[data-flag="${target}"], [data-defect="${target}"]`).first().click();
      await closePanels(page);
      break;
    }
    case "item_selected": {
      await open(page, m, holderOf(m, target!)!);
      await page.locator(`[data-select="${target}"]`).click();
      await closePanels(page);
      break;
    }
    case "decision_made": {
      const want = `${target}:${t.value}`;
      const panelHolder = m.interactables.find((i) => (i.groups ?? []).includes(target ?? ""));
      if (panelHolder) {
        await open(page, m, panelHolder.id);
        await page.locator(`[data-decision="${want}"]`).click();
        await page.waitForTimeout(150);
        if (!(await page.locator(".dlg-root:not(.out)").count())) await closePanels(page);
      } else {
        const npc = dialogueHolder(m, want);
        expect(npc, `who offers ${want}`).not.toBeNull();
        await face(page, m, npc!);
        await pressE(page);
        expect(await runDialogue(page, want), `dialogue choice ${want}`).toBe(true);
      }
      break;
    }
    case "checklist_opened":
      await page.locator("#game-canvas").focus();
      await page.keyboard.press("KeyC");
      await page.keyboard.press("Escape");
      break;
    case "tool_used": {
      const tool = t.value!;
      const idx = m.tools.findIndex((x) => x.id === tool);
      await face(page, m, target!);
      await page.keyboard.press(`Digit${idx + 1}`);
      await pressE(page);
      await page.keyboard.press(`Digit${idx + 1}`);
      break;
    }
    default:
      throw new Error(`bot cannot perform ${t.type}`);
  }
  await waitDone(page, step);
  // A completed step may trigger a scripted dialogue (world event); let it play out.
  await page.waitForTimeout(150);
  await settle(page);
}

/** Finish any conversation that is open while the mission is still running. */
export async function settle(page: Page): Promise<void> {
  for (let i = 0; i < 5; i++) {
    const f = (await oi(page, "flags")) as { ending: boolean; dialogue: boolean };
    if (f.ending || !(await page.locator(".dlg-root:not(.out)").count())) return;
    await runDialogue(page);
    await page.waitForTimeout(120);
  }
}

export async function current(page: Page): Promise<Step | null> {
  return (await oi(page, "current")) as Step | null;
}

export async function skipIntro(page: Page): Promise<void> {
  await page.waitForSelector("#game-canvas", { timeout: 30_000 });
  await page.waitForFunction(() => !!(window as unknown as { __oi?: unknown }).__oi, null, { timeout: 30_000 });
  await oi(page, "skipCinematic");
}

export { oi };
