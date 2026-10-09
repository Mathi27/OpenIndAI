// DOM HUD overlay: mission card, timer/status, crosshair & prompts, warnings,
// minimap slot, shortcuts, captions and cinematic banners.
import { t } from "../../i18n";
import { formatDuration, h } from "../../ui/dom";
import type { MissionState } from "../../mission/engine";

export type WarnKind = "error" | "info" | "success" | "hint";

export class Hud {
  readonly el: HTMLDivElement;
  private missionTitle = h("div", { class: "mission-title" });
  private objective = h("div", { class: "objective", "aria-live": "polite", id: "hud-objective" });
  private objectiveDetail = h("div", { class: "objective-detail" });
  private progressFill = h("span");
  private progressText = h("div", { class: "progress-text", id: "hud-progress" });
  private timer = h("div", { class: "timer", id: "hud-timer" }, "00:00");
  private stateChip = h("div", { class: "state-chip", id: "hud-state" });
  private learning = h("div", { class: "small", style: "text-align:right;color:var(--text-dim)" });
  private sceneLabel = h("div", { class: "small", style: "text-align:right;color:var(--orange-400);font-weight:700" });
  private helpBtn: HTMLButtonElement;
  private helpCount = h("span");
  private fps = h("div", { class: "fps", hidden: true });
  private sync = h("div", { class: "sync-indicator", hidden: true });
  private crosshair = h("div", { class: "crosshair", "aria-hidden": "true" });
  private prompt = h("div", { class: "prompt", hidden: true, id: "hud-prompt" });
  private warnings = h("div", { class: "warnings", role: "alert", "aria-live": "assertive" });
  private captions = h("div", { class: "captions", "aria-live": "polite" });
  private clickHint = h("div", { class: "click-hint", hidden: true });
  private toolChip = h("div", { class: "tool-chip" });
  private guide = h("div", { class: "guide" });
  private banner = h("div", { class: "banner-host" });
  private minimapSlot = h("div", { class: "hud-bl" });
  private labels: (() => void)[] = [];

  constructor(handlers: { onHelp: () => void; onChecklist: () => void; onToolbox: () => void }) {
    this.helpBtn = h("button", { class: "help-btn interactive", onclick: handlers.onHelp, id: "hud-help" }, this.helpLabel(), " ", this.helpCount);
    const checklistBtn = h("button", { class: "shortcut", onclick: handlers.onChecklist, id: "hud-checklist" }, h("kbd", {}, "C"), h("span", {}, ""));
    const toolboxBtn = h("button", { class: "shortcut", onclick: handlers.onToolbox, id: "hud-toolbox" }, h("kbd", {}, "T"), h("span", {}, ""));
    this.labels.push(() => {
      (checklistBtn.lastChild as HTMLElement).textContent = t("hud.checklistKey");
      (toolboxBtn.lastChild as HTMLElement).textContent = t("hud.toolboxKey");
      this.helpBtn.firstChild!.textContent = this.helpLabel();
      this.guide.textContent = t("hud.guide");
      this.clickHint.textContent = t("hud.clickToPlay");
    });
    this.el = h(
      "div",
      { class: "hud" },
      h("div", { class: "hud-tl hud-box" }, h("div", { class: "mission-label" }, ""), this.missionTitle, this.objective, this.objectiveDetail, h("div", { class: "progress-bar" }, this.progressFill), this.progressText),
      h("div", { class: "hud-tr" }, h("div", { class: "hud-box" }, h("div", { class: "timer-label" }, ""), this.timer), this.stateChip, this.sceneLabel, this.learning, this.helpBtn, this.fps, this.sync),
      h("div", { class: "hud-center" }, this.crosshair, this.prompt, this.warnings),
      this.minimapSlot,
      h("div", { class: "hud-br" }, this.toolChip, h("div", { class: "shortcuts" }, checklistBtn, toolboxBtn), this.guide),
      this.captions,
      this.clickHint,
      this.banner,
    );
    const missionLabel = this.el.querySelector(".mission-label") as HTMLElement;
    const timerLabel = this.el.querySelector(".timer-label") as HTMLElement;
    this.labels.push(() => {
      missionLabel.textContent = t("hud.mission");
      timerLabel.textContent = t("hud.timer");
    });
    this.relabel();
  }

