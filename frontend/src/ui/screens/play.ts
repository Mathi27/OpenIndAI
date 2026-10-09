// TEMPORARY placeholder until the Babylon.js game module is wired in.
import { navigate } from "../../app/nav";
import { t } from "../../i18n";
import { h } from "../dom";
import type { Screen } from "../router";
import { page, pageHeader } from "./common";

export function playScreen(params: Record<string, string>): Screen {
  return page([
    pageHeader(t("hud.mission"), "/missions"),
    h("div", { class: "panel" }, h("p", {}, "3D training world is under construction."), h("p", { class: "muted small" }, `Session ${params.sessionId}`),
      h("button", { class: "btn", onclick: () => navigate("/menu") }, t("app.back"))),
  ]);
}
