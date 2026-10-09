// Reusable procedural building blocks for all industrial worlds.
// Visual language: flat "comic" shading (strong ambient + emissive lift, low
// specular), bold dark outlines on key objects, high-contrast safety colours.
import {
  Color3,
  CreateBox,
  CreateCapsule,
  CreateCylinder,
  CreateDisc,
  CreatePlane,
  CreateSphere,
  CreateTorus,
  DynamicTexture,
  Mesh,
  StandardMaterial,
  TransformNode,
  Vector3,
  type AbstractMesh,
  type Scene,
} from "../babylon";
import type { Circle, MapShape, Rect } from "./types";

export const PALETTE = {
  navy: "#14233d",
  orange: "#ff7a1a",
  steel: "#8a96a8",
  steelDark: "#4f5a6a",
  petrol: "#1f6f8b",
  yellow: "#ffc23d",
  red: "#e8423f",
  green: "#2fbf71",
  concrete: "#a7a39a",
  asphalt: "#3a3f47",
  white: "#f2f2ee",
  black: "#15171c",
  blue: "#2f7ddc",
  skin: "#c98d5e",
};

export interface Placement {
  parent?: TransformNode | null;
  rotY?: number;
  rotX?: number;
  rotZ?: number;
  collider?: boolean;
  shadow?: boolean;
  outline?: boolean;
  pickable?: boolean;
}

interface LabelEntry {
  tex: DynamicTexture;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}

const OUTLINE = Color3.FromHexString("#0b1220");

export function langFont(weight = 700, size = 40): string {
  const lang = document.documentElement.dataset.lang ?? "en";
  const fam =
    lang === "ta" ? '"Noto Sans Tamil", "Tamil Sangam MN", sans-serif' : lang === "hi" ? '"Noto Sans Devanagari", "Kohinoor Devanagari", sans-serif' : "system-ui, -apple-system, Arial, sans-serif";
  return `${weight} ${size}px ${fam}`;
}

