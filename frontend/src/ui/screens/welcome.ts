import { changeLanguage } from "../../app/auth";
import { navigate } from "../../app/nav";
import { getSettings, updateSettings, type Settings } from "../../app/settings";
import { store } from "../../app/store";
import { audio } from "../../game/audio/AudioManager";
import { currentLanguage, LANGUAGES, t } from "../../i18n";
import { logoMark } from "../art";
import { h } from "../dom";
import type { Screen } from "../router";
import { page, pageHeader } from "./common";

export function languageSwitch(): HTMLElement {
  return h(
    "div",
    { class: "lang-switch", role: "group", "aria-label": t("settings.language") },
    ...LANGUAGES.map((l) =>
      h("button", { lang: l.id, "aria-pressed": String(currentLanguage() === l.id), onclick: () => void changeLanguage(l.id) }, l.label),
    ),
  );
}

export function welcomeScreen(): Screen {
  const menu = h(
    "nav",
    { class: "welcome-menu", "aria-label": t("app.name") },
    h("button", { class: "btn btn-primary btn-lg", onclick: () => navigate("/login?portal=trainee"), autofocus: true }, t("welcome.traineeLogin")),
    h("button", { class: "btn btn-blue btn-lg", onclick: () => navigate("/login?portal=admin") }, t("welcome.adminLogin")),
    h("button", { class: "btn", onclick: () => navigate("/instructions") }, t("welcome.instructions")),
    h("button", { class: "btn", onclick: () => navigate("/settings") }, t("welcome.settings")),
    h("button", { class: "btn", onclick: () => navigate("/about") }, t("welcome.about")),
  );
  const s = page(
    [
      logoMark(),
      h("div", {}, h("div", { class: "tagline" }, t("app.tagline")), h("h1", { class: "display", tabindex: "-1" }, t("app.name")), h("p", { class: "subtitle" }, t("app.subtitle"))),
      menu,
      languageSwitch(),
      h("p", { class: "muted small" }, t("welcome.version"), " · ", t("app.disclaimer")),
    ],
    "center welcome",
  );
  return s;
}

export function aboutScreen(): Screen {
  return page([
    pageHeader(t("about.title"), store.me ? "/menu" : "/welcome"),
    h("section", { class: "panel" }, h("p", {}, t("about.body")), h("p", {}, t("about.body2")), h("p", { class: "muted small" }, t("about.credits"))),
    h("p", { class: "notice" }, t("app.disclaimer")),
  ]);
}

export function instructionsContent(): HTMLElement {
  const keys = ["move", "look", "interact", "checklist", "toolbox", "map", "instructions", "hint", "pause"];
  return h(
    "div",
    { class: "grid grid-2" },
    h("section", { class: "panel" }, h("h2", {}, t("instructions.controlsTitle")), h("ul", {}, ...keys.map((k) => h("li", {}, t(`instructions.controls.${k}`))))),
    h("section", { class: "panel" }, h("h2", {}, t("instructions.howTitle")), h("ol", {}, ...[1, 2, 3, 4, 5].map((n) => h("li", {}, t(`instructions.how.${n}`))))),
  );
}

export function instructionsScreen(): Screen {
  return page([pageHeader(t("instructions.title"), store.me ? "/menu" : "/welcome"), instructionsContent(), h("p", { class: "notice" }, t("mission.common.provisionalNotice"))]);
}

/** Reusable settings form (also embedded in the in-game pause menu). */
export function settingsPanel(): HTMLElement {
  const s = getSettings();
  const slider = (key: keyof Settings, label: string) => {
    const id = `set-${key}`;
    const out = h("output", { for: id }, `${Math.round((s[key] as number) * 100)}%`);
    const input = h("input", { id, type: "range", min: "0", max: "1", step: "0.05", value: String(s[key]) });
    input.addEventListener("input", () => {
      const v = Number(input.value);
      updateSettings({ [key]: v } as Partial<Settings>);
      out.textContent = `${Math.round(v * 100)}%`;
    });
    return h("div", { class: "slider-row" }, h("label", { for: id }, label), input, out);
  };
  const check = (key: keyof Settings, label: string) => {
    const input = h("input", { type: "checkbox" });
    input.checked = Boolean(s[key]);
    input.addEventListener("change", () => updateSettings({ [key]: input.checked } as Partial<Settings>));
    return h("label", { class: "check-row" }, input, label);
  };
  const sens = h("input", { id: "set-sens", type: "range", min: "0.2", max: "3", step: "0.1", value: String(s.sensitivity) });
  const sensOut = h("output", {}, s.sensitivity.toFixed(1));
  sens.addEventListener("input", () => {
    updateSettings({ sensitivity: Number(sens.value) });
    sensOut.textContent = Number(sens.value).toFixed(1);
  });
  const quality = h(
    "select",
    { id: "set-quality" },
    ...(["low", "medium", "high"] as const).map((q) => {
      const o = h("option", { value: q }, t(`settings.quality${q[0].toUpperCase()}${q.slice(1)}`));
      o.selected = s.quality === q;
      return o;
    }),
  );
  quality.addEventListener("change", () => updateSettings({ quality: quality.value as Settings["quality"] }));

  return h(
    "div",
    { class: "grid grid-2" },
    h("section", { class: "panel" }, h("h2", {}, t("settings.language")), languageSwitch(), h("p", { class: "muted small" }, t("settings.translationNote"))),
    h(
      "section",
      { class: "panel" },
      h("h2", {}, t("settings.audio")),
      slider("master", t("settings.master")),
      slider("effects", t("settings.effects")),
      slider("ambient", t("settings.ambient")),
      slider("narration", t("settings.narration")),
      check("narrationEnabled", t("settings.narrationOn")),
      check("muted", t("settings.mute")),
      check("captions", t("settings.captions")),
      h("button", { class: "btn", onclick: () => { audio.unlock(); audio.play("complete"); } }, t("settings.testSound")),
    ),
    h(
      "section",
      { class: "panel" },
      h("h2", {}, t("settings.controls")),
      h("div", { class: "slider-row" }, h("label", { for: "set-sens" }, t("settings.sensitivity")), sens, sensOut),
      check("invertY", t("settings.invertY")),
    ),
    h(
      "section",
      { class: "panel" },
      h("h2", {}, t("settings.graphics")),
      h("div", { class: "field" }, h("label", { for: "set-quality" }, t("settings.quality")), quality),
      check("showFps", t("settings.showFps")),
    ),
  );
}

export function settingsScreen(): Screen {
  return page([pageHeader(t("settings.title"), store.me ? "/menu" : "/welcome"), settingsPanel()]);
}
