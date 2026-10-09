// Visual review helper (not part of the regular suite): OI_SHOTS=<mission-substring> npx playwright test e2e/shots.spec.ts
import { test } from "@playwright/test";
import { CATALOGUE, act, apiPass, apiRegister, current, face, loadMission, oi, settle, skipIntro } from "./bot";

const OUT = process.env.OI_SHOT_DIR ?? "test-results/shots";
const ONLY = process.env.OI_SHOTS;

test.skip(!ONLY, "visual review only");

test("screenshots", async ({ page }) => {
  const id = CATALOGUE.missions.find((x) => x.includes(ONLY!))!;
  const m = loadMission(id);
  await apiRegister(page.request, `shot_${Date.now() % 1e7}`);
  for (const prev of CATALOGUE.missions.map(loadMission).filter((x) => x.category === m.category && x.level < m.level)) await apiPass(page.request, prev.id);
  await page.goto(`/#/missions`);
  await page.locator(`[data-mission="${id}"]`).click();
  await page.waitForSelector("#cinematic");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${m.id}-0-cinematic.png` });
  await skipIntro(page);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${m.id}-1-spawn.png` });
  let i = 2;
  for (let guard = 0; guard < 40; guard++) {
    await settle(page);
    const cur = await current(page);
    if (!cur) break;
    const tgt = cur.trigger.target ?? cur.trigger.targets?.[0];
    if (cur.trigger.type === "object_inspected" && tgt) {
      await face(page, m, tgt);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/${m.id}-${i++}-${tgt}.png` });
    }
    if (cur.trigger.type === "decision_made" || cur.trigger.type === "evidence_flagged" || cur.trigger.type === "item_selected") {
      const holder = m.interactables.find((it) => (it.groups ?? []).includes(cur.trigger.target ?? "") || m.evidence.some((e) => e.id === cur.trigger.target && (e.doc === it.id || (!e.doc && it.panel === "station"))) || (m.inventory ?? []).some((x) => x.id === cur.trigger.target && x.at === it.id));
      if (holder) {
        await face(page, m, holder.id);
        await page.keyboard.press("KeyE");
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT}/${m.id}-${i++}-panel-${holder.id}.png` });
        await page.locator("#work-close, #inspect-close").first().click();
      }
    }
    await act(page, m, cur);
    if (cur.trigger.type === "npc_interacted") {
      await page.waitForTimeout(300);
      if (await page.locator("#briefing-ack").count()) await page.screenshot({ path: `${OUT}/${m.id}-${i++}-briefing.png` });
    }
  }
  void oi;
});
