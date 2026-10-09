// Prop library for the data-driven training-complex world. Each mission lists
// the props it needs (shared/missions/*.json → scene.props); a prop with an id
// becomes the world anchor of the interactable with the same id.
//
// Local frame: x right, y up, the prop's FRONT faces local -z. heading (deg):
// 0 = front faces south (-z), 90 = west, 180 = north, -90 = east.
import { Color3, Mesh, StandardMaterial, TransformNode, Vector3, type AbstractMesh } from "../babylon";
import type { Prop } from "../../mission/types";
import { Kit, PALETTE, langFont, wrapText } from "./kit";
import type { MapShape } from "./types";

export interface PropInstance {
  root: TransformNode;
  meshes: AbstractMesh[];
  focus: Vector3;
  stand: { x: number; z: number };
  setState(state: string): void;
  setHidden(hidden: boolean): void;
  update?: (dt: number, time: number, player: Vector3) => void;
}

type Tr = (key: string) => string;
const COLORS: Record<string, string> = { green: "#3ddc84", amber: "#ffc23d", red: "#ff5a5f", grey: "#9fb3cf", white: "#e9eef5", blue: "#6fb7ff" };

export class PropCtx {
  readonly root: TransformNode;
  readonly cos: number;
  readonly sin: number;
  anim: ((dt: number, time: number, player: Vector3) => void)[] = [];
  states: ((s: string) => void)[] = [];

  constructor(readonly kit: Kit, readonly t: Tr, readonly p: Prop) {
    this.root = new TransformNode(`prop_${p.id ?? p.type}`, kit.scene);
    const h = ((p.heading ?? 0) * Math.PI) / 180;
    this.root.position.set(p.x, 0, p.z);
    this.root.rotation.y = h;
    this.cos = Math.cos(h);
    this.sin = Math.sin(h);
  }

  get params(): Record<string, unknown> {
    return this.p.params ?? {};
  }

  str(name: string, fallback = ""): string {
    const v = this.params[name];
    return typeof v === "string" ? v : fallback;
  }

  num(name: string, fallback: number): number {
    const v = this.params[name];
    return typeof v === "number" ? v : fallback;
  }

  /** Translate a param that is a text key; plain tags (e.g. "P-201") pass through. */
  text(name: string, fallback = ""): () => string {
    const v = this.str(name, fallback);
    return () => (v.startsWith("m.") || v.startsWith("world.") || v.startsWith("obj.") ? this.t(v) : v);
  }

  /** Local → world XZ. */
  w(lx: number, lz: number): { x: number; z: number } {
    // Babylon rotation.y: local (x, z) → world (x cos + z sin, -x sin + z cos).
    return { x: this.p.x + lx * this.cos + lz * this.sin, z: this.p.z - lx * this.sin + lz * this.cos };
  }

  V(x: number, y: number, z: number): Vector3 {
    return new Vector3(x, y, z);
  }

  box(w: number, h: number, d: number, x: number, y: number, z: number, color: string | StandardMaterial, o: { outline?: boolean; shadow?: boolean; rotY?: number; rotX?: number; rotZ?: number; pickable?: boolean } = {}): Mesh {
    return this.kit.box(w, h, d, this.V(x, y, z), color, { parent: this.root, ...o });
  }

  cyl(dia: number, h: number, x: number, y: number, z: number, color: string | StandardMaterial, o: { outline?: boolean; shadow?: boolean; rotX?: number; rotZ?: number; tess?: number; top?: number; pickable?: boolean } = {}): Mesh {
    return this.kit.cyl(dia, h, this.V(x, y, z), color, { parent: this.root, ...o });
  }

  sphere(dia: number, x: number, y: number, z: number, color: string | StandardMaterial, o: { pickable?: boolean } = {}): Mesh {
    return this.kit.sphere(dia, this.V(x, y, z), color, { parent: this.root, ...o });
  }

  /** Rectangle collider in local coordinates (AABB of the rotated rectangle). */
  coll(lx: number, lz: number, w: number, d: number): void {
    const c = this.w(lx, lz);
    const ac = Math.abs(this.cos);
    const as = Math.abs(this.sin);
    const hw = (w * ac + d * as) / 2;
    const hd = (w * as + d * ac) / 2;
    this.kit.colliders.push({ minX: c.x - hw, maxX: c.x + hw, minZ: c.z - hd, maxZ: c.z + hd });
  }

  circle(lx: number, lz: number, r: number): void {
    const c = this.w(lx, lz);
    this.kit.circles.push({ x: c.x, z: c.z, r });
  }

  mapRect(lx: number, lz: number, w: number, d: number, fill: string, stroke?: string, label?: string): void {
    const c = this.w(lx, lz);
    const ac = Math.abs(this.cos);
    const as = Math.abs(this.sin);
    const hw = (w * ac + d * as) / 2;
    const hd = (w * as + d * ac) / 2;
    this.kit.map.push({ kind: "rect", rect: { minX: c.x - hw, maxX: c.x + hw, minZ: c.z - hd, maxZ: c.z + hd }, fill, stroke, label });
  }

  mapCircle(lx: number, lz: number, r: number, fill: string): void {
    const c = this.w(lx, lz);
    this.kit.map.push({ kind: "circle", x: c.x, z: c.z, r, fill });
  }

  plate(text: () => string, w: number, h: number, x: number, y: number, z: number, colors = { bg: PALETTE.yellow, fg: "#111" }): Mesh {
    return this.kit.plate(text, w, h, this.V(x, y, z), Math.PI, colors, { parent: this.root });
  }

  sign(kind: "warning" | "mandatory" | "prohibition" | "info" | "danger", text: () => string, x: number, y: number, z: number, size = 0.7): Mesh {
    return this.kit.sign(kind, text, this.V(x, y, z), Math.PI, size, { parent: this.root });
  }

  /** Front-facing translatable panel drawn by `draw`. */
  label(w: number, h: number, x: number, y: number, z: number, draw: (c: CanvasRenderingContext2D, pw: number, ph: number) => void, res = 256): Mesh {
    return this.kit.label(w, h, this.V(x, y, z), Math.PI, draw, { parent: this.root, res });
  }

  glowMat(hex: string): StandardMaterial {
    const m = new StandardMaterial(`glow_${hex}_${Math.random().toString(36).slice(2, 7)}`, this.kit.scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.emissiveColor = Color3.FromHexString(hex);
    m.disableLighting = true;
    return m;
  }

  tagMesh(x: number, y: number, z: number, color = PALETTE.red): Mesh[] {
    // "Do not operate" style tag: red card with a white band, visible from a few metres.
    const tag = this.box(0.2, 0.32, 0.012, x, y, z, color, { outline: true });
    const band = this.box(0.16, 0.06, 0.014, x, y + 0.06, z - 0.002, "#ffffff");
    const str = this.box(0.012, 0.14, 0.012, x, y + 0.22, z, "#222");
    return [tag, band, str];
  }

  lockMesh(x: number, y: number, z: number): Mesh[] {
    const body = this.box(0.09, 0.08, 0.04, x, y, z, PALETTE.red, { outline: true });
    const shackle = this.kit.torus(0.07, 0.015, this.V(x, y + 0.06, z), "#c0c4cc", { parent: this.root });
    shackle.rotation.x = Math.PI / 2;
    return [body, shackle];
  }

  onState(fn: (s: string) => void): void {
    this.states.push(fn);
  }
}

function setVisible(meshes: AbstractMesh[], on: boolean): void {
  for (const m of meshes) m.setEnabled(on);
}

type BuildResult = { meshes: AbstractMesh[]; focusY: number; focusZ?: number; stand?: number };
type Builder = (c: PropCtx) => BuildResult;

/** Draw text lines on a dark screen (status displays, monitors). */
function screenDraw(c: PropCtx, title: () => string, lines: () => [string, string][]) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = "#04121f";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#3ddc84";
    ctx.font = `700 ${h * 0.11}px monospace`;
    ctx.fillText(title(), w * 0.06, h * 0.16, w * 0.88);
    let y = h * 0.36;
    const fs = h * 0.085;
    for (const [key, col] of lines()) {
      ctx.fillStyle = COLORS[col] ?? COLORS.white;
      ctx.font = langFont(700, fs);
      for (const ln of wrapText(ctx, c.t(key), w * 0.88).slice(0, 2)) {
        ctx.fillText(ln, w * 0.06, y, w * 0.88);
        y += fs * 1.2;
      }
      y += fs * 0.25;
    }
    ctx.fillStyle = "#9fb3cf";
    ctx.font = langFont(500, h * 0.06);
    ctx.fillText(c.t("world.panel.trainingOnly"), w * 0.06, h * 0.94, w * 0.88);
  };
}

