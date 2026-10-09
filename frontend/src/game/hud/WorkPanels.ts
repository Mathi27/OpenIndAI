// Mission-specific work interfaces opened from world objects:
//   document  — fictional training document with inspectable fields (permits, records)
//   station   — evidence review + decision point
//   inventory — PPE store: select items, report defects
//   comms     — site radio / phone: choose who to contact and what to report
//   route     — site emergency plan: choose a route on the plan
// Every button emits a real game event; the engine decides what it means.
import { exists, t } from "../../i18n";
import { h } from "../../ui/dom";
import type { MissionController } from "../../mission/MissionController";
import type { Decision, Interactable, MissionDef } from "../../mission/types";
import type { MapShape } from "../world/types";

const tx = (key: string, opts?: Record<string, unknown>) => (exists(key) ? t(key, opts) : `[${key}]`);

export interface WorkPanelState {
  flagged: Set<string>;
  selected: Set<string>;
  details: string[];
}

export interface WorkPanelHandlers {
  onFlag(id: string): void;
  onSelect(id: string): void;
  onDecide(group: string, value: string): void;
  onClose(): void;
}

const ICONS: Record<string, string> = {
  helmet: '<path d="M8 30q2-20 22-20t22 20z" fill="#f2f2ee" stroke="#111" stroke-width="3"/><rect x="4" y="28" width="52" height="7" rx="3" fill="#f2f2ee" stroke="#111" stroke-width="3"/>',
  helmet_cracked: '<path d="M8 30q2-20 22-20t22 20z" fill="#f2f2ee" stroke="#111" stroke-width="3"/><rect x="4" y="28" width="52" height="7" rx="3" fill="#f2f2ee" stroke="#111" stroke-width="3"/><path d="M26 12l6 8l-5 4l6 6" stroke="#e8423f" stroke-width="3" fill="none"/>',
  goggles: '<rect x="6" y="20" width="22" height="16" rx="6" fill="#9fd3ff" stroke="#111" stroke-width="3"/><rect x="32" y="20" width="22" height="16" rx="6" fill="#9fd3ff" stroke="#111" stroke-width="3"/><path d="M28 28h4" stroke="#111" stroke-width="3"/>',
  glasses: '<circle cx="18" cy="30" r="9" fill="#cfe9ff" stroke="#111" stroke-width="3"/><circle cx="42" cy="30" r="9" fill="#cfe9ff" stroke="#111" stroke-width="3"/><path d="M27 30h6" stroke="#111" stroke-width="3"/>',
  faceshield: '<path d="M14 12h32v30q-16 10-32 0z" fill="rgba(159,211,255,.7)" stroke="#111" stroke-width="3"/><rect x="12" y="8" width="36" height="7" fill="#ffc23d" stroke="#111" stroke-width="3"/>',
  gloves_leather: '<path d="M18 52v-22q0-4 4-4v-12q0-4 4-4t4 4v8q0-4 4-4t4 4v8q0-4 4-4t4 4v18l-6 8z" fill="#d9a441" stroke="#111" stroke-width="3"/>',
  gloves_chem: '<path d="M18 52v-22q0-4 4-4v-12q0-4 4-4t4 4v8q0-4 4-4t4 4v8q0-4 4-4t4 4v18l-6 8z" fill="#2f9e5b" stroke="#111" stroke-width="3"/>',
  gloves_cotton: '<path d="M18 52v-22q0-4 4-4v-12q0-4 4-4t4 4v8q0-4 4-4t4 4v8q0-4 4-4t4 4v18l-6 8z" fill="#f2f2ee" stroke="#111" stroke-width="3"/>',
  gloves_torn: '<path d="M18 52v-22q0-4 4-4v-12q0-4 4-4t4 4v8q0-4 4-4t4 4v8q0-4 4-4t4 4v18l-6 8z" fill="#2f9e5b" stroke="#111" stroke-width="3"/><path d="M26 34l6 4l-4 4l6 4" stroke="#e8423f" stroke-width="3" fill="none"/>',
  gloves_insulated: '<path d="M18 52v-22q0-4 4-4v-12q0-4 4-4t4 4v8q0-4 4-4t4 4v8q0-4 4-4t4 4v18l-6 8z" fill="#e8423f" stroke="#111" stroke-width="3"/>',
  earmuff: '<path d="M14 34q0-24 16-24t16 24" fill="none" stroke="#111" stroke-width="4"/><rect x="6" y="28" width="14" height="18" rx="5" fill="#e8423f" stroke="#111" stroke-width="3"/><rect x="40" y="28" width="14" height="18" rx="5" fill="#e8423f" stroke="#111" stroke-width="3"/>',
  respirator: '<path d="M12 22q18-12 36 0v14q-18 14-36 0z" fill="#e9eef5" stroke="#111" stroke-width="3"/><circle cx="20" cy="34" r="6" fill="#ff7a1a" stroke="#111" stroke-width="2"/><circle cx="40" cy="34" r="6" fill="#ff7a1a" stroke="#111" stroke-width="2"/>',
  dust_mask: '<path d="M12 24q18-10 36 0v12q-18 12-36 0z" fill="#f2f2ee" stroke="#111" stroke-width="3"/>',
  coverall_fr: '<path d="M20 8h20l8 10v34h-12l-6-16l-6 16h-12v-34z" fill="#2b5fa8" stroke="#111" stroke-width="3"/><path d="M16 30h28" stroke="#ffc23d" stroke-width="4"/>',
  coverall_cotton: '<path d="M20 8h20l8 10v34h-12l-6-16l-6 16h-12v-34z" fill="#8a96a8" stroke="#111" stroke-width="3"/>',
  boots: '<path d="M10 14h16v26h22v12h-38z" fill="#3a3a3a" stroke="#111" stroke-width="3"/><rect x="10" y="44" width="38" height="5" fill="#ffc23d"/>',
  harness: '<path d="M18 8v44M42 8v44M18 22h24M18 40h24" stroke="#ff7a1a" stroke-width="5" fill="none"/><circle cx="30" cy="12" r="5" fill="#c0c4cc" stroke="#111" stroke-width="2"/>',
  welding_helmet: '<path d="M10 14q20-12 40 0v30q-20 10-40 0z" fill="#1a1a1a" stroke="#111" stroke-width="3"/><rect x="18" y="24" width="24" height="10" fill="#2f9e5b" stroke="#111" stroke-width="2"/>',
  apron: '<path d="M18 8h24v8l8 6v32h-40v-32l8-6z" fill="#7a5a36" stroke="#111" stroke-width="3"/>',
  vest: '<path d="M16 10l8 6h12l8-6l6 10v34h-40v-34z" fill="#ff7a1a" stroke="#111" stroke-width="3"/><path d="M10 34h40" stroke="#e9eef5" stroke-width="4"/>',
  gas_badge: '<rect x="16" y="10" width="28" height="40" rx="5" fill="#ffc23d" stroke="#111" stroke-width="3"/><rect x="21" y="16" width="18" height="12" fill="#04121f"/>',
};