  private helpLabel(): string {
    return t("hud.help");
  }

  relabel(): void {
    this.labels.forEach((fn) => fn());
  }

  mountMinimap(el: HTMLElement): void {
    this.minimapSlot.replaceChildren(el);
  }

  setMission(title: string): void {
    this.missionTitle.textContent = title;
  }

  setObjective(text: string, detail: string, done: number, total: number): void {
    if (this.objective.textContent !== text) {
      this.objective.textContent = text;
      this.objective.animate([{ transform: "translateX(-8px)", opacity: 0.2 }, { transform: "none", opacity: 1 }], { duration: 350 });
    }
    this.objectiveDetail.textContent = detail;
    this.objectiveDetail.hidden = !detail;
    this.progressFill.style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
    this.progressText.textContent = t("hud.progress", { done, total });
  }

  setTimer(ms: number): void {
    this.timer.textContent = formatDuration(ms);
  }

  setState(state: MissionState): void {
    this.stateChip.className = `state-chip ${state}`;
    this.stateChip.textContent = t(`hud.state.${state}`);
  }

  setScene(label: string, learning: string): void {
    this.sceneLabel.textContent = label;
    this.learning.textContent = learning;
  }

  setHints(left: number, enabled: boolean): void {
    this.helpCount.textContent = left > 0 ? `· ${left >= 99 ? "∞" : t("hud.hintsLeft", { count: left })}` : `· ${t("hud.hintsNone")}`;
    this.helpBtn.disabled = !enabled || left <= 0;
  }

  setFps(fps: number | null): void {
    this.fps.hidden = fps === null;
    if (fps !== null) this.fps.textContent = t("hud.fps", { fps: Math.round(fps) });
  }

  setSync(online: boolean, pending: number): void {
    this.sync.hidden = online && pending === 0;
    this.sync.textContent = online ? t("hud.syncing") : t("hud.offline");
  }

  setPrompt(text: string | null, far = false): void {
    this.prompt.hidden = !text;
    this.prompt.className = `prompt ${far ? "far" : ""}`;
    if (text) this.prompt.textContent = text;
    this.crosshair.classList.toggle("target", !!text && !far);
  }

  setTool(name: string | null): void {
    this.toolChip.textContent = name ? t("hud.selectedTool", { tool: name }) : t("hud.noTool");
  }

  showClickHint(show: boolean): void {
    this.clickHint.hidden = !show;
  }

  setVisible(v: boolean): void {
    this.el.style.visibility = v ? "visible" : "hidden";
  }

  warn(message: string, kind: WarnKind = "error", ms = 4200): void {
    // Avoid stacking identical messages from repeated presses.
    for (const existing of Array.from(this.warnings.children)) if (existing.textContent === message) existing.remove();
    const el = h("div", { class: `warning-msg ${kind}` }, message);
    this.warnings.append(el);
    while (this.warnings.children.length > 3) this.warnings.firstElementChild?.remove();
    window.setTimeout(() => el.remove(), ms);
  }

  caption(text: string, ms = 3500): void {
    const el = h("div", { class: "caption-line" }, text);
    this.captions.append(el);
    while (this.captions.children.length > 2) this.captions.firstElementChild?.remove();
    window.setTimeout(() => el.remove(), ms);
  }

  /** Cinematic comic-style banner (mission start, new objective, completion). */
  showBanner(big: string, small: string, kind: "start" | "objective" | "complete" | "danger" = "objective", ms = 2600): Promise<void> {
    return new Promise((resolve) => {
      const el = h("div", { class: `banner banner-${kind}`, role: "status" }, h("div", { class: "banner-small" }, small), h("div", { class: "banner-big" }, big));
      this.banner.replaceChildren(el);
      window.setTimeout(() => {
        el.classList.add("out");
        window.setTimeout(() => {
          el.remove();
          resolve();
        }, 400);
      }, ms);
    });
  }
}
