import { saveProfile } from "../../app/auth";
import { navigate } from "../../app/nav";
import { designationsFor, draftFromProfile, findIndustry, selectIndustry } from "../../app/profileLogic";
import { store } from "../../app/store";
import { t } from "../../i18n";
import type { Experience, Pathway } from "../../mission/types";
import { industryArt } from "../art";
import { h, toast } from "../dom";
import type { Screen } from "../router";
import { errorText, page, pageHeader } from "./common";

function stepper(active: 1 | 2 | 3): HTMLElement {
  const items = [t("setup.stepIndustry"), t("setup.stepDesignation"), t("setup.stepExperience")];
  return h(
    "ol",
    { class: "stepper", "aria-label": "Setup progress", style: "list-style:none;padding:0;margin:0" },
    ...items.map((label, i) => h("li", { class: i + 1 === active ? "on" : "", "aria-current": i + 1 === active ? "step" : undefined }, `${i + 1}. ${label}`, i < 2 ? "  →" : "")),
  );
}

export function industryScreen(): Screen {
  const cat = store.catalogue!;
  const draft = draftFromProfile(store.me!.profile);
  const err = h("p", { class: "form-error", role: "alert" });
  const cards = cat.industries.map((ind) => {
    const name = t(`industry.${ind.id}.name`);
    const card = h(
      "button",
      { class: "card", style: `--accent:${ind.accent}`, "aria-pressed": String(draft.industry === ind.id), "data-industry": ind.id },
      industryArt(ind.id, name),
      h("span", { class: "card-body" }, h("h3", {}, name), h("span", { class: "muted small" }, t(`industry.${ind.id}.desc`)), h("span", { class: "small" }, `${ind.designations.length} · ${t("setup.stepDesignation")}`)),
    );
    card.addEventListener("click", async () => {
      const { designationReset } = selectIndustry(cat, draft, ind.id);
      try {
        await saveProfile({ industry: ind.id });
        if (designationReset) toast(t("setup.designationReset"), "warn");
        navigate("/setup/designation");
      } catch (e) {
        err.textContent = errorText(e);
      }
    });
    return card;
  });
  return page([pageHeader(t("setup.industryTitle"), "/menu"), stepper(1), h("div", { class: "grid grid-3" }, ...cards), err]);
}

export function designationScreen(): Screen {
  const cat = store.catalogue!;
  const p = store.me!.profile;
  const ind = findIndustry(cat, p.industry);
  if (!ind) {
    navigate("/setup/industry", true);
    return page([]);
  }
  const err = h("p", { class: "form-error", role: "alert" });
  const options = designationsFor(cat, ind.id).map((id) => {
    const btn = h(
      "button",
      { class: "choice", "aria-pressed": String(p.designation === id), "data-designation": id },
      h("strong", {}, t(`designation.${id}`)),
      h("span", { class: "muted small" }, `${ind.designations.find((d) => d.id === id)!.categories.length} · ${t("hud.mission")}`),
    );
    btn.addEventListener("click", async () => {
      try {
        await saveProfile({ designation: id });
        navigate("/setup/experience");
      } catch (e) {
        err.textContent = errorText(e);
      }
    });
    return btn;
  });
  return page([
    pageHeader(t("setup.designationTitle"), "/setup/industry"),
    stepper(2),
    h("p", { class: "muted" }, t("setup.designationFor", { industry: t(`industry.${ind.id}.name`) })),
    h("div", { class: "grid grid-2" }, ...options),
    err,
  ]);
}

export function experienceScreen(): Screen {
  const cat = store.catalogue!;
  const p = store.me!.profile;
  if (!p.designation) {
    navigate(p.industry ? "/setup/designation" : "/setup/industry", true);
    return page([]);
  }
  let exp: Experience | null = p.experience;
  let path: Pathway = p.pathway;
  const err = h("p", { class: "form-error", role: "alert" });
  const save = h("button", { class: "btn btn-primary btn-lg", disabled: !exp, id: "setup-save" }, t("setup.finish"));

  const group = <T extends string>(label: string, ids: readonly T[], prefix: string, get: () => T | null, set: (v: T) => void) => {
    const buttons = ids.map((id) => {
      const b = h("button", { class: "choice", "aria-pressed": String(get() === id), "data-choice": id }, h("strong", {}, t(`${prefix}.${id}.name`)), h("span", { class: "muted small" }, t(`${prefix}.${id}.desc`)));
      b.addEventListener("click", () => {
        set(id);
        buttons.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        save.disabled = !exp;
      });
      return b;
    });
    return h("fieldset", { class: "panel", style: "border:1px solid var(--panel-border)" }, h("legend", {}, h("h2", {}, label)), h("div", { class: "grid grid-3" }, ...buttons));
  };

  save.addEventListener("click", async () => {
    if (!exp) return;
    save.disabled = true;
    try {
      await saveProfile({ experience: exp, pathway: path });
      navigate("/missions");
    } catch (e) {
      err.textContent = errorText(e);
      save.disabled = false;
    }
  });

  return page([
    pageHeader(t("setup.experienceTitle"), "/setup/designation"),
    stepper(3),
    h("p", { class: "notice" }, t("setup.guidanceNote")),
    group(t("setup.experienceLabel"), cat.experienceLevels, "experience", () => exp, (v) => (exp = v)),
    group(t("setup.pathwayLabel"), cat.pathways, "pathway", () => path, (v) => (path = v)),
    err,
    h("div", { class: "row end" }, save),
  ]);
}
