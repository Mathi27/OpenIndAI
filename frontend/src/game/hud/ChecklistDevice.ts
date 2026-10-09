// Handheld checklist (C). Read-only: items tick only from verified mission
// events, so clicking cannot certify safety-critical tasks.
import { exists, t } from "../../i18n";
import { h } from "../../ui/dom";
import type { MissionController } from "../../mission/MissionController";
import type { AssistanceProfile } from "../../mission/types";
import { checklistItems, instructionKey } from "./Panels";

export class ChecklistDevice {
  readonly el: HTMLDivElement;
  private screen: HTMLDivElement;
  private titleEl: HTMLElement;
  isOpen = false;

  constructor(private ctrl: MissionController, private assistance: AssistanceProfile, onClose: () => void) {
    this.screen = h("div", { class: "screen-area", id: "checklist-screen" });
    this.titleEl = h("span", {});
    this.el = h(
      "div",
      { class: "checklist-device", role: "dialog", "aria-hidden": "true", "aria-label": t("checklist.title") },
      h("div", { class: "bezel-top" }, h("span", { class: "row" }, h("span", { class: "led" }), this.titleEl), h("button", { class: "btn btn-ghost", onclick: onClose, id: "checklist-close" }, t("checklist.close"))),
      this.screen,
    );
  }

  setOpen(open: boolean): void {
    this.isOpen = open;
    this.el.classList.toggle("open", open);
    this.el.setAttribute("aria-hidden", String(!open));
    if (open) this.render();
  }

  render(): void {
    const m = this.ctrl.mission;
    this.titleEl.textContent = `${t("checklist.title")} · ${t("checklist.device")}`;
    const items = checklistItems(m, this.ctrl);
    const required = items.filter((i) => !i.step.optional);
    const optional = items.filter((i) => i.step.optional);
    const current = this.ctrl.current();
    const row = (i: (typeof items)[number]) =>
      h(
        "div",
        { class: `check-item ${i.status}`, "data-step": i.step.id, "data-status": i.status },
        h("span", { class: "box", "aria-hidden": "true" }, i.status === "done" ? "✓" : ""),
        h("div", {}, h("div", {}, t(i.step.titleKey)), h("div", { class: "sub" }, i.status === "done" ? t("checklist.completed") : i.status === "current" ? t("checklist.pending") : t("checklist.locked"))),
      );
    const instr = current && this.assistance.objectiveDetail !== "minimal" && exists(instructionKey(current)) ? t(instructionKey(current)) : null;
    const children: (HTMLElement | null)[] = [
      h("div", { class: "section-label" }, t(m.titleKey)),
      h("p", { class: "small muted" }, t("checklist.notice")),
      h("div", { class: "section-label" }, `${t("checklist.completed")} / ${t("checklist.pending")}`),
      ...required.map(row),
      instr ? h("div", { class: "section-label" }, t("checklist.instructions")) : null,
      instr ? h("p", { class: "small" }, instr) : null,
      optional.length ? h("div", { class: "section-label" }, t("checklist.optional")) : null,
      ...optional.map(row),
    ];
    this.screen.replaceChildren(...children.filter((c): c is HTMLElement => c !== null));
  }
}
