// Builders for in-game panels. Every button maps to a real game event or
// navigation; nothing here certifies a task on its own.
import { exists, t } from "../../i18n";
import { h } from "../../ui/dom";
import type { CriticalError, Interactable, MissionDef, Step } from "../../mission/types";
import type { MissionController } from "../../mission/MissionController";
import { visibleSteps } from "../../mission/engine";
import type { AssistanceProfile } from "../../mission/types";
import { comicArt } from "../story/comicArt";

const tx = (key: string, opts?: Record<string, unknown>) => (exists(key) ? t(key, opts) : `[${key}]`);

export function instructionKey(step: Step): string {
  return step.titleKey.replace(".step.", ".instruction.");
}

// ---------------------------------------------------------------- Scene 03: mission briefing
export function briefingPanel(m: MissionDef, focusConcepts: string[], onAck: () => void): HTMLElement {
  const ack = h("button", { class: "btn btn-primary btn-lg", id: "briefing-ack", autofocus: true, onclick: onAck }, t("briefing.acknowledge"));
  const row = (k: string, v: string) => h("div", { class: "brief-row" }, h("div", { class: "brief-k" }, k), h("div", { class: "brief-v" }, v));
  return h(
    "div",
    { class: "panel wide comic-panel", role: "dialog", "aria-labelledby": "brief-title" },
    h("div", { class: "comic-tag" }, t("briefing.tag")),
    h("h2", { id: "brief-title" }, t("briefing.title"), " — ", t(m.titleKey)),
    h("p", { class: "muted small" }, t(m.roleTitleKey), " · ", t(`category.${m.category}`), " · ", t(`level.${m.level}.name`)),
    row(t("briefing.assignment"), tx(m.assignmentKeys.assignment)),
    row(t("briefing.equipment"), tx(m.assignmentKeys.equipment)),
    row(t("briefing.objective"), tx(m.assignmentKeys.objective)),
    row(t("briefing.information"), tx(m.assignmentKeys.information)),
    h("h3", {}, t("briefing.objectives")),
    h("ul", {}, ...m.learningObjectiveKeys.map((k) => h("li", {}, tx(k)))),
    focusConcepts.length ? h("div", { class: "notice orange" }, h("strong", {}, t("briefing.focus")), h("ul", {}, ...focusConcepts.map((c) => h("li", {}, tx(`concept.${c}`))))) : null,
    h("p", { class: "notice" }, t("briefing.trainingOnly"), " ", t(m.ruleSet.noticeKey)),
    h("p", { class: "muted small" }, t("briefing.checklistUnlock"), " ", t("briefing.controls")),
    h("div", { class: "row end" }, ack),
  );
}

// ---------------------------------------------------------------- Scenes 05–08: inspection / documents
export function inspectPanel(m: MissionDef, it: Interactable, extra: string | null, onClose: () => void): HTMLElement {
  const isDoc = it.type === "document";
  const close = h("button", { class: "btn", autofocus: true, onclick: onClose, id: "inspect-close" }, t("app.close"));
  const lines = it.detailKeys.map((k) => tx(k));
  const body = isDoc
    ? h(
        "div",
        { class: "paper" },
        h("div", { class: "paper-stamp" }, t("docs.fictional")),
        h("div", { class: "paper-head" }, t("docs.header")),
        // Lines are deliberately not highlighted: spotting the gap is the trainee's task.
        ...lines.map((l) => h("div", { class: "paper-line" }, l)),
      )
    : h("div", {}, ...lines.map((l) => h("div", { class: `detail-line ${it.type === "indicator" ? "mono" : ""}` }, l)));
  return h(
    "div",
    { class: `panel ${isDoc ? "wide" : ""}`, role: "dialog", "aria-labelledby": "inspect-title", "data-inspect": it.id },
    h("div", { class: "comic-tag" }, t(`world.prompt.${it.promptKey.split(".").pop()}`)),
    h("h2", { id: "inspect-title" }, t(it.nameKey)),
    body,
    extra ? h("p", { class: "notice orange" }, extra) : null,
    m.variants.length > 1 && isDoc ? h("p", { class: "muted small" }, t("docs.variantNote")) : null,
    h("div", { class: "row end" }, close),
  );
}