/** Screen-set props: params.screens = { default: [[key, color], ...], <state>: [...] }. */
function screens(c: PropCtx): { get: () => [string, string][]; set: (s: string) => boolean } {
  const all = (c.params.screens ?? {}) as Record<string, [string, string][]>;
  let cur = c.p.state && all[c.p.state] ? c.p.state : "default";
  return {
    get: () => all[cur] ?? [],
    set: (s) => {
      if (!all[s] || s === cur) return false;
      cur = s;
      return true;
    },
  };
}

function beaconMat(c: PropCtx, initial: string): { mat: StandardMaterial; set: (col: string) => void } {
  const mat = new StandardMaterial(`beacon_${Math.random().toString(36).slice(2, 7)}`, c.kit.scene);
  mat.alpha = 0.92;
  let col = initial;
  const apply = (pulse: number) => {
    const base = Color3.FromHexString(col === "off" ? "#555" : COLORS[col] ?? COLORS.amber);
    mat.diffuseColor = base;
    mat.emissiveColor = col === "off" ? new Color3(0.08, 0.08, 0.08) : base.scale(pulse);
  };
  apply(1);
  c.anim.push((_dt, time) => apply(col === "off" ? 0 : 0.5 + 0.5 * Math.max(0, Math.sin(time * 6))));
  return { mat, set: (x) => (col = x) };
}

