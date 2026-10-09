// Lightweight first-person hands built from primitives, rendered in their own
// rendering group so they never clip into walls. Poses blend smoothly.
import { Color3, CreateBox, CreateCylinder, Mesh, StandardMaterial, TransformNode, Vector3, type FreeCamera, type Scene } from "../babylon";

export type HandPose = "idle" | "inspect" | "checklist" | "tool" | "hidden";
export type HeldTool = "flashlight" | "spanner" | "radio" | null;

interface PoseDef {
  l: [number, number, number, number]; // x, y, z, rotX
  r: [number, number, number, number];
}

const POSES: Record<HandPose, PoseDef> = {
  idle: { l: [-0.3, -0.33, 0.6, 0.25], r: [0.3, -0.33, 0.6, 0.25] },
  inspect: { l: [-0.38, -0.42, 0.6, 0.25], r: [0.24, -0.22, 0.62, -0.3] },
  checklist: { l: [-0.12, -0.3, 0.55, -0.6], r: [0.3, -0.36, 0.55, -0.2] },
  tool: { l: [-0.36, -0.42, 0.6, 0.25], r: [0.3, -0.3, 0.62, -0.1] },
  hidden: { l: [-0.4, -0.9, 0.5, 0.2], r: [0.4, -0.9, 0.5, 0.2] },
};

export class Hands {
  private root: TransformNode;
  private left: TransformNode;
  private right: TransformNode;
  private tablet: Mesh;
  private tools: Record<Exclude<HeldTool, null>, TransformNode>;
  pose: HandPose = "idle";
  tool: HeldTool = null;
  private time = 0;

  constructor(private scene: Scene, camera: FreeCamera) {
    this.root = new TransformNode("hands", scene);
    this.root.parent = camera;
    const skin = this.mat("#c98d5e");
    const glove = this.mat("#ff7a1a");
    const sleeve = this.mat("#2b5fa8");
    const make = (name: string, side: number) => {
      const n = new TransformNode(name, scene);
      n.parent = this.root;
      this.part(CreateBox(`${name}_sleeve`, { width: 0.11, height: 0.11, depth: 0.32 }, scene), sleeve, n, new Vector3(0, 0, -0.18));
      this.part(CreateBox(`${name}_palm`, { width: 0.1, height: 0.045, depth: 0.12 }, scene), glove, n, new Vector3(0, 0, 0.02));
      for (let i = 0; i < 4; i++) this.part(CreateBox(`${name}_f${i}`, { width: 0.018, height: 0.022, depth: 0.07 }, scene), glove, n, new Vector3(-0.034 + i * 0.023, 0.0, 0.11));
      this.part(CreateBox(`${name}_thumb`, { width: 0.022, height: 0.022, depth: 0.06 }, scene), skin, n, new Vector3(side * -0.06, 0.005, 0.05)).rotation.y = side * 0.5;
      return n;
    };
    this.left = make("handL", -1);
    this.right = make("handR", 1);
    // Handheld checklist tablet (held by the left hand).
    this.tablet = this.part(CreateBox("tablet", { width: 0.22, height: 0.015, depth: 0.3 }, scene), this.mat("#26313f"), this.left, new Vector3(0.09, 0.02, 0.08));
    const screen = this.part(CreateBox("tabletScreen", { width: 0.19, height: 0.005, depth: 0.25 }, scene), this.mat("#3ddc84", 0.9), this.tablet, new Vector3(0, 0.01, 0));
    void screen;
    this.tools = {
      flashlight: this.toolNode("flashlight", (n) => {
        this.part(CreateCylinder("fl_body", { diameter: 0.035, height: 0.2 }, scene), this.mat("#222"), n, new Vector3(0, 0, 0.08)).rotation.x = Math.PI / 2;
        this.part(CreateCylinder("fl_head", { diameterTop: 0.05, diameterBottom: 0.035, height: 0.05 }, scene), this.mat("#ffc23d"), n, new Vector3(0, 0, 0.2)).rotation.x = Math.PI / 2;
      }),
      spanner: this.toolNode("spanner", (n) => {
        this.part(CreateBox("sp_shaft", { width: 0.025, height: 0.012, depth: 0.22 }, scene), this.mat("#9aa3ad"), n, new Vector3(0, 0, 0.1));
        this.part(CreateBox("sp_head", { width: 0.06, height: 0.014, depth: 0.04 }, scene), this.mat("#9aa3ad"), n, new Vector3(0, 0, 0.22));
      }),
      radio: this.toolNode("radio", (n) => {
        this.part(CreateBox("rd_body", { width: 0.06, height: 0.12, depth: 0.03 }, scene), this.mat("#1b1f26"), n, new Vector3(0, 0.05, 0.05));
        this.part(CreateCylinder("rd_ant", { diameter: 0.01, height: 0.08 }, scene), this.mat("#111"), n, new Vector3(0.02, 0.15, 0.05));
      }),
    };
    this.applyVisibility();
    this.snap();
  }

  private mat(hex: string, emissive = 0.3): StandardMaterial {
    const m = new StandardMaterial(`handMat_${hex}`, this.scene);
    const c = Color3.FromHexString(hex);
    m.diffuseColor = c;
    m.emissiveColor = c.scale(emissive);
    m.specularColor = new Color3(0.05, 0.05, 0.05);
    return m;
  }

  private part(m: Mesh, mat: StandardMaterial, parent: TransformNode, pos: Vector3): Mesh {
    m.material = mat;
    m.parent = parent;
    m.position.copyFrom(pos);
    m.isPickable = false;
    m.renderingGroupId = 1;
    m.renderOutline = true;
    m.outlineWidth = 0.004;
    m.outlineColor = Color3.FromHexString("#0b1220");
    return m;
  }

  private toolNode(name: string, build: (n: TransformNode) => void): TransformNode {
    const n = new TransformNode(`tool_${name}`, this.scene);
    n.parent = this.right;
    n.position.set(0, 0.02, 0.06);
    build(n);
    return n;
  }

  setPose(p: HandPose): void {
    this.pose = p;
    this.applyVisibility();
  }

  setTool(t: HeldTool): void {
    this.tool = t;
    this.applyVisibility();
  }

  private applyVisibility(): void {
    this.tablet.setEnabled(this.pose === "checklist");
    for (const [k, n] of Object.entries(this.tools)) n.setEnabled(this.tool === k && this.pose !== "checklist" && this.pose !== "hidden");
  }

  private target(): PoseDef {
    if (this.pose === "idle" && this.tool) return POSES.tool;
    return POSES[this.pose];
  }

  private snap(): void {
    const t = this.target();
    this.left.position.set(t.l[0], t.l[1], t.l[2]);
    this.right.position.set(t.r[0], t.r[1], t.r[2]);
  }

  update(dt: number, moving: number): void {
    this.time += dt;
    const t = this.target();
    const k = 1 - Math.exp(-dt * 10);
    const sway = Math.sin(this.time * (moving > 0.3 ? 8 : 1.6)) * (moving > 0.3 ? 0.012 : 0.004);
    const lerp = (n: TransformNode, p: [number, number, number, number], s: number) => {
      n.position.x += (p[0] - n.position.x) * k;
      n.position.y += (p[1] + sway * s - n.position.y) * k;
      n.position.z += (p[2] - n.position.z) * k;
      n.rotation.x += (p[3] - n.rotation.x) * k;
    };
    lerp(this.left, t.l, 1);
    lerp(this.right, t.r, -1);
  }

  dispose(): void {
    this.root.dispose(false, true);
  }
}
