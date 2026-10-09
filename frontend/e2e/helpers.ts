import { expect, type Page } from "@playwright/test";

export const SP = "og-hazrec-l1-silent-pump";

// Standing positions in front of each anchor (x, z). Teleporting stands in for walking; the
// interaction itself still goes through the real ray-pick, range check and E key.
const STAND: Record<string, [number, number]> = {
  supervisor: [-3, -13],
  pump_p101: [-1.2, 1.7],
  pump_p102: [-1.2, 5.0],
  status_panel: [2.2, 0.9],
  warning_beacon: [2.2, 0.9],
  work_docs: [3.4, -2.6],
  elec_cabinet: [-3.4, 6.9],
  checklist_station: [5.6, -2.3],
  safety_board: [-3.0, -2.5],
  local_control: [2.7, 3.6],
};

export async function login(page: Page, username: string, password: string, portal: "trainee" | "admin" = "trainee") {
  await page.goto(`/#/login?portal=${portal}`);
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
}

export async function register(page: Page, username: string) {
  await page.goto("/#/register");
  await page.fill("#displayName", `E2E ${username}`);
  await page.fill("#username", username);
  await page.fill("#password", "Password123");
  await page.click("button[type=submit]");
  await expect(page.locator("[data-industry]").first()).toBeVisible();
}

export async function waitForGame(page: Page) {
  await page.waitForSelector("#game-canvas", { timeout: 30_000 });
  await page.waitForFunction(() => !!(window as any).__oi, null, { timeout: 30_000 });
}

export async function gameState(page: Page) {
  return page.evaluate(() => (window as any).__oi.state());
}

export async function goAndFace(page: Page, id: string) {
  const [x, z] = STAND[id];
  await page.evaluate(([x, z]) => (window as any).__oi.teleport(x, z), [x, z]);
  const a = await page.evaluate((id) => (window as any).__oi.anchor(id), id);
  expect(a, `anchor ${id}`).not.toBeNull();
  await page.evaluate(({ x, y, z }) => (window as any).__oi.lookAt(x, y, z), a);
  await expect.poll(async () => page.evaluate(() => (window as any).__oi.target()), { timeout: 5000 }).toMatchObject({ id, inRange: true });
}

export async function interact(page: Page, id: string) {
  await goAndFace(page, id);
  await page.keyboard.press("KeyE");
}

/** Advance a comic dialogue until it closes. */
export async function finishDialogue(page: Page) {
  await expect(page.locator(".dlg-root")).toBeVisible();
  for (let i = 0; i < 40 && (await page.locator(".dlg-root:not(.out)").count()); i++) {
    await page.locator("#dlg-next").click();
    await page.waitForTimeout(80);
  }
  await expect(page.locator(".dlg-root")).toHaveCount(0);
}

export async function closeInspect(page: Page) {
  await page.locator("#inspect-close").click();
  await expect(page.locator("[data-inspect]")).toHaveCount(0);
}

/** Scenes 01–10 shared by every path. */
export async function playToDecisionPoint(page: Page) {
  await page.evaluate(() => (window as any).__oi.skipCinematic());
  // Scene 02: supervisor
  await interact(page, "supervisor");
  await finishDialogue(page);
  // Scene 03: briefing
  await page.locator("#briefing-ack").click();
  await expect.poll(async () => (await gameState(page)).state).toBe("ACTIVE");
  // Scene 05: wrong pump first (contextual warning, no penalty), then P-101
  await interact(page, "pump_p102");
  await expect(page.locator(".warning-msg").filter({ hasText: "P-102" })).toBeVisible();
  await closeInspect(page);
  await interact(page, "pump_p101");
  await closeInspect(page);
  // Scenes 06–08
  await interact(page, "status_panel");
  await closeInspect(page);
  await interact(page, "work_docs");
  await closeInspect(page);
  await interact(page, "elec_cabinet");
  await closeInspect(page);
  // Scene 09: checklist
  await page.keyboard.press("KeyC");
  await expect(page.locator(".checklist-device.open")).toBeVisible();
  await expect(page.locator('[data-step="hazard_awareness"]')).toHaveAttribute("data-status", "done");
  await expect(page.locator('[data-step="identify_gap"]')).not.toHaveAttribute("data-status", "done");
  await page.keyboard.press("Escape");
  await expect(page.locator(".checklist-device.open")).toHaveCount(0);
  // Scene 10: station
  await interact(page, "checklist_station");
  await expect(page.locator("#station-title")).toBeVisible();
  await page.locator('[data-flag="isolation_verification"]').click();
  await expect.poll(async () => (await gameState(page)).completed).toContain("identify_gap");
}

export async function finishEndSequence(page: Page) {
  // Scene 13 comic, Scene 14 debrief, then results.
  await page.locator("#comic-continue").click({ timeout: 30_000 });
  await finishDialogue(page);
  await page.waitForURL(/#\/results\//, { timeout: 30_000 });
}

export async function answerMcq(page: Page, answers: Record<string, string>) {
  for (const [q, a] of Object.entries(answers)) await page.locator(`[data-question="${q}"] input[data-option="${a}"]`).check();
  await page.locator("#mcq-submit").click();
}

export const CORRECT = { "SP-Q1": "b", "SP-Q2": "c", "SP-Q3": "c", "SP-Q4": "a", "SP-Q5": "d" };