// ---------------------------------------------------------------- Scenes 10–11: checklist station + decision point
export function stationPanel(
  m: MissionDef,
  ctrl: MissionController,
  flagged: Set<string>,
  onFlag: (id: string) => void,
  onDecide: (value: string) => void,
  onClose: () => void,
): HTMLElement {
  const reviewed = ctrl.isDone("review_checklist");
  const gapFound = ctrl.isDone("identify_gap");
  const rows = m.evidence.map((ev) => {
    const isFlagged = flagged.has(ev.id) || (ev.id === "isolation_verification" && gapFound);
    const btn = h("button", { class: `btn ${isFlagged ? "btn-danger" : ""}`, disabled: !reviewed || isFlagged, "data-flag": ev.id, onclick: () => onFlag(ev.id) }, isFlagged ? t("station.flagged") : t("station.flag"));
    return h("div", { class: "evidence-row" }, h("div", {}, h("strong", {}, tx(ev.labelKey)), h("div", { class: "status" }, tx(ev.statusKey))), h("span", {}), btn);
  });
  const decisions = m.decisions.map((d) => h("button", { class: `btn decision-btn decision-${d.value}`, "data-decision": d.value, disabled: !reviewed, onclick: () => onDecide(d.value) }, tx(d.labelKey)));
  return h(
    "div",
    { class: "panel wide comic-panel", role: "dialog", "aria-labelledby": "station-title" },
    h("div", { class: "comic-tag" }, t("station.tag")),
    h("h2", { id: "station-title" }, t("station.title")),
    h("p", { class: "muted small" }, t("world.obj.checklistStation.d1")),
    h("h3", {}, t("station.evidence")),
    ...rows,
    h("h3", { class: "decision-title" }, t("station.decisionTitle")),
    reviewed ? null : h("p", { class: "notice" }, t("station.decisionLocked")),
    h("div", { class: "decision-col" }, ...decisions),
    h("p", { class: "muted small" }, t("station.trainingRule")),
    h("div", { class: "row end" }, h("button", { class: "btn", onclick: onClose, id: "station-close" }, t("station.close"))),
  );
}

// ---------------------------------------------------------------- Toolbox
export function toolboxPanel(m: MissionDef, selected: string | null, onSelect: (id: string | null) => void, onClose: () => void): HTMLElement {
  const cards = m.tools.map((tool, i) =>
    h(
      "button",
      { class: "tool-card", "aria-pressed": String(selected === tool.id), "data-tool": tool.id, onclick: () => onSelect(selected === tool.id ? null : tool.id) },
      h("span", { class: "tool-icon", "aria-hidden": "true" }, { flashlight: "🔦", spanner: "🔧", radio: "📻" }[tool.id] ?? "🧰"),
      h("strong", {}, `${i + 1}. ${tx(tool.nameKey)}`),
      h("span", { class: "muted small" }, tx(tool.descKey)),
      h("span", { class: "small" }, selected === tool.id ? t("toolbox.selected") : t("toolbox.select")),
    ),
  );
  return h(
    "div",
    { class: "panel wide", role: "dialog", "aria-labelledby": "toolbox-title" },
    h("h2", { id: "toolbox-title" }, t("toolbox.title")),
    h("p", { class: "notice" }, t("toolbox.notice")),
    h("div", { class: "tool-grid" }, ...cards),
    h("p", { class: "muted small" }, t("toolbox.useHint")),
    h("div", { class: "row end" }, h("button", { class: "btn", onclick: () => onSelect(null) }, t("toolbox.putAway")), h("button", { class: "btn btn-primary", onclick: onClose, autofocus: true }, t("app.close"))),
  );
}