const B: Record<string, Builder> = {
  // ------------------------------------------------------------ process equipment
  pump(c) {
    const tag = c.text("tag", "P-000");
    const color = c.str("color", PALETTE.blue);
    c.box(3.6, 0.3, 1.3, 0, 0.15, 0, PALETTE.concrete);
    c.coll(0, 0, 3.6, 1.3);
    const casing = c.cyl(0.95, 0.42, -0.9, 0.95, 0, color, { rotZ: Math.PI / 2, outline: true, shadow: true, tess: 24 });
    const brg = c.box(0.6, 0.42, 0.42, -0.35, 0.75, 0, color, { outline: true });
    const suction = c.cyl(0.32, 0.55, -1.42, 0.95, 0, color, { rotZ: Math.PI / 2 });
    const discharge = c.cyl(0.26, 0.6, -0.9, 1.55, 0, color);
    const coupling = c.cyl(0.3, 0.3, 0.1, 0.75, 0, PALETTE.orange, { rotZ: Math.PI / 2, outline: true });
    const motor = c.cyl(0.62, 1.05, 0.85, 0.78, 0, "#6f7b8c", { rotZ: Math.PI / 2, outline: true, shadow: true, tess: 20 });
    const tbox = c.box(0.28, 0.24, 0.28, 0.85, 1.18, 0, "#5d6876", { outline: true });
    const plate = c.plate(tag, 0.5, 0.18, -0.9, 1.0, -0.49);
    c.kit.pipeRun([c.V(-1.7, 0.95, 0), c.V(-2.6, 0.95, 0), c.V(-2.6, 3.4, 0)], 0.24, PALETTE.steel, { parent: c.root });
    c.kit.pipeRun([c.V(-0.9, 1.85, 0), c.V(-0.9, 3.0, 0)], 0.2, PALETTE.steel, { parent: c.root });
    c.mapRect(0, 0, 3.6, 1.3, "#2f7ddc", "#fff", tag());
    // Leak drip (state "leaking") and running vibration (state "running").
    const drip = c.sphere(0.06, -0.9, 0.6, -0.2, c.glowMat("#6fb7ff"), { pickable: false });
    const puddle = c.cyl(0.8, 0.01, -0.9, 0.31, -0.35, "#1b2733", { pickable: false });
    let state = c.p.state ?? "stopped";
    const apply = () => {
      setVisible([drip, puddle], state === "leaking");
    };
    apply();
    c.onState((s) => {
      state = s;
      apply();
    });
    c.anim.push((dt, time) => {
      if (state === "running") coupling.rotation.x += dt * 25;
      if (state === "leaking") drip.position.y = 0.6 - ((time * 0.8) % 1) * 0.28;
    });
    return { meshes: [casing, brg, suction, discharge, coupling, motor, tbox, plate], focusY: 0.95 };
  },

  compressor(c) {
    const tag = c.text("tag", "K-000");
    c.box(3.2, 0.25, 1.6, 0, 0.12, 0, PALETTE.concrete);
    const body = c.box(1.8, 1.3, 1.2, -0.5, 0.9, 0, "#3d7a5c", { outline: true, shadow: true });
    const motor = c.cyl(0.8, 1.0, 0.95, 0.75, 0, "#6f7b8c", { rotZ: Math.PI / 2, outline: true });
    const plate = c.plate(tag, 0.5, 0.18, -0.5, 1.2, -0.61);
    c.coll(0, 0, 3.2, 1.6);
    c.mapRect(0, 0, 3.2, 1.6, "#3d7a5c", "#fff", tag());
    return { meshes: [body, motor, plate], focusY: 1.0 };
  },

  exchanger(c) {
    const shell = c.cyl(1.0, 4, 0, 1.2, 0, "#c7ccd3", { rotZ: Math.PI / 2, outline: true, shadow: true, tess: 20 });
    const h1 = c.sphere(1.0, -2, 1.2, 0, "#b5bcc6");
    const h2 = c.sphere(1.0, 2, 1.2, 0, "#b5bcc6");
    h1.scaling.x = 0.4;
    h2.scaling.x = 0.4;
    c.box(0.3, 0.8, 0.9, -1.3, 0.4, 0, PALETTE.steelDark);
    c.box(0.3, 0.8, 0.9, 1.3, 0.4, 0, PALETTE.steelDark);
    c.coll(0, 0, 4.6, 1.1);
    c.mapRect(0, 0, 4.6, 1.1, "#c9ccd2");
    return { meshes: [shell, h1, h2], focusY: 1.2 };
  },

  vessel(c) {
    // Horizontal vessel on saddles with a front manway (state: closed | open).
    const tag = c.text("tag", "V-000");
    const len = c.num("len", 5);
    const shell = c.cyl(2.0, len, 0, 1.5, 0, "#d8dde4", { rotZ: Math.PI / 2, outline: true, shadow: true, tess: 24 });
    const e1 = c.sphere(2.0, -len / 2, 1.5, 0, "#cfd5dc");
    const e2 = c.sphere(2.0, len / 2, 1.5, 0, "#cfd5dc");
    e1.scaling.x = 0.35;
    e2.scaling.x = 0.35;
    c.box(0.4, 0.6, 1.6, -len * 0.3, 0.3, 0, PALETTE.steelDark);
    c.box(0.4, 0.6, 1.6, len * 0.3, 0.3, 0, PALETTE.steelDark);
    const neck = c.cyl(0.75, 0.35, 0, 1.4, -1.05, "#cfd5dc", { rotX: Math.PI / 2 });
    const hole = c.cyl(0.6, 0.02, 0, 1.4, -1.23, "#05070a", { rotX: Math.PI / 2 });
    const cover = c.cyl(0.85, 0.08, 0, 1.4, -1.26, PALETTE.steelDark, { rotX: Math.PI / 2, outline: true });
    const plate = c.plate(tag, 0.6, 0.2, 0, 2.3, -0.98);
    c.coll(0, 0, len + 0.7, 2.1);
    c.mapRect(0, 0, len + 0.7, 2.1, "#c9ccd2", "#fff", tag());
    let open = c.p.state === "open";
    const apply = () => {
      cover.position.set(open ? 0.75 : 0, 1.4, open ? -1.45 : -1.26);
      cover.rotation.set(Math.PI / 2, open ? 1.2 : 0, 0);
      hole.setEnabled(open);
    };
    apply();
    c.onState((s) => {
      open = s === "open";
      apply();
    });
    return { meshes: [shell, e1, e2, neck, cover, plate, hole], focusY: 1.4, stand: 2.6 };
  },

  tank(c) {
    // Vertical process tank with a ground-level manway (state: closed | open).
    const tag = c.text("tag", "T-000");
    const r = c.num("r", 1.8);
    const h = c.num("h", 5);
    const body = c.cyl(r * 2, h, 0, h / 2, 0, c.str("color", "#e7e3d4"), { outline: true, shadow: true, tess: 28 });
    c.cyl(r * 2.04, 0.4, 0, h + 0.2, 0, PALETTE.steel, { top: r * 0.5, tess: 28 });
    const neck = c.cyl(0.8, 0.35, 0, 0.9, -r - 0.1, "#d4d0c2", { rotX: Math.PI / 2 });
    const hole = c.cyl(0.62, 0.02, 0, 0.9, -r - 0.29, "#05070a", { rotX: Math.PI / 2 });
    const cover = c.cyl(0.9, 0.08, 0, 0.9, -r - 0.3, PALETTE.steelDark, { rotX: Math.PI / 2, outline: true });
    const plate = c.plate(tag, 0.7, 0.24, 0, 2.2, -r - 0.02);
    c.circle(0, 0, r);
    c.mapCircle(0, 0, r, "#d8d4c6");
    let open = c.p.state === "open";
    const apply = () => {
      cover.position.set(open ? 0.85 : 0, 0.9, open ? -r - 0.5 : -r - 0.3);
      cover.rotation.set(Math.PI / 2, open ? 1.2 : 0, 0);
      hole.setEnabled(open);
    };
    apply();
    c.onState((s) => {
      open = s === "open";
      apply();
    });
    return { meshes: [body, neck, cover, plate, hole], focusY: 1.0, focusZ: -r - 0.2, stand: r + 1.7 };
  },

  leak(c) {
    // Flanged pipe spool on supports with an optional drip (state: on | off).
    const pipe = c.cyl(0.26, 3, 0, 1.1, 0, PALETTE.steel, { rotZ: Math.PI / 2 });
    const fl = c.cyl(0.5, 0.08, 0, 1.1, 0, PALETTE.steelDark, { rotZ: Math.PI / 2, outline: true });
    c.box(0.15, 1.0, 0.3, -1.2, 0.5, 0, PALETTE.steelDark);
    c.box(0.15, 1.0, 0.3, 1.2, 0.5, 0, PALETTE.steelDark);
    const drip = c.sphere(0.07, 0, 0.9, 0, c.glowMat("#c9a14a"), { pickable: false });
    const pool = c.cyl(0.7, 0.01, 0, 0.012, 0, "#2a2414", { pickable: false });
    c.coll(0, 0, 3, 0.4);
    let on = c.p.state !== "off";
    setVisible([drip, pool], on);
    c.onState((s) => {
      on = s !== "off";
      setVisible([drip, pool], on);
    });
    c.anim.push((_dt, time) => on && (drip.position.y = 0.95 - ((time * 0.9) % 1) * 0.9));
    return { meshes: [pipe, fl], focusY: 1.1 };
  },

  gauge(c) {
    // Post-mounted gauge. The face shows a coloured band only (no numeric scale): state normal | high.
    c.cyl(0.08, 1.4, 0, 0.7, 0, PALETTE.steelDark);
    const rim = c.cyl(0.5, 0.08, 0, 1.5, 0, PALETTE.steel, { rotX: Math.PI / 2, outline: true });
    let state = c.p.state ?? "normal";
    const face = c.label(0.42, 0.42, 0, 1.5, -0.05, (ctx, w, h) => {
      ctx.fillStyle = "#f4f4ef";
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = w * 0.08;
      ctx.strokeStyle = "#3ddc84";
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w * 0.38, Math.PI * 0.75, Math.PI * 1.75);
      ctx.stroke();
      ctx.strokeStyle = "#e8423f";
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w * 0.38, Math.PI * 1.75, Math.PI * 2.25);
      ctx.stroke();
      const a = state === "high" ? Math.PI * 2.0 : Math.PI * 1.25;
      ctx.strokeStyle = "#111";
      ctx.lineWidth = w * 0.035;
      ctx.beginPath();
      ctx.moveTo(w / 2, h / 2);
      ctx.lineTo(w / 2 + Math.cos(a) * w * 0.34, h / 2 + Math.sin(a) * w * 0.34);
      ctx.stroke();
    }, 128);
    const plate = c.plate(c.text("tag", "PI"), 0.4, 0.14, 0, 1.15, -0.06);
    c.circle(0, 0, 0.2);
    c.onState((s) => {
      state = s;
      c.kit.relabel();
    });
    return { meshes: [rim, face, plate], focusY: 1.5, stand: 1.4 };
  },

  // ------------------------------------------------------------ electrical / isolation
  cabinet(c) {
    const tag = c.text("tag", "MCC");
    const body = c.box(1.6, 2.0, 0.6, 0, 1.0, 0, "#c7ccd3", { outline: true, shadow: true });
    c.box(0.03, 1.8, 0.02, 0, 1.0, -0.31, "#7b8491");
    const handle = c.box(0.05, 0.22, 0.05, 0.2, 1.1, -0.33, "#333");
    const plate = c.plate(tag, 0.6, 0.18, 0, 1.85, -0.31, { bg: "#fff", fg: "#111" });
    const sign = c.sign("danger", () => c.t("world.sign.highVoltage"), -0.45, 1.4, -0.31, 0.36);
    const lock = c.lockMesh(0.2, 0.95, -0.36);
    const tagm = c.tagMesh(0.32, 0.85, -0.36);
    c.coll(0, 0, 1.6, 0.6);
    c.mapRect(0, 0, 1.6, 0.6, "#c7ccd3");
    const apply = (s: string) => {
      setVisible(lock, s === "locked");
      setVisible(tagm, s === "locked" || s === "tagged");
    };
    apply(c.p.state ?? "normal");
    c.onState(apply);
    return { meshes: [body, handle, plate, sign], focusY: 1.2 };
  },

  breaker(c) {
    // Rotary isolator on a post: state on | off | locked | tagged.
    c.box(0.1, 1.2, 0.1, 0, 0.6, 0, PALETTE.steelDark);
    const box = c.box(0.45, 0.55, 0.22, 0, 1.4, 0, PALETTE.yellow, { outline: true });
    const knob = c.box(0.08, 0.26, 0.06, 0, 1.4, -0.14, PALETTE.red, { outline: true });
    const plate = c.plate(c.text("tag", "IS"), 0.4, 0.12, 0, 1.75, -0.12, { bg: "#fff", fg: "#111" });
    const lock = c.lockMesh(0.12, 1.25, -0.16);
    const tagm = c.tagMesh(0.18, 1.1, -0.16);
    c.coll(0, 0, 0.5, 0.35);
    const apply = (s: string) => {
      knob.rotation.z = s === "on" ? 0 : Math.PI / 2;
      setVisible(lock, s === "locked");
      setVisible(tagm, s === "locked" || s === "tagged");
    };
    apply(c.p.state ?? "on");
    c.onState(apply);
    return { meshes: [box, knob, plate], focusY: 1.4, stand: 1.3 };
  },

  valve(c) {
    // Isolation valve on a pipe stub: state open | closed | tagged | locked.
    c.cyl(0.24, 3, 0, 0.9, 0, PALETTE.steel, { rotZ: Math.PI / 2 });
    c.box(0.2, 0.9, 0.3, -1.2, 0.45, 0, PALETTE.steelDark);
    c.box(0.2, 0.9, 0.3, 1.2, 0.45, 0, PALETTE.steelDark);
    const body = c.box(0.42, 0.42, 0.42, 0, 0.9, 0, PALETTE.steelDark, { outline: true });
    const stem = c.cyl(0.05, 0.5, 0, 1.35, 0, PALETTE.steel);
    const wheel = c.kit.torus(0.5, 0.05, c.V(0, 1.62, 0), c.str("wheel", PALETTE.red), { parent: c.root });
    c.kit.outline(wheel, 0.015);
    const plate = c.plate(c.text("tag", "XV"), 0.42, 0.14, 0, 0.9, -0.22);
    const lock = c.lockMesh(0.18, 1.5, -0.2);
    const chain = c.box(0.3, 0.02, 0.02, 0.05, 1.55, -0.2, "#c0c4cc");
    const tagm = c.tagMesh(-0.2, 1.4, -0.22);
    c.coll(0, 0, 3, 0.5);
    const apply = (s: string) => {
      setVisible([...lock, chain], s === "locked");
      setVisible(tagm, s === "locked" || s === "tagged");
    };
    apply(c.p.state ?? "open");
    c.onState(apply);
    return { meshes: [body, stem, wheel, plate], focusY: 1.2 };
  },

  lockbox(c) {
    c.box(0.1, 1.4, 0.1, 0, 0.7, 0, PALETTE.steelDark);
    const box = c.box(0.6, 0.5, 0.2, 0, 1.5, 0, PALETTE.red, { outline: true });
    const win = c.box(0.42, 0.3, 0.01, 0, 1.52, -0.11, "#9fd3ff");
    const plate = c.plate(c.text("title", "world.label.lockbox"), 0.6, 0.12, 0, 1.85, -0.1, { bg: PALETTE.navy, fg: "#fff" });
    const locks: Mesh[] = [];
    const n = c.num("locks", 2);
    for (let i = 0; i < n; i++) locks.push(...c.lockMesh(-0.18 + i * 0.12, 1.2, -0.12));
    c.coll(0, 0, 0.6, 0.3);
    return { meshes: [box, win, plate, ...locks], focusY: 1.5, stand: 1.3 };
  },

  control(c) {
    c.box(0.1, 1.2, 0.1, 0, 0.6, 0, PALETTE.steelDark);
    const box = c.box(0.42, 0.5, 0.22, 0, 1.35, 0, PALETTE.yellow, { outline: true });
    const stop = c.cyl(0.11, 0.06, -0.08, 1.45, -0.12, PALETTE.red, { rotX: Math.PI / 2 });
    const start = c.cyl(0.09, 0.06, 0.1, 1.45, -0.12, PALETTE.green, { rotX: Math.PI / 2 });
    const lock = c.lockMesh(0, 1.22, -0.14);
    c.coll(0, 0, 0.45, 0.35);
    const apply = (s: string) => setVisible(lock, s === "locked");
    apply(c.p.state ?? "normal");
    c.onState(apply);
    return { meshes: [box, stop, start], focusY: 1.35, stand: 1.3 };
  },

  // ------------------------------------------------------------ information
  board(c) {
    const w = c.num("w", 1.8);
    c.box(0.08, 1.9, 0.08, -w / 2 + 0.05, 0.95, 0, PALETTE.steelDark);
    c.box(0.08, 1.9, 0.08, w / 2 - 0.05, 0.95, 0, PALETTE.steelDark);
    const title = c.text("title", "world.label.noticeBoard");
    const lines = ((c.params.lines ?? []) as string[]).map((k) => () => c.t(k));
    const accent = c.str("accent", PALETTE.green);
    const face = c.label(w, w * 0.7, 0, 1.45, -0.05, (ctx, pw, ph) => {
      ctx.fillStyle = "#f7f5ee";
      ctx.fillRect(0, 0, pw, ph);
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, pw, ph * 0.18);
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 8;
      ctx.strokeRect(0, 0, pw, ph);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = langFont(900, ph * 0.08);
      ctx.fillText(title(), pw / 2, ph * 0.09, pw * 0.94);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#111";
      let y = ph * 0.24;
      const fs = ph * 0.055;
      ctx.font = langFont(600, fs);
      for (const line of lines) {
        for (const ln of wrapText(ctx, `• ${line()}`, pw * 0.9)) {
          if (y > ph - fs * 1.4) break;
          ctx.fillText(ln, pw * 0.05, y);
          y += fs * 1.3;
        }
        y += fs * 0.4;
      }
    });
    c.coll(0, 0, w, 0.25);
    return { meshes: [face], focusY: 1.45, stand: 1.5 };
  },

  desk(c) {
    const top = c.box(1.5, 0.08, 0.75, 0, 0.86, 0, "#8a6a44", { outline: true });
    c.box(0.08, 0.82, 0.7, -0.68, 0.41, 0, "#5e6773");
    c.box(0.08, 0.82, 0.7, 0.68, 0.41, 0, "#5e6773");
    const p1 = c.box(0.42, 0.03, 0.32, -0.2, 0.92, -0.05, "#f2f2ee", { rotY: 0.15 });
    const p2 = c.box(0.42, 0.03, 0.32, 0.26, 0.92, 0.05, "#f2f2ee", { rotY: -0.1 });
    const folder = c.box(0.34, 0.06, 0.26, 0.05, 0.95, -0.2, c.str("folder", PALETTE.red), { outline: true });
    const sign = c.plate(c.text("title", "world.label.permitDesk"), 1.2, 0.22, 0, 1.25, 0.3, { bg: PALETTE.orange, fg: "#111" });
    c.coll(0, 0, 1.5, 0.75);
    c.mapRect(0, 0, 1.5, 0.75, "rgba(255,122,26,0.5)");
    return { meshes: [top, p1, p2, folder, sign], focusY: 0.95, stand: 1.4 };
  },

  stand(c) {
    // Review station: lectern with a clipboard/tablet.
    c.box(0.08, 1.1, 0.08, -0.5, 0.55, 0, PALETTE.steelDark);
    c.box(0.08, 1.1, 0.08, 0.5, 0.55, 0, PALETTE.steelDark);
    const board = c.box(1.2, 0.9, 0.06, 0, 1.45, 0, PALETTE.navy, { outline: true });
    const title = c.text("title", "world.label.reviewStation");
    const face = c.label(1.1, 0.8, 0, 1.45, -0.04, (ctx, w, h) => {
      ctx.fillStyle = "#f7f5ee";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = PALETTE.orange;
      ctx.fillRect(0, 0, w, h * 0.22);
      ctx.fillStyle = "#111";
      ctx.textAlign = "center";
      ctx.font = langFont(900, h * 0.1);
      ctx.fillText(title(), w / 2, h * 0.15, w * 0.92);
      ctx.strokeStyle = "#9aa3ad";
      ctx.lineWidth = h * 0.03;
      for (let i = 0; i < 4; i++) {
        ctx.strokeRect(w * 0.08, h * (0.32 + i * 0.16), h * 0.08, h * 0.08);
        ctx.beginPath();
        ctx.moveTo(w * 0.22, h * (0.36 + i * 0.16));
        ctx.lineTo(w * 0.9, h * (0.36 + i * 0.16));
        ctx.stroke();
      }
    });
    c.coll(0, 0, 1.2, 0.25);
    c.mapRect(0, 0, 1.2, 0.3, PALETTE.orange);
    return { meshes: [board, face], focusY: 1.4, stand: 1.4 };
  },

  permit_box(c) {
    c.box(0.1, 1.3, 0.1, 0, 0.65, 0, PALETTE.steelDark);
    const box = c.box(0.8, 0.9, 0.16, 0, 1.6, 0, "#d8dde4", { outline: true });
    const glass = c.box(0.66, 0.72, 0.01, 0, 1.58, -0.09, c.kit.mat("#bfe3ff", { alpha: 0.45 }));
    const sheet = c.box(0.5, 0.62, 0.01, 0, 1.58, -0.07, "#fbf7e8");
    const head = c.plate(c.text("title", "world.label.permitBox"), 0.8, 0.16, 0, 2.15, -0.09, { bg: PALETTE.orange, fg: "#111" });
    c.coll(0, 0, 0.8, 0.3);
    return { meshes: [box, glass, sheet, head], focusY: 1.6, stand: 1.3 };
  },

  map(c) {
    // Site emergency plan board (fictional): simple stylised plan with routes.
    c.box(0.08, 1.9, 0.08, -0.95, 0.95, 0, PALETTE.steelDark);
    c.box(0.08, 1.9, 0.08, 0.95, 0.95, 0, PALETTE.steelDark);
    const title = c.text("title", "world.label.sitePlan");
    const face = c.label(1.9, 1.3, 0, 1.45, -0.05, (ctx, w, h) => {
      ctx.fillStyle = "#f7f5ee";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = PALETTE.green;
      ctx.fillRect(0, 0, w, h * 0.16);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.font = langFont(900, h * 0.08);
      ctx.fillText(title(), w / 2, h * 0.11, w * 0.94);
      ctx.fillStyle = "#c9d3df";
      ctx.fillRect(w * 0.08, h * 0.25, w * 0.84, h * 0.65);
      ctx.fillStyle = "#3b4b63";
      ctx.fillRect(w * 0.15, h * 0.32, w * 0.2, h * 0.2);
      ctx.fillRect(w * 0.6, h * 0.55, w * 0.25, h * 0.25);
      ctx.strokeStyle = PALETTE.green;
      ctx.lineWidth = h * 0.025;
      ctx.setLineDash([h * 0.04, h * 0.03]);
      ctx.beginPath();
      ctx.moveTo(w * 0.45, h * 0.85);
      ctx.lineTo(w * 0.45, h * 0.42);
      ctx.lineTo(w * 0.85, h * 0.36);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = PALETTE.green;
      ctx.beginPath();
      ctx.arc(w * 0.85, h * 0.36, h * 0.04, 0, Math.PI * 2);
      ctx.fill();
    });
    c.coll(0, 0, 1.9, 0.25);
    return { meshes: [face], focusY: 1.45, stand: 1.6 };
  },

  headcount(c) {
    c.box(0.08, 1.8, 0.08, -0.6, 0.9, 0, PALETTE.steelDark);
    c.box(0.08, 1.8, 0.08, 0.6, 0.9, 0, PALETTE.steelDark);
    const title = c.text("title", "world.label.headcount");
    const lines = ((c.params.lines ?? []) as string[]).map((k) => () => c.t(k));
    const face = c.label(1.2, 0.95, 0, 1.4, -0.05, (ctx, w, h) => {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = PALETTE.green;
      ctx.fillRect(0, 0, w, h * 0.2);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.font = langFont(900, h * 0.1);
      ctx.fillText(title(), w / 2, h * 0.14, w * 0.94);
      ctx.textAlign = "left";
      ctx.fillStyle = "#111";
      ctx.font = langFont(600, h * 0.075);
      lines.forEach((l, i) => ctx.fillText(l(), w * 0.07, h * (0.34 + i * 0.12), w * 0.88));
    });
    c.coll(0, 0, 1.2, 0.25);
    return { meshes: [face], focusY: 1.4, stand: 1.4 };
  },

  panel(c) {
    // Status display cabinet with beacon. params.screens / params.beacons per state.
    const body = c.box(0.9, 1.6, 0.35, 0, 0.8, 0, "#4f5d70", { outline: true, shadow: true });
    const sc = screens(c);
    const title = c.text("title", "STATUS");
    const screen = c.label(0.74, 0.62, 0, 1.15, -0.18, screenDraw(c, title, sc.get));
    const beacons = (c.params.beacons ?? {}) as Record<string, string>;
    const bm = beaconMat(c, beacons[c.p.state ?? "default"] ?? beacons.default ?? "amber");
    c.cyl(0.2, 0.12, 0, 1.66, 0, "#333");
    const beacon = c.cyl(0.18, 0.24, 0, 1.84, 0, bm.mat, { tess: 14 });
    c.kit.outline(beacon, 0.015);
    c.coll(0, 0, 0.9, 0.35);
    c.mapRect(0, 0, 0.9, 0.4, "#4f5d70");
    c.onState((s) => {
      if (sc.set(s)) c.kit.relabel();
      if (beacons[s]) bm.set(beacons[s]);
    });
    return { meshes: [body, screen, beacon], focusY: 1.15, stand: 1.3 };
  },

  monitor(c) {
    // Fictional monitoring display on a tripod. Shows text states only — never numeric readings.
    for (const a of [0, 2.1, 4.2]) c.box(0.04, 1.2, 0.04, Math.cos(a) * 0.25, 0.55, Math.sin(a) * 0.25, PALETTE.steelDark, { rotZ: Math.cos(a) * 0.25, rotX: -Math.sin(a) * 0.25 });
    const body = c.box(0.5, 0.42, 0.16, 0, 1.25, 0, PALETTE.yellow, { outline: true });
    const sc = screens(c);
    const title = c.text("title", "MONITOR");
    const screen = c.label(0.42, 0.32, 0, 1.27, -0.09, screenDraw(c, title, sc.get), 192);
    c.circle(0, 0, 0.3);
    c.onState((s) => sc.set(s) && c.kit.relabel());
    return { meshes: [body, screen], focusY: 1.25, stand: 1.2 };
  },

  // ------------------------------------------------------------ PPE
  locker(c) {
    const frame = c.box(2.0, 2.0, 0.55, 0, 1.0, 0.1, "#5e6773", { outline: true, shadow: true });
    const back = c.box(1.9, 1.9, 0.02, 0, 1.0, -0.17, "#e9ecef");
    const shelves = [0.55, 1.15, 1.7].map((y) => c.box(1.9, 0.04, 0.45, 0, y, -0.05, "#8a96a8"));
    const items: Mesh[] = [];
    // Helmets, goggles, gloves, ear defenders, coverall: visual stock (selection happens in the inventory panel).
    [-0.65, -0.2, 0.25].forEach((x, i) => {
      const hm = c.sphere(0.3, x, 1.85, -0.1, [PALETTE.white, PALETTE.yellow, PALETTE.white][i]);
      hm.scaling.y = 0.65;
      items.push(hm);
    });
    items.push(c.box(0.3, 0.08, 0.1, 0.65, 1.25, -0.12, "#222"), c.box(0.3, 0.08, 0.1, 0.65, 1.38, -0.12, "#2a6fd1"));
    items.push(c.box(0.18, 0.25, 0.08, -0.6, 0.7, -0.12, "#d9a441"), c.box(0.18, 0.25, 0.08, -0.35, 0.7, -0.12, "#2f9e5b"));
    const ear = c.kit.torus(0.22, 0.05, c.V(0.05, 1.3, -0.12), "#e8423f", { parent: c.root });
    ear.rotation.x = Math.PI / 2;
    items.push(ear, c.box(0.45, 0.45, 0.08, 0.5, 0.75, -0.12, PALETTE.orange));
    const head = c.plate(c.text("title", "world.label.ppeStore"), 2.0, 0.24, 0, 2.15, -0.18, { bg: "#1d5fbf", fg: "#fff" });
    c.coll(0, 0.1, 2.0, 0.6);
    c.mapRect(0, 0.1, 2.0, 0.6, "#1d5fbf", "#fff");
    return { meshes: [frame, back, ...shelves, ...items, head], focusY: 1.2, stand: 1.5 };
  },

  // ------------------------------------------------------------ hot work
  welder(c) {
    const body = c.box(0.6, 0.6, 0.9, 0, 0.45, 0, "#1d5fbf", { outline: true });
    c.cyl(0.25, 0.08, -0.25, 0.12, -0.35, "#222", { rotZ: Math.PI / 2 });
    c.cyl(0.25, 0.08, 0.25, 0.12, -0.35, "#222", { rotZ: Math.PI / 2 });
    const coil = c.kit.torus(0.6, 0.06, c.V(0.7, 0.05, -0.4), "#111", { parent: c.root });
    const torch = c.box(0.05, 0.05, 0.35, 0.95, 0.08, -0.85, PALETTE.steelDark, { rotY: 0.6 });
    const plate = c.plate(() => c.t("world.label.welder"), 0.5, 0.12, 0, 0.62, -0.46, { bg: "#fff", fg: "#111" });
    c.coll(0, 0, 0.7, 1.0);
    return { meshes: [body, coil, torch, plate], focusY: 0.6, stand: 1.4 };
  },

  cylinders(c) {
    const trolley = c.box(0.9, 0.08, 0.5, 0, 0.1, 0, PALETTE.steelDark);
    const a = c.cyl(0.24, 1.4, -0.2, 0.85, 0, "#7a1f2b", { outline: true });
    const b = c.cyl(0.24, 1.4, 0.2, 0.85, 0, "#1a1a1a", { outline: true });
    const caps = [c.sphere(0.2, -0.2, 1.58, 0, "#c0c4cc"), c.sphere(0.2, 0.2, 1.58, 0, "#c0c4cc")];
    c.box(0.9, 0.04, 0.04, 0, 1.1, -0.15, "#c0c4cc");
    c.coll(0, 0, 0.9, 0.5);
    return { meshes: [trolley, a, b, ...caps], focusY: 1.0, stand: 1.3 };
  },

  combustibles(c) {
    // Rags, cardboard and an oily drum (state: present | cleared).
    const parts = [
      c.box(0.6, 0.4, 0.5, -0.4, 0.2, 0, "#b58a52", { outline: true }),
      c.box(0.5, 0.35, 0.45, 0.1, 0.18, 0.2, "#c49a5c", { rotY: 0.4, outline: true }),
      c.box(0.45, 0.3, 0.4, -0.25, 0.55, 0.05, "#a57d48", { rotY: -0.3 }),
      c.cyl(0.58, 0.88, 0.65, 0.44, -0.1, "#3a3a3a", { outline: true }),
      c.sphere(0.35, 0.2, 0.08, -0.35, "#d8cfb8"),
    ];
    c.coll(0, 0, 1.6, 0.9);
    const apply = (s: string) => setVisible(parts, s !== "cleared");
    apply(c.p.state ?? "present");
    c.onState(apply);
    return { meshes: parts, focusY: 0.4, stand: 1.4 };
  },

  drain(c) {
    // Floor drain: state open (uncovered) | covered.
    const rim = c.box(0.9, 0.04, 0.9, 0, 0.02, 0, PALETTE.steelDark);
    const hole = c.box(0.7, 0.045, 0.7, 0, 0.025, 0, "#050608");
    const grate: Mesh[] = [];
    for (let i = -3; i <= 3; i++) grate.push(c.box(0.04, 0.05, 0.7, i * 0.1, 0.03, 0, "#5d6876", { pickable: true }));
    const cover = c.box(1.0, 0.06, 1.0, 0, 0.04, 0, "#2f6f3f", { outline: true });
    const apply = (s: string) => {
      setVisible([cover], s === "covered");
      setVisible(grate, s !== "covered");
    };
    apply(c.p.state ?? "open");
    c.onState(apply);
    return { meshes: [rim, hole, ...grate, cover], focusY: 0.05, stand: 1.4 };
  },

  // ------------------------------------------------------------ fire & emergency
  extinguisher(c) {
    // state ok | missing | tagged
    c.box(0.1, 1.6, 0.1, 0, 0.8, 0.05, PALETTE.steelDark);
    const bracket = c.box(0.3, 0.06, 0.12, 0, 0.75, -0.02, "#333");
    const body = c.cyl(0.2, 0.6, 0, 1.0, -0.08, PALETTE.red, { outline: true });
    const head = c.box(0.08, 0.1, 0.08, 0, 1.36, -0.08, "#222");
    const sign = c.plate(() => c.t("world.label.extinguisher"), 0.5, 0.14, 0, 1.75, 0, { bg: PALETTE.red, fg: "#fff" });
    const tagm = c.tagMesh(0.08, 1.15, -0.2, "#ff5a5f");
    c.circle(0, 0, 0.2);
    c.mapCircle(0, 0, 0.3, PALETTE.red);
    const apply = (s: string) => {
      setVisible([body, head], s !== "missing");
      setVisible(tagm, s === "tagged");
    };
    apply(c.p.state ?? "ok");
    c.onState(apply);
    return { meshes: [bracket, body, head, sign], focusY: 1.0, stand: 1.3 };
  },

  call_point(c) {
    c.box(0.1, 1.3, 0.1, 0, 0.65, 0, PALETTE.steelDark);
    const box = c.box(0.3, 0.3, 0.1, 0, 1.4, -0.03, PALETTE.red, { outline: true });
    const glass = c.box(0.18, 0.18, 0.01, 0, 1.4, -0.085, "#f2f2ee");
    const sign = c.plate(() => c.t("world.label.callPoint"), 0.5, 0.12, 0, 1.68, -0.05, { bg: PALETTE.red, fg: "#fff" });
    c.circle(0, 0, 0.2);
    return { meshes: [box, glass, sign], focusY: 1.4, stand: 1.2 };
  },

  hose_reel(c) {
    const cab = c.box(0.8, 0.9, 0.3, 0, 1.0, 0, PALETTE.red, { outline: true });
    const reel = c.kit.torus(0.55, 0.12, c.V(0, 1.0, -0.17), "#b52a28", { parent: c.root });
    reel.rotation.x = Math.PI / 2;
    c.box(0.1, 0.6, 0.1, 0, 0.3, 0, PALETTE.steelDark);
    c.coll(0, 0, 0.8, 0.35);
    return { meshes: [cab, reel], focusY: 1.0, stand: 1.3 };
  },

  exit(c) {
    // Exit doorway in a wall section; state clear | blocked (pallet stack in front).
    const wall = c.num("wall", 6);
    const sideW = (wall - 1.4) / 2;
    c.box(sideW, 2.8, 0.25, -0.7 - sideW / 2, 1.4, 0, "#c9d3df", { outline: true, shadow: true });
    c.box(sideW, 2.8, 0.25, 0.7 + sideW / 2, 1.4, 0, "#c9d3df", { outline: true, shadow: true });
    c.box(1.4, 0.6, 0.25, 0, 2.5, 0, "#c9d3df");
    const door = c.box(1.3, 2.2, 0.06, 0, 1.1, 0.12, "#2f9e5b", { outline: true });
    const sign = c.plate(() => c.t("world.label.exit"), 1.0, 0.3, 0, 2.45, -0.14, { bg: "#1d8a4f", fg: "#fff" });
    c.coll(-0.7 - sideW / 2, 0, sideW, 0.25);
    c.coll(0.7 + sideW / 2, 0, sideW, 0.25);
    c.coll(0, 0.12, 1.4, 0.1);
    c.mapRect(0, 0, wall, 0.3, "#c9d3df");
    const block = [
      c.box(1.2, 0.5, 1.0, 0, 0.25, -0.75, "#8a6a44", { outline: true }),
      c.box(1.0, 0.5, 0.9, 0.05, 0.75, -0.75, "#c49a5c", { outline: true }),
      c.box(0.8, 0.45, 0.8, -0.05, 1.22, -0.75, "#b58a52"),
    ];
    const apply = (s: string) => setVisible(block, s === "blocked");
    apply(c.p.state ?? "clear");
    c.onState(apply);
    return { meshes: [door, sign, ...block], focusY: 1.2, stand: 2.2 };
  },

  smoke(c) {
    // Stylised smoke puffs (state on | off). No fire simulation.
    const mat = new StandardMaterial(`smoke_${Math.random().toString(36).slice(2, 7)}`, c.kit.scene);
    mat.diffuseColor = new Color3(0.35, 0.36, 0.4);
    mat.emissiveColor = new Color3(0.25, 0.25, 0.28);
    mat.alpha = 0.55;
    const puffs = Array.from({ length: 7 }, (_, i) => c.sphere(0.9 + (i % 3) * 0.3, 0, 0.5 + i * 0.6, 0, mat, { pickable: false }));
    for (const p of puffs) p.metadata = { dynamic: true };
    let on = c.p.state === "on";
    setVisible(puffs, on);
    c.onState((s) => {
      on = s === "on";
      setVisible(puffs, on);
    });
    c.anim.push((_dt, time) => {
      if (!on) return;
      puffs.forEach((p, i) => {
        const k = (time * 0.25 + i / puffs.length) % 1;
        p.position.y = 0.4 + k * 5;
        p.position.x = Math.sin(time * 0.7 + i) * 0.4 + k * 1.2;
        p.scaling.setAll(0.6 + k * 1.6);
      });
    });
    return { meshes: puffs, focusY: 1.5 };
  },

  siren(c) {
    c.cyl(0.14, 4, 0, 2, 0, PALETTE.steelDark);
    const horn = c.cyl(0.35, 0.4, 0, 3.6, -0.2, "#d8dde4", { rotX: Math.PI / 2, top: 0.15, outline: true });
    const bm = beaconMat(c, c.p.state === "on" ? "red" : "off");
    const light = c.cyl(0.3, 0.3, 0, 4.15, 0, bm.mat);
    c.circle(0, 0, 0.2);
    c.onState((s) => bm.set(s === "on" ? "red" : "off"));
    return { meshes: [horn, light], focusY: 3.6, stand: 2.5 };
  },

  windsock(c) {
    c.cyl(0.1, 6, 0, 3, 0, "#d8dde4");
    const sock = c.cyl(0.5, 1.6, 0.8, 5.8, 0, PALETTE.orange, { rotZ: Math.PI / 2, top: 0.2, outline: true });
    sock.metadata = { dynamic: true };
    c.anim.push((_dt, time) => (sock.rotation.y = Math.sin(time * 0.6) * 0.25));
    c.circle(0, 0, 0.15);
    return { meshes: [sock], focusY: 5.8, stand: 4 };
  },

  muster(c) {
    c.box(0.1, 2.2, 0.1, 0, 1.1, 0, PALETTE.steelDark);
    const sign = c.label(1.1, 1.1, 0, 2.0, -0.06, (ctx, w, h) => {
      ctx.fillStyle = "#1d8a4f";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = w * 0.03;
      ctx.strokeRect(w * 0.05, h * 0.05, w * 0.9, h * 0.9);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.font = `900 ${h * 0.3}px Arial`;
      ctx.fillText("⇧⇧", w / 2, h * 0.45);
      ctx.font = langFont(900, h * 0.11);
      ctx.fillText(c.t("world.label.muster"), w / 2, h * 0.75, w * 0.86);
    });
    const pad = c.box(4, 0.012, 4, 0, 0.012, -2.2, c.kit.mat("#1d8a4f", { emissive: 0.4, alpha: 0.55 }), { pickable: false });
    c.circle(0, 0, 0.15);
    c.mapRect(0, -2.2, 4, 4, "rgba(29,138,79,0.45)", "#3ddc84", "M");
    return { meshes: [sign, pad], focusY: 2.0, stand: 1.6 };
  },

  phone(c) {
    // Site radio / emergency phone point (opens the communication panel).
    c.box(0.1, 1.3, 0.1, 0, 0.65, 0, PALETTE.steelDark);
    const box = c.box(0.45, 0.55, 0.22, 0, 1.45, 0, PALETTE.yellow, { outline: true });
    const handset = c.box(0.08, 0.3, 0.07, -0.1, 1.45, -0.14, "#111", { outline: true });
    const sign = c.plate(() => c.t("world.label.radioPoint"), 0.6, 0.14, 0, 1.85, -0.1, { bg: PALETTE.navy, fg: "#fff" });
    c.coll(0, 0, 0.5, 0.35);
    return { meshes: [box, handset, sign], focusY: 1.45, stand: 1.25 };
  },

  // ------------------------------------------------------------ site clutter & structure
  scaffold(c) {
    const parts: Mesh[] = [];
    for (const [x, z] of [[-1, -0.6], [1, -0.6], [-1, 0.6], [1, 0.6]]) parts.push(c.box(0.06, 3.2, 0.06, x, 1.6, z, PALETTE.steel));
    for (const y of [1.0, 2.0, 3.0]) {
      parts.push(c.box(2.1, 0.05, 0.05, 0, y, -0.6, PALETTE.yellow), c.box(2.1, 0.05, 0.05, 0, y, 0.6, PALETTE.yellow));
    }
    parts.push(c.box(2.0, 0.06, 1.2, 0, 2.0, 0, "#a57d48", { outline: true }));
    parts.push(c.plate(() => c.t("world.label.scaffoldTag"), 0.5, 0.2, -0.7, 1.4, -0.62, { bg: c.str("tagColor", PALETTE.yellow), fg: "#111" }));
    c.coll(0, 0, 2.2, 1.3);
    c.mapRect(0, 0, 2.2, 1.3, "rgba(255,194,61,0.4)", PALETTE.yellow);
    return { meshes: parts, focusY: 1.4, stand: 1.8 };
  },

  hose(c) {
    const coil = c.kit.torus(0.8, 0.07, c.V(-0.6, 0.06, 0), "#2a6fd1", { parent: c.root });
    const run = c.box(2.4, 0.07, 0.07, 0.6, 0.035, 0, "#2a6fd1", { pickable: true });
    return { meshes: [coil, run], focusY: 0.1, stand: 1.4 };
  },

  spill(c) {
    const m = c.kit.mat("#141a20", { emissive: 0.05, alpha: 0.85 });
    const pool = c.cyl(c.num("size", 1.6), 0.012, 0, 0.014, 0, m, { tess: 20 });
    pool.scaling.z = 0.7;
    return { meshes: [pool], focusY: 0.05, stand: 1.6 };
  },

  pallets(c) {
    const parts = [c.box(1.2, 0.14, 1.0, 0, 0.07, 0, "#8a6a44", { outline: true }), c.box(1.0, 0.8, 0.8, 0, 0.55, 0, "#c49a5c", { outline: true }), c.box(0.8, 0.5, 0.7, 0.05, 1.2, 0, "#b58a52", { outline: true })];
    c.coll(0, 0, 1.2, 1.0);
    return { meshes: parts, focusY: 0.8, stand: 1.4 };
  },

  crate(c) {
    const b = c.box(1.0, 0.8, 0.8, 0, 0.4, 0, c.str("color", "#c49a5c"), { outline: true });
    c.coll(0, 0, 1.0, 0.8);
    return { meshes: [b], focusY: 0.6 };
  },

  drum(c) {
    const n = c.num("count", 3);
    const out: Mesh[] = [];
    for (let i = 0; i < n; i++) {
      out.push(c.cyl(0.58, 0.88, (i % 2) * 0.62 - 0.3, 0.44, Math.floor(i / 2) * 0.62, c.str("color", "#2a5d9c"), { outline: true }));
    }
    c.coll(0, 0.3, 1.3, 1.3);
    return { meshes: out, focusY: 0.6, stand: 1.5 };
  },

  cone(c) {
    const cone = c.cyl(0.35, 0.7, 0, 0.35, 0, PALETTE.orange, { top: 0.04, outline: true });
    c.cyl(0.38, 0.1, 0, 0.42, 0, "#fff", { top: 0.3 });
    return { meshes: [cone], focusY: 0.4 };
  },

  tape(c) {
    // Barrier tape rectangle (params w, d). Visual only unless params.solid.
    const w = c.num("w", 4);
    const d = c.num("d", 4);
    const tapeMat = c.kit.mat(c.str("color", PALETTE.red), { emissive: 0.4 });
    const posts: [number, number][] = [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]];
    for (const [x, z] of posts) c.box(0.08, 1.0, 0.08, x, 0.5, z, "#e8e8e8");
    c.box(w, 0.06, 0.02, 0, 0.95, -d / 2, tapeMat, { pickable: false });
    c.box(w, 0.06, 0.02, 0, 0.95, d / 2, tapeMat, { pickable: false });
    c.box(0.02, 0.06, d, -w / 2, 0.95, 0, tapeMat, { pickable: false });
    c.box(0.02, 0.06, d, w / 2, 0.95, 0, tapeMat, { pickable: false });
    c.box(w, 0.01, d, 0, 0.01, 0, c.kit.mat(c.str("color", PALETTE.red), { emissive: 0.4, alpha: 0.25 }), { pickable: false });
    c.mapRect(0, 0, w, d, "rgba(232,66,63,0.18)", c.str("color", PALETTE.red));
    return { meshes: [], focusY: 0.9 };
  },

  sign(c) {
    c.box(0.08, 1.6, 0.08, 0, 0.8, 0.02, PALETTE.steelDark);
    const kind = c.str("signKind", c.str("kind", "warning")) as "warning" | "mandatory" | "prohibition" | "info" | "danger";
    const s = c.sign(kind, c.text("text", "world.sign.trainingArea"), 0, 1.75, -0.03, c.num("size", 0.8));
    c.circle(0, 0, 0.1);
    return { meshes: [s], focusY: 1.75, stand: 1.4 };
  },

  ladder(c) {
    const parts = [c.box(0.06, 3.2, 0.06, -0.25, 1.5, 0.3, "#c0c4cc", { rotX: -0.25 }), c.box(0.06, 3.2, 0.06, 0.25, 1.5, 0.3, "#c0c4cc", { rotX: -0.25 })];
    for (let i = 0; i < 9; i++) parts.push(c.box(0.5, 0.04, 0.04, 0, 0.3 + i * 0.33, 0.6 - (0.3 + i * 0.33) * 0.255, "#c0c4cc"));
    return { meshes: parts, focusY: 1.4 };
  },

  toolcart(c) {
    const body = c.box(0.9, 0.8, 0.5, 0, 0.5, 0, PALETTE.red, { outline: true });
    c.box(0.85, 0.04, 0.45, 0, 0.92, 0, "#333");
    const tools = [c.box(0.3, 0.04, 0.05, -0.15, 0.96, 0, PALETTE.steel), c.box(0.05, 0.04, 0.3, 0.2, 0.96, 0, PALETTE.yellow)];
    c.coll(0, 0, 0.9, 0.5);
    return { meshes: [body, ...tools], focusY: 0.9, stand: 1.3 };
  },

  tripod(c) {
    const legs = [0, 2.1, 4.2].map((a) => c.box(0.06, 2.4, 0.06, Math.cos(a) * 0.5, 1.1, Math.sin(a) * 0.5, PALETTE.yellow, { rotZ: Math.cos(a) * 0.4, rotX: -Math.sin(a) * 0.4 }));
    const head = c.box(0.25, 0.15, 0.25, 0, 2.25, 0, PALETTE.steelDark);
    c.circle(0, 0, 0.6);
    return { meshes: [...legs, head], focusY: 1.5 };
  },

  fan(c) {
    // Portable ventilation blower with duct (state on | off).
    const body = c.cyl(0.6, 0.45, 0, 0.45, 0, PALETTE.yellow, { rotX: Math.PI / 2, outline: true });
    const blade = c.box(0.5, 0.06, 0.02, 0, 0.45, -0.24, "#222");
    const duct = c.cyl(0.35, 2.0, 0, 0.45, 1.2, "#cfcfcf", { rotX: Math.PI / 2 });
    c.coll(0, 0.5, 0.7, 2.6);
    let on = c.p.state === "on";
    c.onState((s) => (on = s === "on"));
    c.anim.push((dt) => on && (blade.rotation.z += dt * 20));
    return { meshes: [body, blade, duct], focusY: 0.5, stand: 1.4 };
  },

  worker(c) {
    const ch = c.kit.character({ suit: c.str("suit", "#5d6876"), helmet: c.str("helmet", PALETTE.yellow), vest: c.str("vest", PALETTE.orange) }, c.V(0, 0, 0), Math.PI);
    ch.root.parent = c.root;
    c.circle(0, 0, 0.35);
    return { meshes: ch.meshes, focusY: 1.6, stand: 1.4 };
  },

  building(c) {
    const w = c.num("w", 6);
    const d = c.num("d", 5);
    const h = c.num("h", 3.5);
    const body = c.box(w, h, d, 0, h / 2, 0, c.str("color", "#e9ecef"), { outline: true, shadow: true });
    c.box(w + 0.3, 0.25, d + 0.3, 0, h + 0.12, 0, PALETTE.steelDark);
    const door = c.box(1.1, 2.2, 0.08, 0, 1.1, -d / 2 - 0.03, PALETTE.petrol, { outline: true });
    const parts: AbstractMesh[] = [body, door];
    if (c.str("sign")) parts.push(c.plate(c.text("sign"), Math.min(3.2, w * 0.8), 0.5, 0, 2.75, -d / 2 - 0.05, { bg: c.str("signBg", PALETTE.navy), fg: "#fff" }));
    for (let x = -w / 2 + 1; x < w / 2 - 0.6; x += 1.6) if (Math.abs(x) > 0.9) c.box(0.9, 0.7, 0.05, x, h * 0.62, -d / 2 - 0.03, c.kit.mat("#9fd3ff", { emissive: 0.6 }));
    c.coll(0, 0, w, d);
    c.mapRect(0, 0, w, d, "#3b4b63", "#8aa0bf");
    return { meshes: parts, focusY: 1.5, stand: 2 };
  },

  wall(c) {
    const len = c.num("len", 6);
    const b = c.box(len, c.num("h", 2.6), 0.25, 0, c.num("h", 2.6) / 2, 0, c.str("color", "#c9d3df"), { outline: true, shadow: true });
    c.coll(0, 0, len, 0.25);
    c.mapRect(0, 0, len, 0.3, "#c9d3df");
    return { meshes: [b], focusY: 1.3 };
  },

  barrier(c) {
    const len = c.num("len", 4);
    const a = c.w(-len / 2, 0);
    const b = c.w(len / 2, 0);
    const parts = c.kit.barrier([a.x, a.z], [b.x, b.z]);
    return { meshes: parts, focusY: 0.8 };
  },

  pipe(c) {
    const len = c.num("len", 8);
    const y = c.num("y", 3);
    const pipe = c.cyl(c.num("d", 0.3), len, 0, y, 0, c.str("color", PALETTE.steel), { rotZ: Math.PI / 2 });
    if (y < 2.2) c.coll(0, 0, len, c.num("d", 0.3) + 0.1);
    return { meshes: [pipe], focusY: y };
  },
};