function icon(name: string): SVGSVGElement {
  const tpl = document.createElement("template");
  tpl.innerHTML = `<svg viewBox="0 0 60 60" class="item-icon" aria-hidden="true">${ICONS[name] ?? ICONS.helmet}</svg>`;
  return tpl.content.firstElementChild as SVGSVGElement;
}

/** The decided value for a group (from completed steps), if any. */
export function decidedValue(m: MissionDef, ctrl: MissionController, group: string): string | null {
  for (const s of m.steps) {
    if (s.trigger.type === "decision_made" && s.trigger.target === group && ctrl.isDone(s.id)) return s.trigger.value ?? null;
  }
  return null;
}

function decisionBlock(m: MissionDef, ctrl: MissionController, groupId: string, h_: WorkPanelHandlers, routeMap?: MapShape[]): HTMLElement {
  const g = (m.decisionGroups ?? []).find((x) => x.id === groupId);
  const opts = m.decisions.filter((d) => d.group === groupId);
  const decided = decidedValue(m, ctrl, groupId);
  const blocked = ctrl.state !== "ACTIVE";
  const btn = (d: Decision, i: number) =>
    h(
      "button",
      {
        class: `btn decision-btn ${g?.ui === "comms" ? "comms-btn" : ""} ${decided === d.value ? "chosen" : ""}`,
        "data-decision": `${groupId}:${d.value}`,
        disabled: !!decided || blocked,
        onclick: () => h_.onDecide(groupId, d.value),
      },
      h("strong", {}, g?.ui === "route" ? `${String.fromCharCode(65 + i)} · ` : "", tx(d.labelKey)),
      d.descKey ? h("span", { class: "small muted" }, tx(d.descKey)) : null,
    );
  const children: (Node | null)[] = [h("h3", { class: "decision-title" }, g ? tx(g.promptKey) : t("station.decisionTitle"))];
  if (g?.ui === "route" && routeMap) children.push(routeCanvas(routeMap, opts));
  children.push(h("div", { class: `decision-col ${g?.ui ?? "choice"}` }, ...opts.map(btn)));
  if (decided) children.push(h("p", { class: "verified small" }, "✓ ", t("work.decided", { choice: tx(opts.find((o) => o.value === decided)?.labelKey ?? decided) })));
  return h("section", { class: `decision-block ui-${g?.ui ?? "choice"}`, "data-group": groupId }, ...children);
}

