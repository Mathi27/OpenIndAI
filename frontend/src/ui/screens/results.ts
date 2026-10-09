// Scenes 15–20: performance review → knowledge check (MCQ) → explanations →
// remediation → completion → return to hub (with a backend read-back).
import { ApiError, get, post } from "../../api/client";
import type { McqQuestion, McqResult, SessionResult } from "../../api/types";
import { getMission } from "../../app/missions";
import { navigate } from "../../app/nav";
import { exists, t } from "../../i18n";
import { formatDuration, h, toast } from "../dom";
import type { Screen } from "../router";
import { errorText, outcomeLabel, page, pageHeader } from "./common";
import { startMission } from "./missions";

type Stage = "review" | "mcq" | "explain" | "remediation" | "complete";
const tx = (k: string, o?: Record<string, unknown>) => (exists(k) ? t(k, o) : k);

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
  const id = params.sessionId;
  const res = await get<SessionResult>(`/sessions/${encodeURIComponent(id)}/result`);
  const mission = await getMission(res.missionId).catch(() => null);
  const mcqAllowed = res.finalState === "COMPLETED" && res.endReason === "completed";
  let questions: McqQuestion[] = [];
  let mcqResult: McqResult | null = null;
  if (mcqAllowed) {
    const data = await get<{ questions: McqQuestion[]; submitted: McqResult | null }>(`/sessions/${id}/mcq`);
    questions = data.questions;
    mcqResult = data.submitted;
  }
  let stage: Stage = mcqResult ? "explain" : "review";
  const body = h("div", { class: "container", style: "padding:0" });
  const flow = h("div", { class: "flow-steps", "aria-label": "Progress" });

  const stages: { id: Stage; scene: string }[] = [
    { id: "review", scene: "S15" },
    ...(mcqAllowed ? [{ id: "mcq" as Stage, scene: "S16" }, { id: "explain" as Stage, scene: "S17" }] : []),
    { id: "remediation", scene: "S18" },
    { id: "complete", scene: "S19" },
  ];
  const go = (s: Stage) => {
    stage = s;
    render();
    window.scrollTo({ top: 0 });
  };
  const nextOf = (s: Stage): Stage => stages[Math.min(stages.length - 1, stages.findIndex((x) => x.id === s) + 1)].id;

  const render = () => {
    const idx = stages.findIndex((s) => s.id === stage);
    flow.replaceChildren(...stages.map((s, i) => h("span", { class: i === idx ? "on" : i < idx ? "done" : "" }, tx(`scene.${s.scene}`))));
    body.replaceChildren(
      stage === "review" ? review() : stage === "mcq" ? mcq() : stage === "explain" ? explain() : stage === "remediation" ? remediation() : completion(),
    );
    body.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  };

  // ---------------------------------------------------------------- S15 performance review
  const review = () => {
    const c = res.counters;
    const stat = (k: string, v: string | number, bad = false) => h("div", { class: `stat ${bad ? "bad" : ""}` }, h("div", { class: "k" }, k), h("div", { class: "v" }, String(v)));
    const evidenceSteps = ["inspect_status", "inspect_documents", "hazard_awareness", "identify_gap"];
    const evidence = evidenceSteps.filter((s) => res.completedSteps.includes(s)).length;
    const decision = res.criticalCounts && Object.keys(res.criticalCounts).length
      ? `${t("results.unsafeFirst")}${res.completedSteps.includes("decision_no_go") ? ` → ${t("results.correctedTo")}` : ""}`
      : res.completedSteps.includes("decision_no_go") ? t("results.correctDecision") : t("results.noDecision");
    return h(
      "section",
      { class: "container", style: "padding:0" },
      h("section", { class: "panel result-hero", "data-outcome": res.outcome }, mission ? h("h2", { tabindex: "-1" }, t(mission.titleKey)) : null, scoreRing(res.score, res.outcome), h("div", { class: `outcome ${res.outcome}`, id: "result-outcome" }, outcomeLabel(res.outcome)), h("span", { class: "muted small" }, t("results.score"), ": ", h("span", { id: "result-score" }, String(res.score)), " / 100")),
      c.criticalErrors > 0 ? h("p", { class: "notice red" }, t("results.criticalNote")) : null,
      h(
        "section",
        { class: "stats" },
        stat(t("results.totalTime"), formatDuration(res.totalMs)),
        stat(t("results.activeTime"), formatDuration(res.activeMs)),
        stat(t("results.objectives"), `${res.completedRequiredSteps} / ${res.requiredSteps}`),
        stat(t("results.evidence"), `${evidence} / ${evidenceSteps.length}`),
        stat(t("results.hints"), c.hints),
        stat(t("results.mistakes"), c.mistakes, c.mistakes > 0),
        stat(t("results.invalidActions"), c.invalidActions, c.invalidActions > 0),
        stat(t("results.critical"), c.criticalErrors, c.criticalErrors > 0),
        stat(t("results.retries"), res.retryCount + 1),
      ),
      h("section", { class: "panel" }, h("h3", {}, t("results.decisionOutcome")), h("p", { id: "result-decision" }, decision)),
      res.debriefKeys?.length ? h("section", { class: "panel" }, h("h3", {}, t("results.debrief")), h("ul", {}, ...res.debriefKeys.map((k) => h("li", {}, tx(k))))) : null,
      h("p", { class: "muted small" }, t("results.recordedNote")),
      h("div", { class: "row end" }, h("button", { class: "btn btn-primary btn-lg", id: "flow-next", onclick: () => go(nextOf("review")) }, mcqAllowed ? t("results.toMcq") : t("app.continue"))),
    );
  };

  // ---------------------------------------------------------------- S16 knowledge check
  const answers = new Map<string, string>();
  const mcq = () => {
    const err = h("p", { class: "form-error", role: "alert" });
    const submit = h("button", { class: "btn btn-primary btn-lg", id: "mcq-submit", type: "submit" }, t("mcqUi.submit"));
    const form = h(
      "form",
      { class: "container", style: "padding:0", novalidate: true },
      h("h2", { tabindex: "-1" }, t("mcqUi.title")),
      h("p", { class: "notice" }, t("mcqUi.reviewNote")),
      ...questions.map((q, qi) =>
        h(
          "fieldset",
          { class: "panel mcq-q", "data-question": q.id },
          h("legend", { style: "font-weight:700;padding:0 6px" }, `${qi + 1}. ${tx(q.stemKey)}`),
          ...q.options.map((o) => {
            const input = h("input", { type: "radio", name: q.id, value: o.id, "data-option": o.id });
            input.checked = answers.get(q.id) === o.id;
            input.addEventListener("change", () => answers.set(q.id, o.id));
            return h("label", { class: "mcq-opt" }, input, h("span", {}, tx(o.textKey)));
          }),
        ),
      ),
      err,
      h("div", { class: "row end" }, submit),
    );
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (questions.some((q) => !answers.has(q.id))) {
        err.textContent = t("mcqUi.answerAll");
        return;
      }
      submit.disabled = true; // prevents duplicate submissions from double clicks
      try {
        mcqResult = await post<McqResult>(`/sessions/${id}/mcq`, { answers: Object.fromEntries(answers) });
        go("explain");
      } catch (ex) {
        if (ex instanceof ApiError && ex.code === "MCQ_ALREADY_SUBMITTED") {
          mcqResult = (await get<{ submitted: McqResult }>(`/sessions/${id}/mcq`)).submitted;
          toast(t("mcqUi.alreadySubmitted"), "info");
          go("explain");
          return;
        }
        err.textContent = errorText(ex);
        submit.disabled = false;
      }
    });
    return form;
  };

  // ---------------------------------------------------------------- S17 explanations
  const explain = () => {
    const r = mcqResult!;
    return h(
      "section",
      { class: "container", style: "padding:0" },
      h("h2", { tabindex: "-1" }, t("mcqUi.resultsTitle")),
      h("div", { class: `panel ${r.passed ? "" : "block-panel"}` }, h("strong", { id: "mcq-score" }, t("mcqUi.score", { correct: r.correct, total: r.total })), " · ", r.passed ? t("mcqUi.passed") : t("mcqUi.notPassed")),
      ...r.questions.map((q, i) =>
        h(
          "section",
          { class: "panel mcq-q", "data-question": q.id, "data-correct": String(q.isCorrect) },
          h("h3", {}, `${i + 1}. ${tx(q.stemKey)}`),
          ...q.options.map((o) => h("div", { class: `mcq-opt ${o.id === q.correct ? "correct" : o.id === q.chosen ? "wrong" : ""}` }, o.id === q.correct ? "✓ " : o.id === q.chosen ? "✗ " : "", tx(o.textKey), o.id === q.chosen ? h("span", { class: "muted small" }, ` — ${t("mcqUi.yourAnswer")}`) : null)),
          h("p", {}, h("strong", {}, t("mcqUi.explanation"), ": "), tx(q.explanationKey)),
          h("p", { class: "muted small" }, t("mcqUi.references"), ": ", q.referenceIds.join(", "), " — ", t("mcqUi.unverifiedRefs")),
        ),
      ),
      h("div", { class: "row end" }, h("button", { class: "btn btn-primary btn-lg", id: "flow-next", onclick: () => go("remediation") }, t("app.continue"))),
    );
  };

  // ---------------------------------------------------------------- S18 remediation
  const remediation = () => {
    const learning = mcqResult?.learning ?? res.learning ?? null;
    const concepts = learning?.conceptsToReview ?? res.missedConcepts;
    const met = learning?.criteriaMet ?? false;
    const nextVariant = learning?.remediation?.nextVariant;
    return h(
      "section",
      { class: "container", style: "padding:0" },
      h("h2", { tabindex: "-1" }, t("remediation.title")),
      met
        ? h("div", { class: "panel", id: "remediation-status", "data-met": "true" }, h("p", { class: "verified" }, "✓ ", t("remediation.criteriaMet")), h("p", {}, t("remediation.eligible")))
        : h(
            "div",
            { class: "panel block-panel", id: "remediation-status", "data-met": "false" },
            h("p", {}, mcqAllowed ? t("remediation.notMet") : t("remediation.notCompleted")),
            concepts.length ? h("ul", {}, ...concepts.map((c) => h("li", {}, tx(`concept.${c}`)))) : null,
            nextVariant && mission ? h("p", {}, t("remediation.recommend", { variant: tx(mission.variants.find((v) => v.id === nextVariant)?.labelKey ?? nextVariant) })) : h("p", {}, t("remediation.recommendRetry")),
            learning?.remediation?.suggestPip ? h("p", { class: "muted small" }, t("remediation.suggestPip")) : null,
          ),
      met && concepts.length ? h("div", { class: "panel" }, h("p", {}, t("remediation.alsoReview")), h("ul", {}, ...concepts.map((c) => h("li", {}, tx(`concept.${c}`))))) : null,
      h("div", { class: "row end" }, h("button", { class: "btn", onclick: () => void startMission(res.missionId) }, t("results.retry")), h("button", { class: "btn btn-primary btn-lg", id: "flow-next", onclick: () => go("complete") }, t("app.continue"))),
    );
  };

  // ---------------------------------------------------------------- S19 completion + S20 return to hub
  const completion = () => {
    const c = res.counters;
    const learning = mcqResult?.learning ?? res.learning ?? null;
    const achievements: string[] = [];
    if (res.finalState === "COMPLETED") achievements.push(t("achievement.completed"));
    if (c.criticalErrors === 0 && res.finalState === "COMPLETED") achievements.push(t("achievement.noCritical"));
    if (c.hints === 0 && res.finalState === "COMPLETED") achievements.push(t("achievement.noHints"));
    if (res.completedSteps.includes("identify_gap")) achievements.push(t("achievement.foundGap"));
    if (mcqResult && mcqResult.correct === mcqResult.total) achievements.push(t("achievement.perfectQuiz"));
    const verify = h("p", { class: "muted", id: "persist-status", "aria-live": "polite" }, t("hub.verifying"));
    const back = h("button", { class: "btn btn-primary btn-lg", id: "return-hub", onclick: () => navigate("/menu") }, t("hub.return"));
    // Confirm persistence through an actual backend read, never by assumption.
    void (async () => {
      try {
        const prog = await get<{ missions: { mission_id: string; attempts: number; passed: number; learning_met: number }[]; sessions: { id: string; outcome: string | null }[] }>("/progress");
        const sess = prog.sessions.find((s) => s.id === id);
        const row = prog.missions.find((m) => m.mission_id === res.missionId);
        if (sess?.outcome === res.outcome && row) {
          verify.className = "verified";
          verify.dataset.verified = "true";
          verify.textContent = `✓ ${t("hub.saved", { attempts: row.attempts })}`;
        } else throw new Error("mismatch");
      } catch {
        verify.className = "form-error";
        verify.textContent = t("hub.notVerified");
      }
    })();
    return h(
      "section",
      { class: "container", style: "padding:0" },
      h("h2", { tabindex: "-1" }, t("completion.title")),
      h("section", { class: "panel" }, h("h3", {}, t("completion.summary")), h("p", {}, mission ? t(mission.titleKey) : res.missionId, " — ", outcomeLabel(res.outcome), ` · ${res.score}/100`), mcqResult ? h("p", {}, t("mcqUi.score", { correct: mcqResult.correct, total: mcqResult.total })) : null, h("p", { id: "learning-status" }, h("strong", {}, t("completion.learningStatus"), ": "), learning?.criteriaMet ? t("completion.learningMet") : t("completion.learningNotMet"))),
      achievements.length ? h("section", { class: "panel" }, h("h3", {}, t("completion.achievements")), h("div", { class: "achievements" }, ...achievements.map((a) => h("span", { class: "achievement" }, a)))) : null,
      h("p", { class: "notice" }, t("completion.noQualification")),
      verify,
      h("div", { class: "row end" }, h("button", { class: "btn", id: "result-retry", onclick: () => void startMission(res.missionId) }, t("results.retry")), h("button", { class: "btn", onclick: () => navigate("/missions") }, t("results.back")), back),
    );
  };

  render();
  return page([pageHeader(t("results.title"), "/missions"), flow, body]);
}