// ---------------------------------------------------------------- Scene 12: unsafe decision blocked
export function blockPanel(rule: CriticalError, onAck: () => void): HTMLElement {
  return h(
    "div",
    { class: "panel block-panel comic-panel", role: "alertdialog", "aria-labelledby": "block-title" },
    h("div", { class: "comic-tag danger" }, t("block.tag")),
    h("h2", { id: "block-title" }, t("block.title")),
    h("p", {}, tx(rule.explanationKey)),
    h("div", { class: "notice red" }, h("strong", {}, t("block.missingTitle"), ": "), tx(rule.missingKey)),
    h("p", { class: "muted small" }, t("block.conceptual")),
    h("div", { class: "row end" }, h("button", { class: "btn btn-primary", id: "block-ack", autofocus: true, onclick: onAck }, t("block.acknowledge"))),
  );
}

export function failedPanel(onContinue: () => void): HTMLElement {
  return h(
    "div",
    { class: "panel block-panel comic-panel", role: "alertdialog" },
    h("div", { class: "comic-tag danger" }, t("block.tag")),
    h("h2", {}, t("block.failedTitle")),
    h("p", {}, t("block.failedBody")),
    h("div", { class: "row end" }, h("button", { class: "btn btn-primary", id: "failed-continue", autofocus: true, onclick: onContinue }, t("app.continue"))),
  );
}

// ---------------------------------------------------------------- Pause
export function pausePanel(handlers: { resume: () => void; restart: () => void; instructions: () => void; settings: () => void; exit: () => void }): HTMLElement {
  const b = (label: string, fn: () => void, cls = "btn btn-block", id?: string) => h("button", { class: cls, onclick: fn, id }, label);
  return h(
    "div",
    { class: "panel", role: "dialog", "aria-labelledby": "pause-title", style: "width:min(420px,100%)" },
    h("h2", { id: "pause-title" }, t("pause.title")),
    b(t("pause.resume"), handlers.resume, "btn btn-primary btn-block btn-lg", "pause-resume"),
    b(t("pause.restart"), handlers.restart, "btn btn-block", "pause-restart"),
    b(t("pause.instructions"), handlers.instructions),
    b(t("pause.settings"), handlers.settings),
    b(t("pause.exit"), handlers.exit, "btn btn-block btn-danger", "pause-exit"),
  );
}

// ---------------------------------------------------------------- Instructions (I)
export function instructionsPanel(m: MissionDef, current: Step | null, assistance: AssistanceProfile, onClose: () => void): HTMLElement {
  const keys = ["move", "look", "interact", "checklist", "toolbox", "map", "instructions", "hint", "pause"];
  return h(
    "div",
    { class: "panel wide", role: "dialog", "aria-labelledby": "instr-title" },
    h("h2", { id: "instr-title" }, t("instructions.title"), " — ", t(m.titleKey)),
    current ? h("div", { class: "notice orange" }, h("strong", {}, t("hud.objective"), ": "), assistance.objectiveDetail === "minimal" ? t("hud.minimalObjective") : tx(current.titleKey), assistance.objectiveDetail === "full" ? h("div", {}, tx(instructionKey(current))) : null) : null,
    h("h3", {}, t("briefing.objectives")),
    h("ul", {}, ...m.learningObjectiveKeys.map((k) => h("li", {}, tx(k)))),
    h("h3", {}, t("instructions.controlsTitle")),
    h("ul", { class: "small" }, ...keys.map((k) => h("li", {}, t(`instructions.controls.${k}`)))),
    h("p", { class: "notice small" }, t(m.ruleSet.noticeKey)),
    h("div", { class: "row end" }, h("button", { class: "btn btn-primary", autofocus: true, onclick: onClose }, t("app.close"))),
  );
}

