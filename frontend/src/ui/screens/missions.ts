import { ApiError, get, post } from "../../api/client";
import type { MissionGrid, SessionInfo, LevelEntry } from "../../api/types";
import { navigate } from "../../app/nav";
import { t } from "../../i18n";
import { confirmDialog, h, toast } from "../dom";
import type { Screen } from "../router";
import { errorText, outcomeLabel, page, pageHeader } from "./common";

export async function startMission(missionId: string): Promise<void> {
  try {
    const s = await post<SessionInfo>("/sessions", { missionId });
    navigate(`/play/${s.id}`);
  } catch (e) {
    if (e instanceof ApiError && e.code === "OPEN_SESSION_EXISTS") {
      const details = e.details as { sessionId: string };
      const abandon = await confirmDialog(t("menu.openSessionBody"), t("menu.abandonAndStart"), t("menu.continue"));
      if (!abandon) {
        navigate(`/play/${details.sessionId}`);
        return;
      }
      try {
        const s = await post<SessionInfo>("/sessions", { missionId, abandonOpen: true });
        navigate(`/play/${s.id}`);
      } catch (e2) {
        toast(errorText(e2), "error");
      }
      return;
    }
    toast(errorText(e), "error");
  }
}

function levelCard(lv: LevelEntry): HTMLElement {
  const status = h("span", { class: `badge ${lv.status}` }, t(`missions.status.${lv.status}`));
  const children: (Node | null)[] = [h("span", { class: "lvl" }, t(`level.${lv.level}.name`)), status];
  if (lv.status === "available" && lv.missionId) {
    children.push(h("span", { class: "ttl" }, t(lv.titleKey!)), h("span", { class: "muted small" }, t(lv.subtitleKey!)));
    if (lv.attempts) {
      children.push(h("span", { class: "small" }, t("missions.attempts", { count: lv.attempts })));
      if (lv.bestScore !== null && lv.bestScore !== undefined) children.push(h("span", { class: "small" }, t("missions.best", { score: lv.bestScore, outcome: outcomeLabel(lv.bestOutcome) })));
    }
    children.push(h("button", { class: "btn btn-primary", "data-mission": lv.missionId, onclick: () => void startMission(lv.missionId!) }, t("missions.play")));
  } else if (lv.status === "locked") {
    children.push(h("span", { class: "muted small" }, t(`missions.lockedReason.${lv.reason ?? "previous_level"}`)));
  } else {
    // Never present unavailable content as a finished mission.
    children.push(h("span", { class: "muted small" }, t("missions.upcomingNote")));
  }
  return h("div", { class: `level-card ${lv.status}`, "data-level": lv.level }, ...children);
}

export async function missionsScreen(): Promise<Screen> {
  const grid = await get<MissionGrid>("/missions");
  const playable = grid.categories.flatMap((c) => c.levels).filter((l) => l.status === "available").length;
  // Categories with playable content first, catalogue order otherwise.
  const cats = [...grid.categories].sort((a, b) => Number(b.levels.some((l) => l.missionId)) - Number(a.levels.some((l) => l.missionId)));
  return page([
    pageHeader(t("missions.title"), "/menu", h("button", { class: "btn", onclick: () => navigate("/setup/industry") }, t("missions.changeProfile"))),
    grid.demoUnlockAll ? h("p", { class: "notice orange", id: "demo-unlock-banner" }, t("missions.demoUnlock")) : null,
    h("p", { class: "muted" }, t("missions.subtitle", { designation: t(`designation.${grid.designation}`), industry: t(`industry.${grid.industry}.name`) }), " · ", t("missions.playableCount", { count: playable })),
    ...cats.map((c) => h("section", { class: "panel cat-block", "data-category": c.category }, h("h2", {}, t(`category.${c.category}`)), h("div", { class: "levels" }, ...c.levels.map(levelCard)))),
    h("p", { class: "notice" }, t("mission.common.provisionalNotice")),
  ]);
}
