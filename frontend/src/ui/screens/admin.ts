import { api, get } from "../../api/client";
import { logout } from "../../app/auth";
import { navigate } from "../../app/nav";
import { t } from "../../i18n";
import { formatDuration, h, toast } from "../dom";
import type { Screen } from "../router";
import { formatDate, outcomeLabel, page, pageHeader } from "./common";
import { languageSwitch } from "./welcome";

interface AdminSettings { demoUnlockAll: boolean; updatedAt: number | null; updatedBy: string | null }
interface TraineeRow { id: number; username: string; display_name: string; industry: string | null; designation: string | null; experience: string | null; pathway: string; sessions: number; passes: number; last_activity: number | null; is_dev_account: number }
interface SessionRow { id: string; username: string; mission_id: string; state: string; experience: string; pathway: string; retry_count: number; started_at: number; score: number | null; outcome: string | null; result: { activeMs: number; counters: Record<string, number> } | null }

export async function adminScreen(_: Record<string, string>, query: URLSearchParams): Promise<Screen> {
  const userId = query.get("user");
  const [settings, trainees, sessions] = await Promise.all([
    get<AdminSettings>("/admin/settings"),
    get<TraineeRow[]>("/admin/trainees"),
    get<SessionRow[]>(`/admin/sessions${userId && /^\d+$/.test(userId) ? `?user_id=${userId}` : ""}`),
  ]);
  const detail = h("pre", { class: "log", hidden: true, "aria-live": "polite" });

  // Demo mode: open every authored level for all trainees (no scores or passes are changed).
  const status = h("p", { class: "muted small", id: "demo-unlock-status" });
  const showStatus = (s: AdminSettings) => {
    status.textContent = s.updatedAt ? t("admin.demoUnlockUpdated", { user: s.updatedBy ?? "—", date: formatDate(s.updatedAt) }) : "";
  };
  showStatus(settings);
  const toggle = h("input", { type: "checkbox", id: "demo-unlock" });
  toggle.checked = settings.demoUnlockAll;
  toggle.addEventListener("change", async () => {
    toggle.disabled = true;
    try {
      const s = await api<AdminSettings>("PUT", "/admin/settings", { demoUnlockAll: toggle.checked });
      toggle.checked = s.demoUnlockAll;
      showStatus(s);
      toast(s.demoUnlockAll ? t("admin.demoUnlockOn") : t("admin.demoUnlockOff"), "success");
    } catch (e) {
      toggle.checked = !toggle.checked;
      toast(String((e as Error).message), "error");
    } finally {
      toggle.disabled = false;
    }
  });
  const demoPanel = h(
    "section",
    { class: "panel" },
    h("h2", {}, t("admin.demoTitle")),
    h("label", { class: "row", for: "demo-unlock", style: "gap:10px;align-items:center;cursor:pointer" }, toggle, h("strong", {}, t("admin.demoUnlockLabel"))),
    h("p", { class: "muted small" }, t("admin.demoUnlockHelp")),
    status,
  );

  const traineeTable = h(
    "table",
    {},
    h("thead", {}, h("tr", {}, ...["admin.username", "admin.name", "admin.role", "admin.experience", "admin.pathway", "admin.sessionsCount", "admin.passes", "admin.lastActivity"].map((k) => h("th", {}, t(k))))),
    h(
      "tbody",
      {},
      ...trainees.map((r) =>
        h(
          "tr",
          {},
          h("td", {}, h("a", { href: `#/admin?user=${r.id}` }, r.username), r.is_dev_account ? h("span", { class: "badge dev", style: "margin-left:6px" }, "dev") : null),
          h("td", {}, r.display_name),
          h("td", {}, r.designation ? t(`designation.${r.designation}`) : "—"),
          h("td", {}, r.experience ? t(`experience.${r.experience}.name`) : "—"),
          h("td", {}, t(`pathway.${r.pathway}.name`)),
          h("td", {}, String(r.sessions)),
          h("td", {}, String(r.passes)),
          h("td", {}, formatDate(r.last_activity)),
        ),
      ),
    ),
  );

  const sessionTable = sessions.length
    ? h(
        "table",
        {},
        h("thead", {}, h("tr", {}, ...["progress.date", "admin.username", "progress.mission", "progress.outcome", "progress.score", "results.activeTime", "results.critical", "admin.details"].map((k) => h("th", {}, t(k))))),
        h(
          "tbody",
          {},
          ...sessions.map((s) => {
            const btn = h("button", { class: "btn btn-ghost", onclick: async () => {
              const d = await get<{ events: { seq: number; type: string; target: string | null; value: string | null; outcome: string; server_ts: number }[] }>(`/admin/sessions/${s.id}`);
              detail.hidden = false;
              detail.textContent = `${t("admin.events")} — ${s.id}\n` + d.events.map((e) => `#${e.seq} ${new Date(e.server_ts * 1000).toLocaleTimeString()} ${e.type}${e.target ? ` ${e.target}` : ""}${e.value ? ` =${e.value}` : ""} → ${e.outcome}`).join("\n");
              detail.scrollIntoView({ behavior: "smooth" });
            } }, t("admin.details"));
            return h(
              "tr",
              {},
              h("td", {}, formatDate(s.started_at)),
              h("td", {}, s.username),
              h("td", {}, s.mission_id),
              h("td", {}, s.outcome ? outcomeLabel(s.outcome) : t(`hud.state.${s.state}`)),
              h("td", {}, s.score ?? "—"),
              h("td", {}, s.result ? formatDuration(s.result.activeMs) : "—"),
              h("td", {}, s.result ? String(s.result.counters.criticalErrors) : "—"),
              h("td", {}, btn),
            );
          }),
        ),
      )
    : h("p", { class: "muted" }, t("admin.noData"));

  return page([
    pageHeader(t("admin.title"), undefined, h("div", { class: "row" }, languageSwitch(), h("button", { class: "btn", id: "admin-logout", onclick: async () => { await logout(); navigate("/welcome", true); } }, t("menu.logout")))),
    demoPanel,
    h("section", { class: "panel table-wrap" }, h("h2", {}, t("admin.trainees")), traineeTable),
    h("section", { class: "panel table-wrap" }, h("div", { class: "row between" }, h("h2", {}, t("admin.sessions")), userId ? h("a", { href: "#/admin" }, t("admin.filterAll")) : null), sessionTable, detail),
    h("p", { class: "muted small" }, t("app.disclaimer")),
  ]);
}