// ---------------------------------------------------------------- Scene 13: comic consequence panel
const COMIC_ART = [
  `<svg viewBox="0 0 200 140"><rect width="200" height="140" fill="#cfe6ff"/><rect y="104" width="200" height="36" fill="#9aa3ad"/>
   <rect x="40" y="70" width="120" height="34" fill="#4f5a6a" stroke="#111" stroke-width="3"/><circle cx="72" cy="66" r="26" fill="#2f7ddc" stroke="#111" stroke-width="3"/>
   <rect x="104" y="52" width="48" height="28" rx="6" fill="#6f7b8c" stroke="#111" stroke-width="3"/>
   <rect x="58" y="10" width="84" height="26" rx="4" fill="#fff" stroke="#111" stroke-width="3"/><text x="100" y="29" font-size="14" font-weight="900" text-anchor="middle" fill="#e8423f">STOPPED</text></svg>`,
  `<svg viewBox="0 0 200 140"><rect width="200" height="140" fill="#fff4d6"/><rect x="50" y="14" width="100" height="116" rx="6" fill="#fff" stroke="#111" stroke-width="3"/>
   <rect x="80" y="8" width="40" height="14" rx="3" fill="#7a5a36" stroke="#111" stroke-width="3"/>
   <path d="M62 40h76M62 56h76M62 72h60" stroke="#9aa3ad" stroke-width="5"/><rect x="62" y="90" width="76" height="26" fill="none" stroke="#e8423f" stroke-width="4" stroke-dasharray="6 4"/>
   <text x="100" y="108" font-size="22" font-weight="900" text-anchor="middle" fill="#e8423f">?</text></svg>`,
  `<svg viewBox="0 0 200 140"><rect width="200" height="140" fill="#d9f7e6"/><circle cx="100" cy="58" r="22" fill="#c98d5e" stroke="#111" stroke-width="3"/>
   <path d="M76 52q2-26 24-26q22 0 24 26z" fill="#ffc23d" stroke="#111" stroke-width="3"/><path d="M66 140q4-40 34-40q30 0 34 40z" fill="#2b5fa8" stroke="#111" stroke-width="3"/>
   <path d="M140 92v-34" stroke="#111" stroke-width="3"/><rect x="128" y="34" width="34" height="34" rx="6" fill="#e8423f" stroke="#111" stroke-width="3"/>
   <text x="145" y="56" font-size="12" font-weight="900" text-anchor="middle" fill="#fff">STOP</text></svg>`,
];

export function comicPanel(m: MissionDef, onContinue: () => void): HTMLElement {
  const def = m.consequencePanels.principle;
  return h(
    "div",
    { class: "panel wide comic-strip", role: "dialog", "aria-labelledby": "comic-title" },
    h("div", { class: "comic-tag" }, t("comic.tag")),
    h("h2", { id: "comic-title", class: "comic-title" }, tx(def.titleKey)),
    h(
      "div",
      { class: "comic-grid" },
      ...def.panelKeys.map((k, i) => {
        const art = document.createElement("template");
        art.innerHTML = def.art?.length ? comicArt(def.art[i], i) : COMIC_ART[i % COMIC_ART.length];
        return h("figure", { class: "comic-cell" }, art.content.firstElementChild as SVGElement, h("figcaption", {}, tx(k)));
      }),
    ),
    h("p", { class: "muted small" }, t("comic.conceptual")),
    h("div", { class: "row end" }, h("button", { class: "btn btn-primary btn-lg", id: "comic-continue", autofocus: true, onclick: onContinue }, t("app.continue"))),
  );
}

/** Steps for the handheld checklist, with their status. */
export function checklistItems(m: MissionDef, ctrl: MissionController) {
  const current = ctrl.current();
  return visibleSteps(m, ctrl.st, ctrl.ctx).map((s) => ({
    step: s,
    status: ctrl.isDone(s.id) ? ("done" as const) : current?.id === s.id ? ("current" as const) : ("locked" as const),
  }));
}
