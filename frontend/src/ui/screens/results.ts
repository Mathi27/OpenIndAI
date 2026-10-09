import { get } from "../../api/client";
import type { SessionResult } from "../../api/types";
import { getMission } from "../../app/missions";
import { navigate } from "../../app/nav";
import { t } from "../../i18n";
import { formatDuration, h } from "../dom";
import type { Screen } from "../router";
import { outcomeLabel, page, pageHeader } from "./common";
import { startMission } from "./missions";

function scoreRing(score: number, outcome: string): SVGSVGElement {
  const r = 60;
  const c = 2 * Math.PI * r;
  const color = outcome === "mastery" || outcome === "pass" ? "#3ddc84" : outcome === "needs_practice" || outcome === "abandoned" ? "#ffc23d" : "#ff5a5f";
  const tpl = document.createElement("template");
  tpl.innerHTML = `<svg class="score-ring" viewBox="0 0 150 150" role="img" aria-label="${score}/100">
    <circle cx="75" cy="75" r="${r}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="12"/>
    <circle cx="75" cy="75" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - score / 100)}" transform="rotate(-90 75 75)"/>
    <text x="75" y="84" text-anchor="middle" font-size="34" font-weight="800" fill="#e8f0fb">${score}</text></svg>`;
  return tpl.content.firstElementChild as SVGSVGElement;
}

export async function resultsScreen(params: Record<string, string>): Promise<Screen> {
  const res = await get<SessionResult>(`/sessions/${encodeURIComponent(params.sessionId)}/result`);
  const mission = await getMission(res.missionId).catch(() => null);
  const c = res.counters;
  const stat = (k: string, v: string | number, bad = false) => h("div", { class: `stat ${bad ? "bad" : ""}` }, h("div", { class: "k" }, k), h("div", { class: "v" }, String(v)));
  const debriefKey = mission
    ? res.outcome === "not_passed" ? mission.debriefKeys.failed : res.outcome === "critical_error" ? mission.debriefKeys.critical : res.outcome === "abandoned" ? null : mission.debriefKeys.success
    : null;
  return page([
    pageHeader(t("results.title"), "/missions"),
    h(
      "section",
      { class: "panel result-hero", "data-outcome": res.outcome },
      mission ? h("h2", {}, t(mission.titleKey)) : null,
      scoreRing(res.score, res.outcome),
      h("div", { class: `outcome ${res.outcome}`, id: "result-outcome" }, outcomeLabel(res.outcome)),
      h("span", { class: "muted small" }, t("results.score"), ": ", h("span", { id: "result-score" }, String(res.score)), " / 100"),
    ),
    debriefKey ? h("section", { class: "panel" }, h("h2", {}, t("results.debrief")), h("p", {}, t(debriefKey))) : null,
    c.criticalErrors > 0 ? h("p", { class: "notice red" }, t("results.criticalNote")) : null,
    h(
      "section",
      { class: "stats" },
      stat(t("results.status"), t(`hud.state.${res.finalState === "COMPLETED" ? "COMPLETED" : "FAILED"}`)),
      stat(t("results.totalTime"), formatDuration(res.totalMs)),
      stat(t("results.activeTime"), formatDuration(res.activeMs)),
      stat(t("results.objectives"), `${res.completedRequiredSteps} / ${res.requiredSteps}`),
      stat(t("results.mistakes"), c.mistakes, c.mistakes > 0),
      stat(t("results.invalidActions"), c.invalidActions, c.invalidActions > 0),
      stat(t("results.critical"), c.criticalErrors, c.criticalErrors > 0),
      stat(t("results.hints"), c.hints),
      stat(t("results.retries"), res.retryCount + 1),
    ),
    res.missedConcepts.length
      ? h("section", { class: "panel" }, h("h2", {}, t("results.missed")), h("ul", {}, ...res.missedConcepts.map((k) => h("li", {}, t(`concept.${k}`)))))
      : null,
    h(
      "div",
      { class: "row end" },
      h("button", { class: "btn", onclick: () => navigate("/missions") }, t("results.back")),
      h("button", { class: "btn btn-primary", id: "result-retry", onclick: () => void startMission(res.missionId) }, t("results.retry")),
    ),
    h("p", { class: "notice" }, t("app.disclaimer")),
  ]);
}
