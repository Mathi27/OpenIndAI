import { get } from "../../api/client";
import type { SessionInfo } from "../../api/types";
import { logout } from "../../app/auth";
import { getMission } from "../../app/missions";
import { navigate } from "../../app/nav";
import { nextSetupRoute } from "../../app/profileLogic";
import { store } from "../../app/store";
import { t } from "../../i18n";
import { h, toast } from "../dom";
import type { Screen } from "../router";
import { formatDate, outcomeLabel, page, pageHeader } from "./common";
import { languageSwitch } from "./welcome";

function tile(title: string, sub: string, onClick: () => void, opts: { primary?: boolean; disabled?: boolean; id?: string } = {}): HTMLButtonElement {
  return h(
    "button",
    { class: `btn menu-tile ${opts.primary ? "primary" : ""}`, onclick: onClick, disabled: opts.disabled ?? false, id: opts.id },
    h("span", { class: "tile-title" }, title),
    h("span", { class: "tile-sub" }, sub),
  );
}

export async function menuScreen(): Promise<Screen> {
  const me = store.me!;
  const setup = nextSetupRoute(me.profile);
  let open: SessionInfo | null = null;
  try {
    open = await get<SessionInfo | null>("/sessions/open");
  } catch {
    open = null;
  }
  let openTitle = "";
  if (open) {
    try {
      openTitle = t((await getMission(open.missionId)).titleKey);
    } catch {
      openTitle = open.missionId;
    }
  }
  const p = me.profile;
  const profileLine = p.complete
    ? `${t(`designation.${p.designation}`)} · ${t(`industry.${p.industry}.name`)} · ${t(`experience.${p.experience}.name`)} · ${t(`pathway.${p.pathway}.name`)}`
    : t("menu.setupNeeded");

  const grid = h(
    "nav",
    { class: "menu-grid", "aria-label": "Main menu" },
    tile(t("menu.start"), profileLine, () => navigate(setup ?? "/missions"), { primary: true, id: "menu-start" }),
    tile(t("menu.continue"), open ? t("menu.continueDesc", { mission: openTitle }) : t("menu.continueNone"), () => open && navigate(`/play/${open.id}`), { disabled: !open, id: "menu-continue" }),
    tile(t("menu.instructions"), t("instructions.controlsTitle"), () => navigate("/instructions")),
    tile(t("menu.progress"), t("progress.history"), () => navigate("/progress")),
    tile(t("menu.profile"), me.user.username, () => navigate("/profile")),
    tile(t("menu.settings"), t("settings.audio") + " · " + t("settings.graphics"), () => navigate("/settings")),
    tile(t("menu.logout"), me.user.displayName, async () => {
      await logout();
      toast(t("auth.loggedOut"));
      navigate("/welcome", true);
    }, { id: "menu-logout" }),
  );
  return page([
    pageHeader(t("menu.greeting", { name: me.user.displayName }), undefined, languageSwitch()),
    me.user.isDevAccount ? h("span", { class: "badge dev" }, t("app.devAccount")) : null,
    setup ? h("p", { class: "notice orange" }, t("menu.setupNeeded")) : null,
    grid,
    h("p", { class: "muted small" }, t("app.disclaimer")),
  ]);
}

export function profileScreen(): Screen {
  const me = store.me!;
  const p = me.profile;
  const ns = t("profile.notSet");
  const row = (k: string, v: string) => h("tr", {}, h("th", { scope: "row" }, k), h("td", {}, v));
  return page([
    pageHeader(t("profile.title"), "/menu"),
    h(
      "div",
      { class: "grid grid-2" },
      h("section", { class: "panel" }, h("h2", {}, t("profile.account")), h("table", {}, h("tbody", {}, row(t("auth.displayName"), me.user.displayName), row(t("auth.username"), me.user.username)))),
      h(
        "section",
        { class: "panel" },
        h("h2", {}, t("profile.training")),
        h(
          "table",
          {},
          h(
            "tbody",
            {},
            row(t("setup.stepIndustry"), p.industry ? t(`industry.${p.industry}.name`) : ns),
            row(t("setup.stepDesignation"), p.designation ? t(`designation.${p.designation}`) : ns),
            row(t("setup.experienceLabel"), p.experience ? t(`experience.${p.experience}.name`) : ns),
            row(t("setup.pathwayLabel"), t(`pathway.${p.pathway}.name`)),
            row(t("settings.language"), { en: "English", ta: "தமிழ்", hi: "हिन्दी" }[p.language]),
          ),
        ),
        h("button", { class: "btn", onclick: () => navigate("/setup/industry") }, t("profile.edit")),
      ),
    ),
  ]);
}

export async function progressScreen(): Promise<Screen> {
  const data = await get<{ missions: { mission_id: string; attempts: number; best_score: number | null; best_outcome: string | null; passed: number }[]; sessions: { id: string; missionId: string; state: string; score: number | null; outcome: string | null; startedAt: number; retryCount: number }[] }>("/progress");
  const titles = new Map<string, string>();
  for (const id of new Set([...data.missions.map((m) => m.mission_id), ...data.sessions.map((s) => s.missionId)])) {
    try {
      titles.set(id, t((await getMission(id)).titleKey));
    } catch {
      titles.set(id, id);
    }
  }
  const summary = data.missions.length
    ? h(
        "table",
        {},
        h("thead", {}, h("tr", {}, h("th", {}, t("progress.mission")), h("th", {}, t("progress.attempts")), h("th", {}, t("progress.best")), h("th", {}, t("progress.outcome")))),
        h("tbody", {}, ...data.missions.map((m) => h("tr", {}, h("td", {}, titles.get(m.mission_id) ?? m.mission_id), h("td", {}, String(m.attempts)), h("td", {}, m.best_score ?? "—"), h("td", {}, outcomeLabel(m.best_outcome))))),
      )
    : h("p", { class: "muted" }, t("progress.empty"));
  const history = data.sessions.length
    ? h(
        "table",
        {},
        h("thead", {}, h("tr", {}, h("th", {}, t("progress.date")), h("th", {}, t("progress.mission")), h("th", {}, t("progress.outcome")), h("th", {}, t("progress.score")), h("th", {}, ""))),
        h(
          "tbody",
          {},
          ...data.sessions.map((s) =>
            h(
              "tr",
              {},
              h("td", {}, formatDate(s.startedAt)),
              h("td", {}, titles.get(s.missionId) ?? s.missionId),
              h("td", {}, s.outcome ? outcomeLabel(s.outcome) : t(`hud.state.${s.state}`)),
              h("td", {}, s.score ?? "—"),
              h("td", {}, s.outcome ? h("a", { href: `#/results/${s.id}` }, t("progress.view")) : h("a", { href: `#/play/${s.id}` }, t("menu.continue"))),
            ),
          ),
        ),
      )
    : h("p", { class: "muted" }, t("progress.empty"));
  return page([
    pageHeader(t("progress.title"), "/menu"),
    h("section", { class: "panel table-wrap" }, h("h2", {}, t("progress.summary")), summary),
    h("section", { class: "panel table-wrap" }, h("h2", {}, t("progress.history")), history),
    h("p", { class: "muted small" }, t("app.disclaimer")),
  ]);
}