export const PROP_TYPES = Object.keys(B);

export function buildProp(kit: Kit, t: Tr, p: Prop, map: MapShape[]): PropInstance {
  void map;
  const builder = B[p.type];
  if (!builder) throw new Error(`Unknown prop type "${p.type}"`);
  const c = new PropCtx(kit, t, p);
  const rect0 = kit.colliders.length;
  const circ0 = kit.circles.length;
  const r = builder(c);
  // Remember this prop's collision so hidden props never block movement.
  const rects = kit.colliders.slice(rect0).map((rc) => ({ rc, orig: { ...rc } }));
  const circs = kit.circles.slice(circ0).map((cc) => ({ cc, r: cc.r }));
  const setSolid = (on: boolean) => {
    for (const { rc, orig } of rects) Object.assign(rc, on ? orig : { minX: 1e9, maxX: 1e9, minZ: 1e9, maxZ: 1e9 });
    for (const { cc, r: rr } of circs) cc.r = on ? rr : 0;
  };
  const fz = r.focusZ ?? -0.1;
  // Invisible target volume at the focus point: sparse props (scaffolds, empty
  // brackets, hoses) stay targetable from their stand point whatever their state.
  if (p.id) {
    const hit = kit.box(0.6, 0.6, 0.6, new Vector3(0, r.focusY, fz), "#ffffff", { parent: c.root, pickable: true });
    hit.visibility = 0;
    hit.metadata = { hitVolume: true };
    r.meshes.push(hit);
  }
  const fw = c.w(0, fz);
  const sd = r.stand ?? 1.6;
  const st = c.w(0, Math.min(fz, 0) - sd);
  let hidden = p.state === "hidden";
  c.root.setEnabled(!hidden);
  setSolid(!hidden);
  const inst: PropInstance = {
    root: c.root,
    meshes: r.meshes,
    focus: new Vector3(fw.x, r.focusY, fw.z),
    stand: st,
    setState(state: string) {
      if (state === "hidden" || state === "shown") return inst.setHidden(state === "hidden");
      inst.setHidden(false);
      c.states.forEach((fn) => fn(state));
    },
    setHidden(h: boolean) {
      hidden = h;
      c.root.setEnabled(!hidden);
      setSolid(!hidden);
    },
    update: c.anim.length ? (dt, time, player) => !hidden && c.anim.forEach((fn) => fn(dt, time, player)) : undefined,
  };
  return inst;
}