/** Wrap text into lines that fit maxWidth. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export class Kit {
  readonly colliders: Rect[] = [];
  readonly circles: Circle[] = [];
  readonly map: MapShape[] = [];
  readonly shadowCasters: AbstractMesh[] = [];
  private mats = new Map<string, StandardMaterial>();
  private labels: LabelEntry[] = [];
  private counter = 0;

  constructor(readonly scene: Scene) {}

  private name(prefix: string): string {
    return `${prefix}_${this.counter++}`;
  }

  /** Cached flat "comic" material. */
  mat(hex: string, opts: { emissive?: number; alpha?: number; glow?: boolean } = {}): StandardMaterial {
    const key = `${hex}|${opts.emissive ?? ""}|${opts.alpha ?? ""}|${opts.glow ?? ""}`;
    const hit = this.mats.get(key);
    if (hit) return hit;
    const m = new StandardMaterial(this.name("mat"), this.scene);
    const c = Color3.FromHexString(hex);
    m.diffuseColor = c;
    m.specularColor = new Color3(0.06, 0.06, 0.06);
    m.emissiveColor = opts.glow ? c : c.scale(opts.emissive ?? 0.22);
    if (opts.alpha !== undefined) m.alpha = opts.alpha;
    m.freeze();
    this.mats.set(key, m);
    return m;
  }

  private place(mesh: Mesh, pos: Vector3, p: Placement): Mesh {
    mesh.position.copyFrom(pos);
    if (p.parent) mesh.parent = p.parent;
    if (p.rotY) mesh.rotation.y = p.rotY;
    if (p.rotX) mesh.rotation.x = p.rotX;
    if (p.rotZ) mesh.rotation.z = p.rotZ;
    mesh.isPickable = p.pickable ?? true;
    if (p.shadow) this.shadowCasters.push(mesh);
    if (p.outline) this.outline(mesh);
    return mesh;
  }

  outline(mesh: AbstractMesh, width = 0.025): void {
    mesh.renderOutline = true;
    mesh.outlineColor = OUTLINE;
    mesh.outlineWidth = width;
  }

  box(w: number, h: number, d: number, pos: Vector3, color: string | StandardMaterial, p: Placement = {}): Mesh {
    const m = CreateBox(this.name("box"), { width: w, height: h, depth: d }, this.scene);
    m.material = typeof color === "string" ? this.mat(color) : color;
    this.place(m, pos, p);
    if (p.collider) this.addCollider(pos.x, pos.z, w, d, p.rotY ?? 0);
    return m;
  }

  cyl(diameter: number, height: number, pos: Vector3, color: string | StandardMaterial, p: Placement & { tess?: number; top?: number } = {}): Mesh {
    const m = CreateCylinder(this.name("cyl"), { diameterBottom: diameter, diameterTop: p.top ?? diameter, height, tessellation: p.tess ?? 18 }, this.scene);
    m.material = typeof color === "string" ? this.mat(color) : color;
    this.place(m, pos, p);
    if (p.collider) this.circles.push({ x: pos.x, z: pos.z, r: diameter / 2 });
    return m;
  }

  sphere(diameter: number, pos: Vector3, color: string | StandardMaterial, p: Placement = {}): Mesh {
    const m = CreateSphere(this.name("sph"), { diameter, segments: 12 }, this.scene);
    m.material = typeof color === "string" ? this.mat(color) : color;
    return this.place(m, pos, p);
  }

  torus(diameter: number, thickness: number, pos: Vector3, color: string, p: Placement = {}): Mesh {
    const m = CreateTorus(this.name("tor"), { diameter, thickness, tessellation: 20 }, this.scene);
    m.material = this.mat(color);
    return this.place(m, pos, p);
  }

  /** Axis-aligned (or rotated) rectangle collider in XZ. */
  addCollider(cx: number, cz: number, w: number, d: number, rotY = 0): void {
    const quarter = Math.abs(Math.round(rotY / (Math.PI / 2))) % 2 === 1;
    const hw = (quarter ? d : w) / 2;
    const hd = (quarter ? w : d) / 2;
    this.colliders.push({ minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd });
  }

  /** Straight pipe between two points (any direction). */
  pipe(a: Vector3, b: Vector3, diameter: number, color: string, p: Placement = {}): Mesh {
    const dir = b.subtract(a);
    const len = dir.length();
    const m = CreateCylinder(this.name("pipe"), { diameter, height: len, tessellation: 14 }, this.scene);
    m.material = this.mat(color);
    m.position = a.add(dir.scale(0.5));
    const up = new Vector3(0, 1, 0);
    const axis = Vector3.Cross(up, dir.normalize());
    const angle = Math.acos(Math.min(1, Math.max(-1, Vector3.Dot(up, dir.normalize()))));
    if (axis.lengthSquared() > 1e-6) m.rotationQuaternion = null, m.rotate(axis.normalize(), angle);
    else if (dir.y < 0) m.rotation.x = Math.PI;
    if (p.parent) m.parent = p.parent;
    m.isPickable = p.pickable ?? true;
    if (p.shadow) this.shadowCasters.push(m);
    return m;
  }

  /** Pipe through a list of points with elbow spheres and optional flanges at the ends. */
  pipeRun(points: Vector3[], diameter: number, color: string, opts: { flanges?: boolean; parent?: TransformNode } = {}): Mesh[] {
    const out: Mesh[] = [];
    for (let i = 0; i < points.length - 1; i++) out.push(this.pipe(points[i], points[i + 1], diameter, color, { parent: opts.parent }));
    for (let i = 1; i < points.length - 1; i++) out.push(this.sphere(diameter * 1.08, points[i], color, { parent: opts.parent }));
    if (opts.flanges) {
      for (const [p, q] of [[points[0], points[1]], [points[points.length - 1], points[points.length - 2]]] as const) {
        out.push(this.flange(p, q.subtract(p).normalize(), diameter, opts.parent));
      }
    }
    return out;
  }

  flange(pos: Vector3, axis: Vector3, pipeDiameter: number, parent?: TransformNode): Mesh {
    const m = CreateCylinder(this.name("flg"), { diameter: pipeDiameter * 1.9, height: 0.06, tessellation: 16 }, this.scene);
    m.material = this.mat(PALETTE.steelDark);
    m.position.copyFrom(pos.add(axis.scale(0.05)));
    const up = new Vector3(0, 1, 0);
    const ax = Vector3.Cross(up, axis);
    if (ax.lengthSquared() > 1e-6) m.rotate(ax.normalize(), Math.acos(Vector3.Dot(up, axis)));
    if (parent) m.parent = parent;
    return m;
  }

  /** Gate valve with handwheel; axis is the pipe direction ("x", "y" or "z"). */
  valve(pos: Vector3, axis: "x" | "y" | "z", pipeD: number, wheelColor = PALETTE.red, parent?: TransformNode): Mesh[] {
    const body = this.box(pipeD * 1.8, pipeD * 1.8, pipeD * 1.8, pos, PALETTE.steelDark, { parent });
    const stemDir = axis === "y" ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
    const stemTop = pos.add(stemDir.scale(pipeD * 2.2));
    const stem = this.pipe(pos, stemTop, 0.04, PALETTE.steel, { parent });
    const wheel = this.torus(pipeD * 2.2, 0.04, stemTop, wheelColor, { parent });
    if (axis === "y") wheel.rotation.z = Math.PI / 2;
    this.outline(wheel, 0.015);
    return [body, stem, wheel];
  }

  /** Round pressure gauge facing direction rotY. Purely visual: no values are simulated. */
  gauge(pos: Vector3, rotY: number, parent?: TransformNode): Mesh[] {
    const root = new TransformNode(this.name("gaugeRoot"), this.scene);
    root.position.copyFrom(pos);
    root.rotation.y = rotY;
    if (parent) root.parent = parent;
    const rim = CreateCylinder(this.name("gaugeRim"), { diameter: 0.26, height: 0.06, tessellation: 24 }, this.scene);
    rim.rotation.x = Math.PI / 2;
    rim.material = this.mat(PALETTE.steel);
    rim.parent = root;
    const face = CreateDisc(this.name("gaugeFace"), { radius: 0.11, tessellation: 24 }, this.scene);
    face.position.z = -0.035;
    face.rotation.y = Math.PI;
    face.parent = root;
    const tex = new DynamicTexture(this.name("gaugeTex"), { width: 128, height: 128 }, this.scene, true);
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.fillStyle = "#f4f4ef";
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 3;
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
      ctx.beginPath();
      ctx.moveTo(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46);
      ctx.lineTo(64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56);
      ctx.stroke();
    }
    // Needle drawn at rest: the training scene does not display invented readings.
    ctx.strokeStyle = PALETTE.red;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(64, 64);
    ctx.lineTo(64 + Math.cos(Math.PI * 0.75) * 44, 64 + Math.sin(Math.PI * 0.75) * 44);
    ctx.stroke();
    tex.update();
    const fm = new StandardMaterial(this.name("gaugeMat"), this.scene);
    fm.diffuseTexture = tex;
    fm.emissiveColor = new Color3(0.5, 0.5, 0.5);
    fm.specularColor = Color3.Black();
    face.material = fm;
    const neck = this.pipe(new Vector3(0, 0, 0.03), new Vector3(0, -0.18, 0.03), 0.04, PALETTE.steel, { parent: root });
    return [rim, face, neck];
  }

  /** Translatable in-world label (re-drawn on language change). */
  label(w: number, h: number, pos: Vector3, rotY: number, draw: (ctx: CanvasRenderingContext2D, pw: number, ph: number) => void, p: Placement & { res?: number; doubleSided?: boolean } = {}): Mesh {
    const res = p.res ?? 256;
    const pw = Math.round(res * (w / Math.max(w, h)) * 2);
    const ph = Math.round(res * (h / Math.max(w, h)) * 2);
    const plane = CreatePlane(this.name("label"), { width: w, height: h, sideOrientation: p.doubleSided ? Mesh.DOUBLESIDE : Mesh.FRONTSIDE }, this.scene);
    const tex = new DynamicTexture(this.name("labelTex"), { width: pw, height: ph }, this.scene, true);
    tex.hasAlpha = true;
    const m = new StandardMaterial(this.name("labelMat"), this.scene);
    m.diffuseTexture = tex;
    m.useAlphaFromDiffuseTexture = true;
    m.emissiveColor = new Color3(0.75, 0.75, 0.75);
    m.specularColor = Color3.Black();
    plane.material = m;
    // Planes face -Z by default; rotate so the readable side faces the given heading.
    plane.rotation.y = rotY + Math.PI;
    this.place(plane, pos, { ...p, rotY: undefined });
    plane.rotation.y = rotY + Math.PI;
    const entry: LabelEntry = { tex, draw };
    this.labels.push(entry);
    this.redraw(entry);
    return plane;
  }

  private redraw(e: LabelEntry): void {
    const size = e.tex.getSize();
    const ctx = e.tex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, size.width, size.height);
    e.draw(ctx, size.width, size.height);
    e.tex.update();
  }

  relabel(): void {
    this.labels.forEach((l) => this.redraw(l));
  }

  /** Standard sign: "warning" (yellow triangle), "mandatory" (blue circle), "prohibition" (red ring), "info" (green), "danger" (red header). */
  sign(kind: "warning" | "mandatory" | "prohibition" | "info" | "danger", text: () => string, pos: Vector3, rotY: number, size = 0.9, p: Placement = {}): Mesh {
    return this.label(size, size * 1.25, pos, rotY, (ctx, w, h) => {
      ctx.fillStyle = "#fbfbf6";
      ctx.strokeStyle = "#111";
      ctx.lineWidth = w * 0.03;
      ctx.beginPath();
      ctx.roundRect(4, 4, w - 8, h - 8, w * 0.05);
      ctx.fill();
      ctx.stroke();
      const cx = w / 2;
      const cy = h * 0.36;
      const r = w * 0.27;
      if (kind === "warning") {
        ctx.fillStyle = PALETTE.yellow;
        ctx.beginPath();
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + r * 1.1, cy + r * 0.8);
        ctx.lineTo(cx - r * 1.1, cy + r * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#111";
        ctx.font = `900 ${r * 1.1}px Arial`;
        ctx.textAlign = "center";
        ctx.fillText("!", cx, cy + r * 0.6);
      } else if (kind === "mandatory" || kind === "info") {
        ctx.fillStyle = kind === "mandatory" ? "#1d5fbf" : "#1d8a4f";
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = `900 ${r * 0.9}px Arial`;
        ctx.textAlign = "center";
        ctx.fillText(kind === "mandatory" ? "⛑" : "i", cx, cy + r * 0.32);
      } else if (kind === "prohibition") {
        ctx.strokeStyle = PALETTE.red;
        ctx.lineWidth = r * 0.22;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.moveTo(cx - r * 0.7, cy - r * 0.7);
        ctx.lineTo(cx + r * 0.7, cy + r * 0.7);
        ctx.stroke();
      } else {
        ctx.fillStyle = PALETTE.red;
        ctx.fillRect(10, 10, w - 20, h * 0.22);
        ctx.fillStyle = "#fff";
        ctx.font = `900 ${h * 0.13}px Arial`;
        ctx.textAlign = "center";
        ctx.fillText("⚠", cx, h * 0.19);
      }
      ctx.fillStyle = "#111";
      ctx.textAlign = "center";
      let fs = h * 0.1;
      ctx.font = langFont(800, fs);
      let lines = wrapText(ctx, text(), w * 0.86);
      while (lines.length > 3 && fs > h * 0.05) {
        fs *= 0.88;
        ctx.font = langFont(800, fs);
        lines = wrapText(ctx, text(), w * 0.86);
      }
      lines.slice(0, 4).forEach((ln, i) => ctx.fillText(ln, cx, h * 0.72 + i * fs * 1.15));
    }, p);
  }

  /** Text plate (equipment tag / building sign). */
  plate(text: () => string, w: number, h: number, pos: Vector3, rotY: number, colors: { bg: string; fg: string } = { bg: PALETTE.yellow, fg: "#111" }, p: Placement = {}): Mesh {
    return this.label(w, h, pos, rotY, (ctx, pw, ph) => {
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, pw, ph);
      ctx.strokeStyle = "#111";
      ctx.lineWidth = Math.max(4, ph * 0.06);
      ctx.strokeRect(0, 0, pw, ph);
      ctx.fillStyle = colors.fg;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      let fs = ph * 0.55;
      ctx.font = langFont(900, fs);
      while (ctx.measureText(text()).width > pw * 0.92 && fs > 8) {
        fs *= 0.9;
        ctx.font = langFont(900, fs);
      }
      ctx.fillText(text(), pw / 2, ph / 2);
    }, p);
  }

  /** Yellow/black barrier between two ground points; blocks movement. */
  barrier(a: [number, number], b: [number, number], height = 1.05): Mesh[] {
    const out: Mesh[] = [];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    const rot = Math.atan2(dx, dz);
    const mid = new Vector3((a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2);
    const posts = Math.max(2, Math.ceil(len / 2) + 1);
    for (let i = 0; i < posts; i++) {
      const f = i / (posts - 1);
      out.push(this.box(0.1, height, 0.1, new Vector3(a[0] + dx * f, height / 2, a[1] + dz * f), PALETTE.yellow));
    }
    for (const y of [height * 0.55, height * 0.95]) {
      const rail = this.box(0.06, 0.12, len, new Vector3(mid.x, y, mid.z), this.stripeMat(), { rotY: rot });
      out.push(rail);
    }
    // Thin collider along the segment.
    const minX = Math.min(a[0], b[0]) - 0.12;
    const maxX = Math.max(a[0], b[0]) + 0.12;
    const minZ = Math.min(a[1], b[1]) - 0.12;
    const maxZ = Math.max(a[1], b[1]) + 0.12;
    this.colliders.push({ minX, maxX, minZ, maxZ });
    this.map.push({ kind: "line", pts: [a, b], stroke: PALETTE.yellow, width: 2 });
    return out;
  }

  private stripe: StandardMaterial | null = null;
  stripeMat(): StandardMaterial {
    if (this.stripe) return this.stripe;
    const tex = new DynamicTexture(this.name("stripe"), { width: 128, height: 32 }, this.scene, true);
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.fillStyle = PALETTE.yellow;
    ctx.fillRect(0, 0, 128, 32);
    ctx.fillStyle = "#111";
    for (let x = -32; x < 160; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 32);
      ctx.lineTo(x + 16, 32);
      ctx.lineTo(x + 32, 0);
      ctx.lineTo(x + 16, 0);
      ctx.fill();
    }
    tex.update();
    tex.wrapU = 1;
    tex.uScale = 6;
    const m = new StandardMaterial(this.name("stripeMat"), this.scene);
    m.diffuseTexture = tex;
    m.emissiveColor = new Color3(0.3, 0.3, 0.3);
    m.specularColor = Color3.Black();
    this.stripe = m;
    return m;
  }

  /** Simple building with flat roof, door and sign. */
  building(rect: Rect, height: number, wall: string, opts: { door?: { side: "n" | "s" | "e" | "w"; offset?: number }; sign?: () => string; signColors?: { bg: string; fg: string }; roof?: string; windows?: boolean } = {}): Mesh[] {
    const w = rect.maxX - rect.minX;
    const d = rect.maxZ - rect.minZ;
    const cx = (rect.minX + rect.maxX) / 2;
    const cz = (rect.minZ + rect.maxZ) / 2;
    const out: Mesh[] = [];
    const body = this.box(w, height, d, new Vector3(cx, height / 2, cz), wall, { collider: true, shadow: true, outline: true });
    out.push(body);
    out.push(this.box(w + 0.3, 0.25, d + 0.3, new Vector3(cx, height + 0.12, cz), opts.roof ?? PALETTE.steelDark));
    if (opts.door) {
      const side = opts.door.side;
      const off = opts.door.offset ?? 0;
      const dpos =
        side === "s" ? new Vector3(cx + off, 1.1, rect.minZ - 0.03) : side === "n" ? new Vector3(cx + off, 1.1, rect.maxZ + 0.03) : side === "e" ? new Vector3(rect.maxX + 0.03, 1.1, cz + off) : new Vector3(rect.minX - 0.03, 1.1, cz + off);
      const rot = side === "e" || side === "w" ? Math.PI / 2 : 0;
      out.push(this.box(1.1, 2.2, 0.08, dpos, PALETTE.petrol, { rotY: rot, outline: true }));
      if (opts.sign) {
        const spos = dpos.add(new Vector3(0, 1.6, 0));
        const heading = side === "s" ? Math.PI : side === "n" ? 0 : side === "e" ? Math.PI / 2 : -Math.PI / 2;
        const push = side === "s" ? new Vector3(0, 0, -0.03) : side === "n" ? new Vector3(0, 0, 0.03) : side === "e" ? new Vector3(0.03, 0, 0) : new Vector3(-0.03, 0, 0);
        out.push(this.plate(opts.sign, Math.min(3.2, (side === "e" || side === "w" ? d : w) * 0.8), 0.5, spos.add(push), heading, opts.signColors ?? { bg: PALETTE.navy, fg: "#fff" }));
      }
    }
    if (opts.windows) {
      for (let x = rect.minX + 1; x < rect.maxX - 0.6; x += 1.6) {
        out.push(this.box(0.9, 0.7, 0.05, new Vector3(x + 0.3, height * 0.62, rect.minZ - 0.03), this.mat("#9fd3ff", { emissive: 0.6 })));
      }
    }
    this.map.push({ kind: "rect", rect, fill: "#3b4b63", stroke: "#8aa0bf" });
    return out;
  }

  /** Vertical storage tank with roof cone and ring stairs hint. */
  tank(x: number, z: number, r: number, h: number, color = PALETTE.white): Mesh[] {
    const out = [
      this.cyl(r * 2, h, new Vector3(x, h / 2, z), color, { collider: true, shadow: true, outline: true, tess: 32 }),
      this.cyl(r * 2.02, 0.6, new Vector3(x, h + 0.3, z), PALETTE.steel, { top: r * 0.4, tess: 32 }),
      this.cyl(r * 2.04, 0.18, new Vector3(x, h * 0.33, z), PALETTE.orange, { tess: 32 }),
    ];
    this.map.push({ kind: "circle", x, z, r, fill: "#c9ccd2", stroke: "#666" });
    return out;
  }

  lightPole(x: number, z: number, h = 6): Mesh[] {
    return [
      this.cyl(0.14, h, new Vector3(x, h / 2, z), PALETTE.steelDark),
      this.box(0.8, 0.12, 0.3, new Vector3(x, h, z), PALETTE.steelDark),
      this.box(0.6, 0.05, 0.22, new Vector3(x, h - 0.08, z), this.mat("#fff4c2", { glow: true })),
    ];
  }

  /** Low-poly worker character; returns parts so the caller can animate. */
  character(colors: { suit: string; helmet: string; vest?: string }, pos: Vector3, heading: number): { root: TransformNode; meshes: Mesh[]; head: Mesh; armL: Mesh; armR: Mesh } {
    const root = new TransformNode(this.name("npc"), this.scene);
    root.position.copyFrom(pos);
    root.rotation.y = heading;
    const meshes: Mesh[] = [];
    const add = (m: Mesh) => {
      m.parent = root;
      meshes.push(m);
      this.outline(m, 0.02);
      return m;
    };
    const legL = add(this.box(0.2, 0.85, 0.24, new Vector3(-0.13, 0.43, 0), PALETTE.navy));
    const legR = add(this.box(0.2, 0.85, 0.24, new Vector3(0.13, 0.43, 0), PALETTE.navy));
    void legL;
    void legR;
    const torso = CreateCapsule(this.name("torso"), { radius: 0.24, height: 0.85, tessellation: 12 }, this.scene);
    torso.material = this.mat(colors.suit);
    torso.position.set(0, 1.25, 0);
    add(torso);
    if (colors.vest) {
      const vest = add(this.box(0.52, 0.5, 0.36, new Vector3(0, 1.3, 0), colors.vest));
      vest.scaling.z = 1.02;
      add(this.box(0.53, 0.06, 0.37, new Vector3(0, 1.38, 0), "#e9eef5"));
    }
    const head = add(this.sphere(0.32, new Vector3(0, 1.86, 0), PALETTE.skin));
    add(this.sphere(0.34, new Vector3(0, 1.93, 0), colors.helmet)).scaling.y = 0.7;
    add(this.box(0.4, 0.03, 0.42, new Vector3(0, 1.88, 0.04), colors.helmet));
    // Eyes so the facing direction reads clearly.
    add(this.sphere(0.05, new Vector3(-0.07, 1.88, 0.14), "#111"));
    add(this.sphere(0.05, new Vector3(0.07, 1.88, 0.14), "#111"));
    const armL = add(this.box(0.14, 0.7, 0.16, new Vector3(-0.36, 1.25, 0), colors.suit));
    const armR = add(this.box(0.14, 0.7, 0.16, new Vector3(0.36, 1.25, 0), colors.suit));
    // Clipboard in hand.
    add(this.box(0.26, 0.34, 0.03, new Vector3(0.42, 0.95, 0.12), "#7a5a36"));
    meshes.forEach((m) => this.shadowCasters.push(m));
    return { root, meshes, head, armL, armR };
  }
}