const ROUTE_COLORS = ["#3ddc84", "#ffc23d", "#ff5a5f", "#6fb7ff"];

function routeCanvas(map: MapShape[], opts: Decision[]): HTMLCanvasElement {
  const W = 560;
  const H = 360;
  const canvas = h("canvas", { class: "route-map", width: String(W), height: String(H), role: "img", "aria-label": t("work.routeMapLabel") }) as HTMLCanvasElement;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const minX = -25;
  const maxX = 25;
  const minZ = -27;
  const maxZ = 23;
  const sx = (x: number) => ((x - minX) / (maxX - minX)) * W;
  const sz = (z: number) => H - ((z - minZ) / (maxZ - minZ)) * H;
  ctx.fillStyle = "#1a2433";
  ctx.fillRect(0, 0, W, H);
  for (const s of map) {
    if (s.kind === "rect") {
      ctx.fillStyle = s.fill;
      ctx.fillRect(sx(s.rect.minX), sz(s.rect.maxZ), sx(s.rect.maxX) - sx(s.rect.minX), sz(s.rect.minZ) - sz(s.rect.maxZ));
      if (s.stroke) {
        ctx.strokeStyle = s.stroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(sx(s.rect.minX), sz(s.rect.maxZ), sx(s.rect.maxX) - sx(s.rect.minX), sz(s.rect.minZ) - sz(s.rect.maxZ));
      }
    } else if (s.kind === "circle") {
      ctx.fillStyle = s.fill;
      ctx.beginPath();
      ctx.arc(sx(s.x), sz(s.z), Math.max(2, (s.r / (maxX - minX)) * W), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = Math.min(3, s.width);
      ctx.setLineDash(s.dash ?? []);
      ctx.beginPath();
      s.pts.forEach(([x, z], i) => (i ? ctx.lineTo(sx(x), sz(z)) : ctx.moveTo(sx(x), sz(z))));
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  opts.forEach((o, i) => {
    if (!o.route?.length) return;
    ctx.strokeStyle = ROUTE_COLORS[i % ROUTE_COLORS.length];
    ctx.lineWidth = 5;
    ctx.setLineDash([12, 7]);
    ctx.beginPath();
    o.route.forEach(([x, z], j) => (j ? ctx.lineTo(sx(x), sz(z)) : ctx.moveTo(sx(x), sz(z))));
    ctx.stroke();
    ctx.setLineDash([]);
    const [ex, ez] = o.route[o.route.length - 1];
    ctx.fillStyle = ROUTE_COLORS[i % ROUTE_COLORS.length];
    ctx.beginPath();
    ctx.arc(sx(ex), sz(ez), 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.font = "900 14px Arial";
    ctx.textAlign = "center";
    ctx.fillText(String.fromCharCode(65 + i), sx(ex), sz(ez) + 5);
  });
  return canvas;
}

function evidenceRows(m: MissionDef, it: Interactable, st: WorkPanelState, ctrl: MissionController, hd: WorkPanelHandlers, paper: boolean): HTMLElement[] {
  const rows = m.evidence.filter((e) => e.doc === it.id || (!e.doc && it.panel === "station"));
  const blocked = ctrl.state !== "ACTIVE";
  return rows.map((ev) => {
    const isFlagged = st.flagged.has(ev.id);
    const btn = h(
      "button",
      { class: `btn btn-sm ${isFlagged ? "btn-danger" : ""}`, disabled: isFlagged || blocked, "data-flag": ev.id, onclick: () => hd.onFlag(ev.id), title: t("work.flagTitle") },
      isFlagged ? t("work.flagged") : t("work.flag"),
    );
    return h(
      "div",
      { class: paper ? "doc-field" : "evidence-row", "data-field": ev.id },
      h("div", { class: "doc-k" }, tx(ev.labelKey)),
      h("div", { class: "doc-v" }, tx(ev.statusKey)),
      btn,
    );
  });
}

function inventoryGrid(m: MissionDef, it: Interactable, st: WorkPanelState, ctrl: MissionController, hd: WorkPanelHandlers): HTMLElement {
  const items = (m.inventory ?? []).filter((i) => i.at === it.id);
  const blocked = ctrl.state !== "ACTIVE";
  return h(
    "div",
    { class: "inv-grid" },
    ...items.map((item) => {
      const sel = st.selected.has(item.id);
      const flagged = st.flagged.has(item.id);
      return h(
        "div",
        { class: `inv-card ${sel ? "selected" : ""} ${flagged ? "flagged" : ""}`, "data-item": item.id },
        icon(item.icon),
        h("strong", {}, tx(item.nameKey)),
        h("span", { class: "small" }, tx(item.detailKey)),
        h(
          "div",
          { class: "row" },
          h("button", { class: `btn btn-sm ${sel ? "btn-primary" : ""}`, disabled: sel || flagged || blocked, "data-select": item.id, onclick: () => hd.onSelect(item.id) }, sel ? t("work.selected") : t("work.select")),
          h("button", { class: `btn btn-sm ${flagged ? "btn-danger" : ""}`, disabled: flagged || blocked, "data-defect": item.id, onclick: () => hd.onFlag(item.id) }, flagged ? t("work.reported") : t("work.reportDefect")),
        ),
      );
    }),
  );
}

export function workPanel(m: MissionDef, it: Interactable, ctrl: MissionController, st: WorkPanelState, hd: WorkPanelHandlers, routeMap?: MapShape[]): HTMLElement {
  const kind = it.panel ?? "inspect";
  const lines = st.details.map((k) => tx(k));
  const groups = (it.groups ?? []).map((g) => decisionBlock(m, ctrl, g, hd, routeMap));
  const close = h("div", { class: "row end" }, h("button", { class: "btn", id: "work-close", autofocus: true, onclick: hd.onClose }, t("app.close")));
  const tagKey = { document: "work.tag.document", station: "work.tag.station", inventory: "work.tag.inventory", comms: "work.tag.comms", route: "work.tag.route", inspect: "work.tag.document" }[kind];
  const head = [h("div", { class: "comic-tag" }, t(tagKey)), h("h2", { id: "work-title" }, tx(it.nameKey))];
  let body: (Node | null)[];
  if (kind === "document") {
    body = [
      h(
        "div",
        { class: `paper doc-${it.docKind ?? "record"}` },
        h("div", { class: "paper-stamp" }, t("docs.fictional")),
        h("div", { class: "paper-head" }, tx(it.nameKey)),
        ...lines.map((l) => h("div", { class: "paper-line" }, l)),
        h("div", { class: "doc-fields" }, ...evidenceRows(m, it, st, ctrl, hd, true)),
        h("div", { class: "paper-foot" }, t("docs.notValid")),
      ),
      h("p", { class: "muted small" }, t("work.flagHelp")),
    ];
  } else if (kind === "inventory") {
    body = [...lines.map((l) => h("p", { class: "detail-line" }, l)), inventoryGrid(m, it, st, ctrl, hd), h("p", { class: "muted small" }, t("work.inventoryHelp"))];
  } else if (kind === "comms") {
    body = [h("div", { class: "radio-screen" }, h("div", { class: "radio-led" }), ...lines.map((l) => h("p", { class: "mono" }, l))), h("p", { class: "muted small" }, t("work.commsHelp"))];
  } else if (kind === "route") {
    body = [...lines.map((l) => h("p", { class: "detail-line" }, l))];
  } else {
    const ev = evidenceRows(m, it, st, ctrl, hd, false);
    body = [...lines.map((l) => h("p", { class: "detail-line" }, l)), ev.length ? h("h3", {}, t("station.evidence")) : null, ...ev];
  }
  return h(
    "div",
    { class: `panel wide comic-panel work-panel kind-${kind}`, role: "dialog", "aria-labelledby": "work-title", "data-work": it.id },
    ...head,
    ...body,
    ...groups,
    h("p", { class: "muted small" }, t("station.trainingRule")),
    close,
  );
}
