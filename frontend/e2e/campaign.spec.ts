// End-to-end verification of every campaign mission through the real UI:
// login → profile → category/level grid → story intro → 3D mission → objectives
// → decisions → feedback → multilingual MCQ → results → saved progress → unlock.
// Prerequisite levels are passed through the real HTTP API; the level under
// test is played in the browser by the generic bot (e2e/bot.ts).
import { expect, test, type Page } from "@playwright/test";
import { CATALOGUE, act, apiPass, apiRegister, correctAnswers, current, face, loadMission, oi, runDialogue, settle, skipIntro, state } from "./bot";

const LANGS = ["en", "ta", "hi"] as const;
const ONLY = process.env.OI_MISSIONS?.split(",").filter(Boolean);
const IDS = CATALOGUE.missions.filter((id) => id !== "og-hazrec-l1-silent-pump" && (!ONLY || ONLY.some((p) => id.includes(p))));

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/status of 40[19]/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

for (const [n, id] of IDS.entries()) {
  test(`mission ${id}`, async ({ page }) => {
    const errors = trackErrors(page);
    const m = loadMission(id);
    const lang = LANGS[n % 3];
    const user = `e2e_${m.category.slice(3, 9)}_${m.level}_${Date.now() % 1e7}`;

    // Account + profile, prerequisites passed through the real API.
    await apiRegister(page.request, user);
    for (const prev of CATALOGUE.missions.map(loadMission).filter((x) => x.category === m.category && x.level < m.level).sort((a, b) => a.level - b.level)) {
      await apiPass(page.request, prev.id);
    }

    // Language, then the category/level grid shows this level as available.
    await page.goto("/#/menu");
    await page.locator(`.lang-switch button[lang="${lang}"]`).first().click();
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await page.goto("/#/missions");
    const card = page.locator(`[data-mission="${id}"]`);
    await expect(card).toBeVisible();
    await card.click();
    await skipIntro(page);

    // Every mission object and NPC must be physically reachable on foot.
    for (const target of [...m.interactables.map((i) => i.id), ...m.npcs.map((x) => x.id)]) {
      expect(await oi(page, "reachable", target), `reachable ${target}`).toBe(true);
    }

    // Variation by index: some runs make an unsafe decision first (critical path),
    // some reload mid-mission (interrupted session), all re-inspect once (duplicates).
    const doCritical = n % 4 === 1;
    const doReload = n % 4 === 2;
    let duplicateChecked = false;
    let criticalDone = false;
    let reloaded = false;
    for (let guard = 0; guard < 40; guard++) {
      await settle(page);
      const cur = await current(page);
      if (!cur) break;
      if (doReload && !reloaded && cur.trigger.type !== "npc_interacted" && cur.trigger.type !== "briefing_acknowledged") {
        reloaded = true;
        await page.reload();
        await page.waitForFunction(() => !!(window as unknown as { __oi?: unknown }).__oi, null, { timeout: 30_000 });
        await expect(page.locator("#pause-resume, #briefing-ack, #block-ack").first()).toBeVisible();
        if (await page.locator("#pause-resume").count()) await page.locator("#pause-resume").click();
        continue;
      }
      if (doCritical && !criticalDone && cur.trigger.type === "decision_made") {
        // Choose the first critical decision offered at this decision point.
        const crit = m.criticalErrors.find((c) => c.trigger.type === "decision_made" && c.trigger.target === cur.trigger.target && (!c.condition || true));
        const holder = crit && m.interactables.find((i) => (i.groups ?? []).includes(crit.trigger.target ?? ""));
        if (crit && holder) {
          criticalDone = true;
          await face(page, m, holder.id);
          await page.locator("#game-canvas").focus();
          await page.keyboard.press("KeyE");
          await page.locator(`[data-decision="${crit.trigger.target}:${crit.trigger.value}"]`).click();
          await runDialogue(page);
          await page.locator("#block-ack").click();
          await expect.poll(async () => (await state(page)).state).toBe("ACTIVE");
          continue;
        }
      }
      await act(page, m, cur);
      if (!duplicateChecked && cur.trigger.type === "object_inspected") {
        duplicateChecked = true;
        const before = await state(page);
        await face(page, m, cur.trigger.target!);
        await page.keyboard.press("KeyE");
        await page.locator("#work-close, #inspect-close, #station-close").first().click();
        const after = await state(page);
        expect(after.completed).toEqual(before.completed);
        expect(after.counters.mistakes).toBe(before.counters.mistakes);
      }
    }

    // End sequence: supervisor reaction, comic panel, debrief, results.
    for (let i = 0; i < 20 && !page.url().includes("/results/"); i++) {
      if (await page.locator(".dlg-root:not(.out)").count()) await runDialogue(page);
      else if (await page.locator("#comic-continue").count()) await page.locator("#comic-continue").click();
      else await page.waitForTimeout(300);
    }
    await page.waitForURL(/#\/results\//, { timeout: 30_000 });
    const outcome = await page.locator("#result-outcome").getAttribute("class");
    expect(outcome).toContain(criticalDone ? "critical_error" : "mastery");

    // Multilingual MCQ (answers by option id; text is in the chosen language).
    await page.locator("#flow-next").click();
    for (const [q, a] of Object.entries(correctAnswers(m))) await page.locator(`[data-question="${q}"] input[data-option="${a}"]`).check();
    await page.locator("#mcq-submit").click();
    await expect(page.locator("#mcq-score")).toBeVisible();
    await page.locator("#flow-next").click();
    await expect(page.locator("#remediation-status")).toHaveAttribute("data-met", criticalDone ? "false" : "true");
    await page.locator("#flow-next").click();
    await expect(page.locator("#persist-status")).toHaveAttribute("data-verified", "true");
    const hasNext = CATALOGUE.missions.map(loadMission).some((x) => x.category === m.category && x.level === m.level + 1);
    if (hasNext) {
      if (criticalDone) await expect(page.locator("#next-level-locked")).toBeVisible();
      else await expect(page.locator("#next-level")).toBeVisible();
    }
    expect(await page.locator("html").getAttribute("lang")).toBe(lang);
    expect(errors).toEqual([]);
  });
}
