import { expect, test, type Page } from "@playwright/test";
import { CORRECT, SP, answerMcq, closeInspect, finishDialogue, finishEndSequence, gameState, interact, login, playToDecisionPoint, register, waitForGame } from "./helpers";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    // 401 (session probe) and 409 (open-session conflict) are handled API responses that Chrome still logs.
    if (m.type() === "error" && !/status of 40[19]/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

async function setupProfile(page: Page) {
  // Criteria 2–4: industry, designation, experience.
  await page.locator('[data-industry="oil_gas"]').click();
  await page.locator('[data-designation="og_mech_maint"]').click();
  await page.locator('[data-choice="fresher"]').click();
  await page.locator('[data-choice="standard"]').click();
  await page.locator("#setup-save").click();
  await expect(page.locator(`[data-mission="${SP}"]`)).toBeVisible();
}

test("correct decision path end-to-end in English, with persistence and restart", async ({ page }) => {
  const errors = trackErrors(page);
  const user = `e2e_ok_${Date.now()}`;
  await register(page, user); // criterion 1 (account + session)
  await setupProfile(page);
  // Criterion 6: launch.
  await page.locator(`[data-mission="${SP}"]`).click();
  await waitForGame(page); // criterion 7
  await expect(page.locator("#cinematic")).toBeVisible();

  // Criterion 8: first-person movement (real keyboard input).
  await page.evaluate(() => (window as any).__oi.skipCinematic());
  const before = await page.evaluate(() => (window as any).__oi.pos());
  await page.locator("#game-canvas").focus();
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(700);
  await page.keyboard.up("KeyW");
  const after = await page.evaluate(() => (window as any).__oi.pos());
  expect(after.z - before.z).toBeGreaterThan(0.8);

  // Talking to the supervisor before arriving still records arrival; out-of-range E is refused.
  await page.evaluate(() => (window as any).__oi.teleport(-3, -18.5));
  await page.evaluate(() => (window as any).__oi.lookAt(-3, 1.6, -11));
  await expect.poll(() => page.evaluate(() => (window as any).__oi.target())).toMatchObject({ id: "supervisor", inRange: false });
  await page.keyboard.press("KeyE");
  await expect(page.locator(".dlg-root")).toHaveCount(0);

  await playToDecisionPoint(page); // criteria 9–11
  const pre = await gameState(page);
  expect(pre.counters.mistakes).toBe(0);
  // Criteria 12, 14: decision branch, correct completion.
  await page.locator('[data-decision="no_go"]').click();
  await finishDialogue(page); // supervisor "correct" line
  await finishEndSequence(page);

  // Scene 15: review uses real recorded data (criteria 15, 17).
  await expect(page.locator("#result-outcome")).toHaveText("Mastery");
  await expect(page.locator("#result-score")).toHaveText("100");
  await expect(page.locator("#result-decision")).toContainText("Stop and request confirmation");
  await page.locator("#flow-next").click();
  // Scene 16–17: MCQ (criterion 16); validation for unanswered questions.
  await page.locator("#mcq-submit").click();
  await expect(page.locator(".form-error")).toContainText("answer every question");
  await answerMcq(page, CORRECT);
  await expect(page.locator("#mcq-score")).toContainText("5 of 5");
  await page.locator("#flow-next").click();
  await expect(page.locator("#remediation-status")).toHaveAttribute("data-met", "true");
  await page.locator("#flow-next").click();
  // Scene 19–20: persistence confirmed by a backend read (criterion 18).
  await expect(page.locator("#persist-status")).toHaveAttribute("data-verified", "true");
  await expect(page.locator(".achievement")).toContainText(["Mission completed", "No critical errors"]);
  await page.locator("#return-hub").click(); // criterion 19
  await expect(page.locator("#menu-start")).toBeVisible();

  // Progress page reads the stored attempt.
  await page.goto("/#/progress");
  await expect(page.locator("table").first()).toContainText("The Silent Pump");
  await expect(page.locator("table").first()).toContainText("Mastery");

  // Criterion 20: restart — a new attempt rotates to scenario variant B.
  await page.goto("/#/missions");
  await page.locator(`[data-mission="${SP}"]`).click();
  await waitForGame(page);
  await page.evaluate(() => (window as any).__oi.skipCinematic());
  await interact(page, "supervisor");
  await finishDialogue(page);
  await page.locator("#briefing-ack").click();
  await interact(page, "pump_p101");
  await closeInspect(page);
  await interact(page, "work_docs");
  await expect(page.locator("[data-inspect=work_docs]")).toContainText("P-102, not P-101");
  expect(errors).toEqual([]);
});

test("unsafe decision path in Tamil is blocked, explained and assessed", async ({ page }) => {
  const errors = trackErrors(page);
  await register(page, `e2e_ta_${Date.now()}`);
  await setupProfile(page);
  // Criterion 5: language selection persists through the mission.
  await page.goto("/#/menu");
  await page.locator('.lang-switch button[lang="ta"]').click();
  await expect(page.locator("#menu-start")).toContainText("உருவகப்படுத்தலைத் தொடங்கு");
  await page.goto("/#/missions");
  await page.locator(`[data-mission="${SP}"]`).click();
  await waitForGame(page);
  await playToDecisionPoint(page);

  // Criterion 13: unsafe decision detected and blocked.
  await page.locator('[data-decision="go"]').click();
  await finishDialogue(page);
  await expect(page.locator("#block-title")).toHaveText("பாதுகாப்பற்ற செயல் நிறுத்தப்பட்டது");
  expect((await gameState(page)).state).toBe("BLOCKED");
  await page.locator("#block-ack").click();
  // Corrective review is now required before the correct decision counts.
  await interact(page, "checklist_station");
  await page.locator('[data-decision="no_go"]').click();
  await expect(page.locator(".warning-msg").first()).toBeVisible();
  expect((await gameState(page)).counters.mistakes).toBe(1);
  await page.locator("#station-close").click();
  await interact(page, "work_docs");
  await closeInspect(page);
  await interact(page, "checklist_station");
  await page.locator('[data-decision="no_go"]').click();
  await finishDialogue(page);
  await finishEndSequence(page);
  await expect(page.locator("#result-outcome")).toHaveText("கடுமையான பாதுகாப்புப் பிழையுடன் முடிந்தது");
  await expect(page.locator(".notice.red")).toBeVisible();
  await page.locator("#flow-next").click();
  await answerMcq(page, { ...CORRECT, "SP-Q1": "a" });
  await page.locator("#flow-next").click();
  await expect(page.locator("#remediation-status")).toHaveAttribute("data-met", "false");
  await page.locator("#flow-next").click();
  await expect(page.locator("#persist-status")).toHaveAttribute("data-verified", "true");
  expect(errors).toEqual([]);
});

test("Hindi: refresh recovery, pause during dialogue, exit and continue", async ({ page }) => {
  const errors = trackErrors(page);
  await register(page, `e2e_hi_${Date.now()}`);
  await setupProfile(page);
  await page.goto("/#/menu");
  await page.locator('.lang-switch button[lang="hi"]').click();
  await page.goto("/#/missions");
  await page.locator(`[data-mission="${SP}"]`).click();
  await waitForGame(page);
  await page.evaluate(() => (window as any).__oi.skipCinematic());
  // Pausing during dialogue (Esc is captured by the dialogue only when the mouse is free; use the pause API path).
  await interact(page, "supervisor");
  await expect(page.locator(".dlg-root")).toBeVisible();
  await expect(page.locator("#dlg-text")).toContainText(/[ऀ-ॿ]/);
  await finishDialogue(page);
  await page.locator("#briefing-ack").click();
  await interact(page, "pump_p101");
  await closeInspect(page);
  const url = page.url();
  // Browser refresh: the session is restored from the server event log and resumes paused.
  await page.reload();
  await waitForGame(page);
  await expect(page.locator("#pause-resume")).toBeVisible();
  const restored = await gameState(page);
  expect(restored.state).toBe("PAUSED");
  expect(restored.completed).toContain("locate_pump");
  await page.locator("#pause-resume").click();
  await expect.poll(async () => (await gameState(page)).state).toBe("ACTIVE");
  // Exit before completion, then Continue Training.
  await page.keyboard.press("Escape");
  await page.locator("#pause-exit").click();
  await page.locator(".modal .btn-primary").click();
  await expect(page.locator("#menu-continue")).toBeEnabled();
  await page.locator("#menu-continue").click();
  await waitForGame(page);
  expect(page.url()).toBe(url);
  expect((await gameState(page)).completed).toContain("locate_pump");
  expect(errors).toEqual([]);
});

test("edge cases: invalid session route, unauthorised admin, locked levels, admin results", async ({ page }) => {
  await page.goto("/#/play/not-a-session");
  await expect(page).toHaveURL(/#\/welcome/); // not signed in → guarded
  await login(page, "trainee.dev", "Trainee#2026");
  await expect(page.locator("#menu-start")).toBeVisible();
  await page.goto("/#/play/00000000-0000-0000-0000-000000000000");
  await expect(page.locator("[role=alert]")).toBeVisible();
  await page.goto("/#/admin");
  await expect(page).toHaveURL(/#\/menu/);
  await page.goto("/#/missions");
  await expect(page.locator('[data-category="og_hazard_recognition"] [data-level="2"]')).toContainText("Upcoming");
  await page.goto("/#/menu");
  await page.locator("#menu-logout").click();
  await expect(page.locator(".welcome-menu")).toBeVisible();
  // Admin button never grants admin rights.
  await login(page, "trainee.dev", "Trainee#2026", "admin");
  await expect(page.locator(".form-error")).toContainText("does not have administrator access");
  await login(page, "admin.dev", "Admin#2026", "admin");
  await expect(page.locator("h1")).toContainText("Trainee results");
});

test("scene disposal: entering and leaving the world repeatedly leaks no contexts or errors", async ({ page }) => {
  const errors = trackErrors(page);
  await register(page, `e2e_dispose_${Date.now()}`);
  await setupProfile(page);
  for (let i = 0; i < 3; i++) {
    await page.goto("/#/missions");
    await page.locator(`[data-mission="${SP}"]`).click();
    // From the second attempt on, an unfinished session exists: the app asks before abandoning it.
    await page.locator("#game-canvas, .modal").first().waitFor({ timeout: 30_000 });
    const dialog = page.locator(".modal .btn-primary");
    if (await dialog.count()) await dialog.click();
    await waitForGame(page);
    await page.evaluate(() => (window as any).__oi.skipCinematic());
    await page.goto("/#/menu");
    await expect(page.locator("#menu-start")).toBeVisible();
    expect(await page.locator("canvas#game-canvas").count()).toBe(0);
    expect(await page.evaluate(() => (window as any).__oi)).toBeUndefined();
  }
  expect(errors).toEqual([]);
});
