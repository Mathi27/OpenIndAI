// Mission play route: validates/restores the session, loads the scenario
// variant, and mounts the Babylon.js game. Failures show a recovery screen.
import { ApiError, get } from "../../api/client";
import type { SessionInfo, StoredEvent } from "../../api/types";
import { navigate } from "../../app/nav";
import { t } from "../../i18n";
import type { MissionDef } from "../../mission/types";
import { h } from "../dom";
import type { Screen } from "../router";
import { errorText, page, pageHeader } from "./common";

function fatal(title: string, message: string, back = "/menu"): Screen {
  return page([pageHeader(title), h("div", { class: "panel" }, h("p", { role: "alert" }, message), h("div", { class: "row" }, h("button", { class: "btn btn-primary", onclick: () => navigate(back) }, t("app.back")), h("button", { class: "btn", onclick: () => location.reload() }, t("app.retry"))))]);
}

export async function playScreen(params: Record<string, string>): Promise<Screen> {
  const id = params.sessionId;
  if (!/^[0-9a-f-]{36}$/.test(id)) return fatal(t("error.SESSION_NOT_FOUND"), t("error.SESSION_NOT_FOUND"));
  let session: SessionInfo;
  let events: StoredEvent[];
  let mission: MissionDef;
  try {
    const data = await get<{ session: SessionInfo; events: StoredEvent[] }>(`/sessions/${id}`);
    session = data.session;
    events = data.events;
    if (session.state === "ASSESSED") {
      navigate(`/results/${id}`, true);
      return { el: h("div") };
    }
    mission = await get<MissionDef>(`/sessions/${id}/mission`);
  } catch (e) {
    const code = e instanceof ApiError ? e.code : "";
    return fatal(t("notify.restoreFailed"), errorText(e), code.startsWith("SESSION") ? "/missions" : "/menu");
  }
  const { GameApp, WebGLUnavailableError } = await import("../../game/GameApp");
  const { hasWorld } = await import("../../game/world/registry");
  if (!hasWorld(mission.scene.id)) return fatal(t("notify.sceneFailed"), t("notify.worldMissing", { world: mission.scene.id }));
  const host = h("div", { class: "play-host" });
  let app: Awaited<ReturnType<typeof GameApp.create>> | null = null;
  const screen: Screen = {
    el: host,
    handlesLanguage: true,
    dispose: () => app?.dispose(),
  };
  // Mount after the router has attached the host element.
  queueMicrotask(async () => {
    try {
      app = await GameApp.create({ root: host, mission, session, history: events, navigate: (p) => navigate(p) });
    } catch (e) {
      app?.dispose();
      const msg = e instanceof WebGLUnavailableError ? t("notify.webglFailed") : `${t("notify.sceneFailed")} ${String((e as Error)?.message ?? "")}`;
      console.error(e);
      host.replaceChildren(fatal(t("notify.sceneFailed"), msg).el);
    }
  });
  return screen;
}
