import { ApiError } from "../../api/client";
import { exists, t } from "../../i18n";
import { navigate } from "../../app/nav";
import { h } from "../dom";
import type { Screen } from "../router";
import { backdrop } from "../art";

export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === "NETWORK") return t("error.network");
    if (exists(`error.${e.code}`)) return t(`error.${e.code}`);
    return e.message || t("error.generic");
  }
  return t("error.generic");
}

export function pageHeader(title: string, backTo?: string, extra?: Node): HTMLElement {
  return h(
    "header",
    { class: "page-head" },
    h("div", { class: "row" }, backTo ? h("button", { class: "btn btn-ghost", onclick: () => navigate(backTo), "aria-label": t("app.back") }, "← ", t("app.back")) : null, h("h1", { tabindex: "-1" }, title)),
    extra ?? null,
  );
}

export function page(children: (Node | null)[], cls = ""): Screen {
  const el = h("main", { class: `screen ${cls}`, id: "main" }, backdrop(), h("div", { class: "container" }, ...children));
  return { el };
}

export function loadingScreen(): Screen {
  return { el: h("div", { class: "loading" }, backdrop(), h("div", { class: "spinner" }), t("app.loading")) };
}

export function errorScreen(e: unknown, backTo = "/menu"): Screen {
  return page([pageHeader(t("error.generic")), h("div", { class: "panel" }, h("p", { role: "alert" }, errorText(e)), h("button", { class: "btn", onclick: () => navigate(backTo) }, t("app.back")))]);
}

export function outcomeLabel(outcome: string | null | undefined): string {
  return outcome ? t(`results.outcome.${outcome}`) : "—";
}

export function formatDate(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString();
}
