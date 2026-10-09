// World 1 — Petrochemical processing facility ("Unit 3", fictional).
// Layout (metres, x east, z north): gate at south, briefing area by the
// safety office, pump workstation in the centre, permit shelter at its
// entrance, workshop and control room to the east, taped restricted process
// area, pipe rack and tank farm to the north.
import { Color3, CreateGround, DynamicTexture, Mesh, StandardMaterial, TransformNode, Vector3, type AbstractMesh } from "../babylon";
import { Kit, PALETTE, langFont, wrapText } from "./kit";
import type { Anchor, WorldBuild, WorldContext } from "./types";

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);

export function groundTexture(kit: Kit, base: string, line: string, size = 120): StandardMaterial {
  const tex = new DynamicTexture("groundTex", { width: 1024, height: 1024 }, kit.scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 1024, 1024);
  // Subtle speckle for an asphalt/concrete read without image assets.
  for (let i = 0; i < 6000; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
  }
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  const step = 1024 / (size / 4);
  for (let x = 0; x <= 1024; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 1024);
    ctx.moveTo(0, x);
    ctx.lineTo(1024, x);
    ctx.stroke();
  }
  tex.update();
  const m = new StandardMaterial("groundMat", kit.scene);
  m.diffuseTexture = tex;
  m.specularColor = Color3.Black();
  m.emissiveColor = new Color3(0.12, 0.12, 0.13);
  return m;
}

/** Flat painted rectangle on the ground (walkways, zone markings). */
export function paint(kit: Kit, cx: number, cz: number, w: number, d: number, color: string, alpha = 1, y = 0.012): Mesh {
  const m = kit.box(w, 0.01, d, V(cx, y, cz), kit.mat(color, { emissive: 0.4, alpha }), { pickable: false });
  m.receiveShadows = true;
  return m;
}

/** Hatched zone border made of painted strips. */
export function zoneBorder(kit: Kit, minX: number, maxX: number, minZ: number, maxZ: number, color: string): void {
  const t = 0.14;
  paint(kit, (minX + maxX) / 2, minZ, maxX - minX, t, color);
  paint(kit, (minX + maxX) / 2, maxZ, maxX - minX, t, color);
  paint(kit, minX, (minZ + maxZ) / 2, t, maxZ - minZ, color);
  paint(kit, maxX, (minZ + maxZ) / 2, t, maxZ - minZ, color);
}

export function tagAnchor(anchors: Map<string, Anchor>, id: string, kind: Anchor["kind"], focus: Vector3, meshes: AbstractMesh[]): void {
  for (const m of meshes) {
    m.isPickable = true;
    m.metadata = { ...(m.metadata ?? {}), anchorId: id };
  }
  anchors.set(id, { id, kind, focus, meshes });
}

/** A wall-mounted information board with title and wrapped lines (translated). */
export function infoBoard(kit: Kit, title: () => string, lines: () => string[], w: number, h: number, pos: Vector3, heading: number, accent = PALETTE.green): Mesh {
  return kit.label(w, h, pos, heading, (ctx, pw, ph) => {
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
    for (const line of lines()) {
      for (const ln of wrapText(ctx, `• ${line}`, pw * 0.9)) {
        if (y > ph - fs * 1.4) break;
        ctx.fillText(ln, pw * 0.05, y);
        y += fs * 1.3;
      }
      y += fs * 0.4;
    }
  });
}

export function buildPetrochem(ctx: WorldContext): WorldBuild {
  const { scene, t } = ctx;
  const kit = new Kit(scene);
  const anchors = new Map<string, Anchor>();
  const animated: { update: (dt: number, time: number, player: Vector3) => void }[] = [];

  // ---------------------------------------------------------------- ground
  const ground = CreateGround("ground", { width: 140, height: 140 }, scene);
  ground.material = groundTexture(kit, PALETTE.asphalt, "rgba(255,255,255,0.05)", 140);
  ground.receiveShadows = true;
  ground.isPickable = true;
  // Concrete process pad under the workstation.
  paint(kit, 0, 4.5, 11, 10, PALETTE.concrete, 1, 0.008);
  // Walkway from gate to workstation with yellow edge lines.
  paint(kit, 0, -11.5, 2.4, 23, "#5a616c", 1, 0.01);
  paint(kit, -1.25, -11.5, 0.12, 23, PALETTE.yellow);
  paint(kit, 1.25, -11.5, 0.12, 23, PALETTE.yellow);
  // Branch walkway to the briefing point.
  paint(kit, -2.5, -12, 3.2, 2.0, "#5a616c", 1, 0.011);
  // Briefing point marking.
  const bp = kit.label(2.6, 2.6, V(-3, 0.02, -12.6), 0, (c, w, h) => {
    c.strokeStyle = PALETTE.green;
    c.lineWidth = w * 0.05;
    c.beginPath();
    c.arc(w / 2, h / 2, w * 0.42, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = PALETTE.green;
    c.textAlign = "center";
    c.font = langFont(900, h * 0.11);
    c.fillText(t("world.label.briefingPoint"), w / 2, h * 0.55, w * 0.8);
  }, { pickable: false });
  bp.rotation.set(Math.PI / 2, 0, 0);
  zoneBorder(kit, -5, 5, 0, 9, PALETTE.yellow);
  // Restricted area hatch.
  paint(kit, 11.5, 5.5, 7, 7, "#5b2a2a", 0.55, 0.009);
  zoneBorder(kit, 8, 15, 2, 9, PALETTE.red);

  kit.map.push({ kind: "rect", rect: { minX: -5, maxX: 5, minZ: 0, maxZ: 9 }, fill: "rgba(255,194,61,0.12)", stroke: PALETTE.yellow });
  kit.map.push({ kind: "rect", rect: { minX: 8, maxX: 15, minZ: 2, maxZ: 9 }, fill: "rgba(232,66,63,0.18)", stroke: PALETTE.red });
  kit.map.push({ kind: "line", pts: [[0, -23], [0, 0]], stroke: "#7f8896", width: 6 });

  // ---------------------------------------------------------------- perimeter & gate (Scene 01)
  const fenceMat = kit.mat("#9aa3ad", { alpha: 0.55 });
  const fence = (a: [number, number], b: [number, number]) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const rot = Math.atan2(b[0] - a[0], b[1] - a[1]);
    kit.box(0.04, 2.2, len, V((a[0] + b[0]) / 2, 1.1, (a[1] + b[1]) / 2), fenceMat, { rotY: rot, pickable: false });
    kit.map.push({ kind: "line", pts: [a, b], stroke: "#8a96a8", width: 2, dash: [4, 3] });
  };
  fence([-20, -17], [-4, -17]);
  fence([4, -17], [20, -17]);
  fence([-20, -17], [-20, 13]);
  fence([20, -17], [20, 13]);
  fence([-20, 13], [20, 13]);
  // Gate arch with location sign.
  kit.box(0.4, 4.6, 0.4, V(-4, 2.3, -17), PALETTE.orange, { collider: true, outline: true });
  kit.box(0.4, 4.6, 0.4, V(4, 2.3, -17), PALETTE.orange, { collider: true, outline: true });
  kit.box(8.6, 0.9, 0.4, V(0, 4.8, -17), PALETTE.navy, { outline: true });
  kit.plate(() => t("world.label.gate"), 8.2, 0.75, V(0, 4.8, -17.22), Math.PI, { bg: PALETTE.navy, fg: "#fff" });
  kit.sign("mandatory", () => t("world.sign.ppe"), V(-5.2, 1.6, -17.05), Math.PI);
  kit.sign("warning", () => t("world.sign.trainingArea"), V(5.2, 1.6, -17.05), Math.PI);
  // Security booth.
  kit.building({ minX: 6, maxX: 8.4, minZ: -21, maxZ: -18.8 }, 2.6, "#d8dde4", { door: { side: "w" }, windows: false });

  // ---------------------------------------------------------------- safety office + supervisor (Scenes 01–03)
  kit.building({ minX: -13, maxX: -6.5, minZ: -15, maxZ: -9 }, 3.3, "#e9ecef", { door: { side: "e" }, sign: () => t("world.label.safetyOffice"), signColors: { bg: PALETTE.green, fg: "#fff" }, windows: true });
  infoBoard(kit, () => t("world.label.noticeBoard"), () => [t("world.notice.1"), t("world.notice.2"), t("world.notice.3")], 2.2, 1.5, V(-6.44, 1.7, -10.4), Math.PI / 2, PALETTE.blue);

  const npcDef = ctx.mission.npcs.find((n) => n.id === "supervisor");
  if (npcDef) {
    const npc = kit.character({ suit: "#2b5fa8", helmet: "#f2f2ee", vest: PALETTE.orange }, V(npcDef.x, 0, npcDef.z), (npcDef.heading * Math.PI) / 180);
    tagAnchor(anchors, npcDef.id, "npc", V(npcDef.x, 1.6, npcDef.z), npc.meshes);
    kit.addCollider(npcDef.x, npcDef.z, 0.7, 0.7);
    // Name plate above the head.
    const tagPlate = kit.plate(() => t(npcDef.nameKey), 1.4, 0.26, V(0, 2.35, 0), 0, { bg: PALETTE.navy, fg: "#fff" }, { pickable: false });
    tagPlate.parent = npc.root;
    tagPlate.billboardMode = Mesh.BILLBOARDMODE_Y;
    const baseHeading = (npcDef.heading * Math.PI) / 180;
    animated.push({
      update: (_dt, time, player) => {
        // Idle breathing + turn head towards the player when close.
        npc.root.position.y = Math.sin(time * 2) * 0.01;
        npc.armR.rotation.x = Math.sin(time * 1.3) * 0.08;
        const dx = player.x - npc.root.position.x;
        const dz = player.z - npc.root.position.z;
        const dist = Math.hypot(dx, dz);
        const target = dist < 6 ? Math.atan2(dx, dz) : baseHeading;
        let diff = target - npc.root.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        npc.root.rotation.y += diff * Math.min(1, _dt * 3);
      },
    });
  }

  // ---------------------------------------------------------------- control room & workshop
  kit.building({ minX: 8, maxX: 15, minZ: -15, maxZ: -9 }, 4, "#c9d3df", { door: { side: "w" }, sign: () => t("world.label.controlRoom"), signColors: { bg: PALETTE.red, fg: "#fff" }, windows: true });
  kit.box(1.4, 0.2, 1.6, V(7.3, 0.1, -12), PALETTE.concrete);
  kit.sign("prohibition", () => t("world.sign.authorisedOnly"), V(7.94, 1.5, -10.6), -Math.PI / 2, 0.7);
  // Workshop: open shed.
  const ws = { minX: 10, maxX: 17, minZ: -6, maxZ: -1 };
  kit.box(7, 3, 0.2, V(13.5, 1.5, -6), "#b8c0ca", { collider: true, shadow: true });
  kit.box(0.2, 3, 5, V(17, 1.5, -3.5), "#b8c0ca", { collider: true });
  kit.box(0.2, 3, 5, V(10, 1.5, -3.5), "#b8c0ca", { collider: true });
  kit.box(7.6, 0.15, 5.6, V(13.5, 3.05, -3.5), PALETTE.steelDark);
  kit.box(2.4, 0.9, 0.9, V(13.5, 0.45, -5.2), "#7a5a36", { collider: true, outline: true });
  kit.box(2.2, 1.6, 0.1, V(13.5, 1.9, -5.85), "#5e6773");
  for (let i = 0; i < 6; i++) kit.box(0.05, 0.4, 0.05, V(12.6 + i * 0.35, 1.9, -5.78), PALETTE.steel);
  kit.cyl(0.6, 0.9, V(16.2, 0.45, -1.8), "#2a5d9c", { collider: true });
  kit.plate(() => t("world.label.workshop"), 3, 0.45, V(13.5, 2.6, -1.0), Math.PI, { bg: PALETTE.navy, fg: "#fff" });
  kit.map.push({ kind: "rect", rect: ws, fill: "#34465e", stroke: "#8aa0bf" });

  // ---------------------------------------------------------------- pump workstation barriers & signs
  kit.barrier([-5, 0], [-1.5, 0]);
  kit.barrier([1.5, 0], [5, 0]);
  kit.barrier([-5, 0], [-5, 9]);
  kit.barrier([5, 0], [5, 9]);
  kit.barrier([-5, 9], [5, 9]);
  kit.sign("warning", () => t("world.sign.rotating"), V(-2.2, 1.6, -0.06), Math.PI, 0.75);
  kit.sign("mandatory", () => t("world.sign.ppe"), V(2.2, 1.6, -0.06), Math.PI, 0.75);
  kit.plate(() => t("world.zone.pumpWorkstation"), 2.8, 0.4, V(0, 2.6, -0.05), Math.PI, { bg: PALETTE.yellow, fg: "#111" });
  kit.box(0.12, 2.8, 0.12, V(-1.5, 1.4, 0), PALETTE.yellow);
  kit.box(0.12, 2.8, 0.12, V(1.5, 1.4, 0), PALETTE.yellow);

  // ---------------------------------------------------------------- pumps (Scenes 05–06)
  const pumpUnit = (id: string, motorId: string | null, z: number, tag: string, tagKey: string) => {
    const root = new TransformNode(`${id}_root`, scene);
    kit.box(4.4, 0.3, 1.4, V(-0.3, 0.15, z), PALETTE.concrete, { collider: true });
    kit.box(3.9, 0.12, 1.0, V(-0.3, 0.36, z), PALETTE.steelDark);
    const pumpMeshes: Mesh[] = [];
    // Volute casing: short wide cylinder on its side + suction nozzle + discharge nozzle.
    const volute = kit.cyl(0.95, 0.42, V(-1.4, 0.95, z), PALETTE.blue, { rotZ: Math.PI / 2, shadow: true, outline: true, tess: 28, parent: root });
    const bearing = kit.box(0.7, 0.42, 0.42, V(-0.8, 0.75, z), PALETTE.blue, { outline: true, parent: root });
    const foot = kit.box(1.4, 0.18, 0.7, V(-1.1, 0.5, z), PALETTE.blue, { parent: root });
    const suction = kit.cyl(0.32, 0.6, V(-1.95, 0.95, z), PALETTE.blue, { rotZ: Math.PI / 2, parent: root });
    const discharge = kit.cyl(0.26, 0.55, V(-1.4, 1.55, z), PALETTE.blue, { parent: root });
    pumpMeshes.push(volute, bearing, foot, suction, discharge);
    // Coupling guard (orange) between pump and motor.
    const guard = kit.box(0.5, 0.36, 0.4, V(-0.25, 0.75, z), PALETTE.orange, { outline: true });
    pumpMeshes.push(guard);
    const tagPlate = kit.plate(() => tag, 0.5, 0.18, V(-1.4, 1.0, z - 0.49), Math.PI, { bg: PALETTE.yellow, fg: "#111" });
    pumpMeshes.push(tagPlate);
    tagAnchor(anchors, id, "interactable", V(-1.2, 0.95, z), pumpMeshes);
    void tagKey;
    // Motor with cooling fins and terminal box.
    const motorMeshes: Mesh[] = [];
    motorMeshes.push(kit.cyl(0.62, 1.15, V(0.65, 0.78, z), "#6f7b8c", { rotZ: Math.PI / 2, shadow: true, outline: true, tess: 24 }));
    for (let i = 0; i < 7; i++) motorMeshes.push(kit.cyl(0.68, 0.04, V(0.2 + i * 0.15, 0.78, z), "#5d6876", { rotZ: Math.PI / 2, tess: 24 }));
    motorMeshes.push(kit.box(0.3, 0.26, 0.3, V(0.7, 1.18, z), "#5d6876", { outline: true }));
    motorMeshes.push(kit.cyl(0.5, 0.08, V(1.26, 0.78, z), "#4a5463", { rotZ: Math.PI / 2 }));
    motorMeshes.push(kit.box(0.9, 0.2, 0.6, V(0.65, 0.5, z), "#5d6876"));
    if (motorId) {
      motorMeshes.push(kit.plate(() => "M-101", 0.4, 0.15, V(0.65, 0.78, z - 0.33), Math.PI, { bg: "#fff", fg: "#111" }));
      tagAnchor(anchors, motorId, "interactable", V(0.65, 0.8, z), motorMeshes);
    }
    // Suction pipe west with valve, discharge riser with valve, gauge and flanges.
    kit.pipeRun([V(-2.25, 0.95, z), V(-4.3, 0.95, z), V(-4.3, 4.6, z), V(-4.3, 4.6, 10.6)], 0.26, PALETTE.steel, { flanges: true });
    kit.valve(V(-3.1, 0.95, z), "x", 0.26, PALETTE.red);
    kit.pipeRun([V(-1.4, 1.82, z), V(-1.4, 3.1, z), V(-1.4, 3.1, 10.6)], 0.2, PALETTE.steel, { flanges: true });
    kit.valve(V(-1.4, 2.3, z), "y", 0.2, PALETTE.red);
    kit.gauge(V(-1.12, 2.75, z - 0.0), Math.PI / 2);
    kit.map.push({ kind: "rect", rect: { minX: -2.5, maxX: 1.9, minZ: z - 0.7, maxZ: z + 0.7 }, fill: id === "pump_p101" ? "#2f7ddc" : "#4a6fa3", stroke: "#fff", label: tag });
  };
  pumpUnit("pump_p101", "motor_m101", 3.2, "P-101", "world.obj.pump.name");
  pumpUnit("pump_p102", null, 6.4, "P-102", "world.obj.pump2.name");

  // ---------------------------------------------------------------- status panel + beacon (Scene 06, 08)
  const sp = V(3.3, 0, 2.0);
  const panelHeading = -Math.PI * 0.75; // facing south-west towards the entrance
  const panelBody = kit.box(0.9, 1.6, 0.35, V(sp.x, 0.8, sp.z), "#4f5d70", { rotY: panelHeading, collider: true, outline: true, shadow: true });
  const panelScreen = kit.label(0.74, 0.55, V(sp.x - Math.sin(panelHeading) * -0.18, 1.15, sp.z - Math.cos(panelHeading) * -0.18), panelHeading, (c, w, h) => {
    c.fillStyle = "#04121f";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#3ddc84";
    c.font = `700 ${h * 0.12}px monospace`;
    c.fillText("P-101", w * 0.06, h * 0.18);
    c.fillStyle = "#ffc23d";
    c.font = langFont(700, h * 0.1);
    c.fillText(t("world.panel.run"), w * 0.06, h * 0.42, w * 0.88);
    c.fillStyle = "#ff5a5f";
    c.fillText(t("world.panel.isolation"), w * 0.06, h * 0.66, w * 0.88);
    c.fillStyle = "#9fb3cf";
    c.font = langFont(500, h * 0.07);
    c.fillText(t("world.panel.trainingOnly"), w * 0.06, h * 0.88, w * 0.88);
  });
  tagAnchor(anchors, "status_panel", "interactable", V(sp.x, 1.15, sp.z), [panelBody, panelScreen]);
  const beaconBase = kit.cyl(0.2, 0.12, V(sp.x, 1.66, sp.z), "#333");
  const beaconMat = new StandardMaterial("beaconMat", scene);
  beaconMat.diffuseColor = Color3.FromHexString("#ffb300");
  beaconMat.emissiveColor = Color3.FromHexString("#ff9a00");
  beaconMat.alpha = 0.9;
  const beacon = kit.cyl(0.18, 0.24, V(sp.x, 1.84, sp.z), beaconMat, { tess: 16 });
  kit.outline(beacon, 0.015);
  tagAnchor(anchors, "warning_beacon", "interactable", V(sp.x, 1.84, sp.z), [beacon, beaconBase]);
  animated.push({
    update: (_dt, time) => {
      const pulse = 0.55 + 0.45 * Math.max(0, Math.sin(time * 6));
      beaconMat.emissiveColor.set(1 * pulse, 0.6 * pulse, 0);
    },
  });

  // ---------------------------------------------------------------- local control station + MCC (Scene 08)
  const lc = [
    kit.box(0.1, 1.2, 0.1, V(2.7, 0.6, 4.7), PALETTE.steelDark),
    kit.box(0.42, 0.5, 0.22, V(2.7, 1.35, 4.7), PALETTE.yellow, { outline: true }),
    kit.cyl(0.11, 0.06, V(2.62, 1.45, 4.58), PALETTE.red, { rotX: Math.PI / 2 }),
    kit.cyl(0.09, 0.06, V(2.8, 1.45, 4.58), PALETTE.green, { rotX: Math.PI / 2 }),
    kit.box(0.08, 0.12, 0.05, V(2.7, 1.24, 4.58), "#111"),
  ];
  kit.addCollider(2.7, 4.7, 0.5, 0.4);
  tagAnchor(anchors, "local_control", "interactable", V(2.7, 1.35, 4.7), lc);

  const mcc = [
    kit.box(1.9, 2.1, 0.6, V(-3.4, 1.05, 8.3), "#c7ccd3", { collider: true, outline: true, shadow: true }),
    kit.box(0.04, 1.9, 0.02, V(-3.4, 1.05, 7.99), "#7b8491"),
    kit.box(0.05, 0.2, 0.05, V(-3.25, 1.1, 7.97), "#333"),
    kit.box(0.05, 0.2, 0.05, V(-3.55, 1.1, 7.97), "#333"),
  ];
  mcc.push(kit.plate(() => "MCC-3", 0.6, 0.18, V(-3.4, 1.92, 7.98), Math.PI, { bg: "#fff", fg: "#111" }));
  mcc.push(kit.sign("danger", () => t("world.sign.highVoltage"), V(-2.9, 1.45, 7.98), Math.PI, 0.38));
  tagAnchor(anchors, "elec_cabinet", "interactable", V(-3.4, 1.2, 8.3), mcc);
  kit.map.push({ kind: "rect", rect: { minX: -4.35, maxX: -2.45, minZ: 8.0, maxZ: 8.6 }, fill: "#c7ccd3" });

  // ---------------------------------------------------------------- notice board, permit shelter (Scenes 07, 09–11)
  const boardPos = V(-3.0, 0, -1.0);
  const board = [
    kit.box(0.08, 1.9, 0.08, V(boardPos.x - 0.85, 0.95, boardPos.z), PALETTE.steelDark),
    kit.box(0.08, 1.9, 0.08, V(boardPos.x + 0.85, 0.95, boardPos.z), PALETTE.steelDark),
    infoBoard(kit, () => t("world.obj.safetyBoard.name"), () => [t("world.obj.safetyBoard.d1"), t("world.obj.safetyBoard.d2"), t("world.obj.safetyBoard.d3")], 1.8, 1.25, V(boardPos.x, 1.45, boardPos.z - 0.05), Math.PI),
  ];
  kit.addCollider(boardPos.x, boardPos.z, 1.9, 0.2);
  tagAnchor(anchors, "safety_board", "interactable", V(boardPos.x, 1.45, boardPos.z), board);

  // Shelter roof and posts.
  for (const [x, z] of [[2.3, -2.7], [6.5, -2.7], [2.3, -0.4], [6.5, -0.4]] as const) kit.box(0.12, 2.7, 0.12, V(x, 1.35, z), PALETTE.steelDark, { collider: true });
  kit.box(4.6, 0.12, 2.7, V(4.4, 2.76, -1.55), PALETTE.orange, { outline: true });
  kit.plate(() => t("world.label.permitDesk"), 2.6, 0.38, V(4.4, 2.5, -2.82), Math.PI, { bg: PALETTE.orange, fg: "#111" });
  const desk = [
    kit.box(1.5, 0.08, 0.75, V(3.4, 0.86, -1.4), "#8a6a44", { outline: true }),
    kit.box(0.08, 0.82, 0.7, V(2.72, 0.41, -1.4), "#5e6773"),
    kit.box(0.08, 0.82, 0.7, V(4.08, 0.41, -1.4), "#5e6773"),
    kit.box(0.42, 0.03, 0.32, V(3.2, 0.92, -1.45), "#f2f2ee", { rotY: 0.15 }),
    kit.box(0.42, 0.03, 0.32, V(3.66, 0.92, -1.35), "#f2f2ee", { rotY: -0.1 }),
    kit.box(0.34, 0.06, 0.26, V(3.45, 0.95, -1.6), PALETTE.red, { rotY: 0.05, outline: true }),
  ];
  kit.addCollider(3.4, -1.4, 1.5, 0.75);
  tagAnchor(anchors, "work_docs", "interactable", V(3.4, 0.95, -1.4), desk);
  const stationPos = V(5.6, 0, -1.0);
  const station = [
    kit.box(0.08, 1.1, 0.08, V(stationPos.x - 0.5, 0.55, stationPos.z), PALETTE.steelDark),
    kit.box(0.08, 1.1, 0.08, V(stationPos.x + 0.5, 0.55, stationPos.z), PALETTE.steelDark),
    kit.box(1.2, 0.9, 0.06, V(stationPos.x, 1.45, stationPos.z), PALETTE.navy, { outline: true }),
    infoBoard(kit, () => t("world.obj.checklistStation.name"), () => [t("mission.silentPump.evidence.workOrder"), t("mission.silentPump.evidence.handover"), t("mission.silentPump.evidence.observation"), t("mission.silentPump.evidence.isolation")], 1.1, 0.8, V(stationPos.x, 1.45, stationPos.z - 0.04), Math.PI, PALETTE.orange),
  ];
  kit.addCollider(stationPos.x, stationPos.z, 1.2, 0.2);
  tagAnchor(anchors, "checklist_station", "interactable", V(stationPos.x, 1.4, stationPos.z), station);
  kit.map.push({ kind: "rect", rect: { minX: 2.3, maxX: 6.5, minZ: -2.7, maxZ: -0.4 }, fill: "rgba(255,122,26,0.35)", stroke: PALETTE.orange });
  // Fire extinguisher by the shelter (environmental detail).
  kit.cyl(0.18, 0.55, V(6.8, 0.3, -2.0), PALETTE.red, { outline: true });

  // ---------------------------------------------------------------- restricted process area (east)
  for (const [x, z] of [[8, 2], [15, 2], [8, 9], [15, 9], [8, 5.5], [15, 5.5], [11.5, 2], [11.5, 9]] as const) kit.box(0.08, 1.0, 0.08, V(x, 0.5, z), "#e8e8e8");
  const tapeMat = kit.mat(PALETTE.red, { emissive: 0.4 });
  kit.box(7, 0.06, 0.02, V(11.5, 0.95, 2), tapeMat, { pickable: false });
  kit.box(7, 0.06, 0.02, V(11.5, 0.95, 9), tapeMat, { pickable: false });
  kit.box(0.02, 0.06, 7, V(8, 0.95, 5.5), tapeMat, { pickable: false });
  kit.box(0.02, 0.06, 7, V(15, 0.95, 5.5), tapeMat, { pickable: false });
  kit.sign("prohibition", () => t("world.sign.authorisedOnly"), V(7.94, 1.3, 4.0), -Math.PI / 2, 0.7);
  kit.cyl(1.4, 4.5, V(11, 2.25, 5), "#d8dde4", { collider: true, shadow: true, outline: true });
  kit.cyl(1.0, 3.2, V(13.4, 1.6, 7), "#d8dde4", { collider: true, outline: true });
  kit.cyl(0.9, 3.6, V(12.5, 1.0, 3.6), PALETTE.petrol, { rotX: Math.PI / 2, outline: true });
  kit.addCollider(12.5, 3.6, 1.0, 3.6);
  kit.map.push({ kind: "circle", x: 11, z: 5, r: 0.7, fill: "#c9ccd2" });
  kit.map.push({ kind: "circle", x: 13.4, z: 7, r: 0.5, fill: "#c9ccd2" });

  // ---------------------------------------------------------------- pipe rack, tank farm, skyline
  for (let x = -18; x <= 18; x += 4) {
    kit.box(0.25, 4.8, 0.25, V(x, 2.4, 10.2), PALETTE.steelDark, { collider: true });
    kit.box(0.25, 4.8, 0.25, V(x, 2.4, 11.4), PALETTE.steelDark, { collider: true });
    kit.box(0.2, 0.2, 1.4, V(x, 4.6, 10.8), PALETTE.steelDark);
  }
  [[PALETTE.steel, 0.35, 10.5], [PALETTE.yellow, 0.25, 10.9], [PALETTE.petrol, 0.4, 11.2], [PALETTE.green, 0.2, 10.3]].forEach(([c, d, z]) =>
    kit.pipe(V(-19, 4.9, z as number), V(19, 4.9, z as number), d as number, c as string),
  );
  kit.map.push({ kind: "rect", rect: { minX: -19, maxX: 19, minZ: 10, maxZ: 11.6 }, fill: "#5d6876" });
  kit.tank(-12, 19, 4, 8);
  kit.tank(0, 21, 5, 9.5);
  kit.tank(12, 19, 4, 7, "#e7e3d4");
  // Distillation column + flare stack on the skyline (beyond the fence, decorative).
  kit.cyl(2.2, 22, V(-26, 11, 4), "#c7ccd3", { outline: true, tess: 20 });
  for (let y = 4; y < 22; y += 4) kit.cyl(2.6, 0.25, V(-26, y, 4), PALETTE.steelDark, { tess: 20 });
  kit.cyl(0.8, 30, V(26, 15, 26), "#b9bec7", { tess: 12 });
  const flareMat = new StandardMaterial("flare", scene);
  flareMat.emissiveColor = Color3.FromHexString("#ff8a1a");
  flareMat.diffuseColor = Color3.Black();
  flareMat.disableLighting = true;
  const flare = kit.cyl(1.2, 3, V(26, 31.5, 26), flareMat, { top: 0.1, tess: 10, pickable: false });
  flare.metadata = { dynamic: true };
  animated.push({ update: (_dt, time) => (flare.scaling.y = 0.85 + 0.2 * Math.sin(time * 9) + 0.1 * Math.sin(time * 23)) });

  for (const [x, z] of [[-6, -6], [6, -6], [-8, 9.5], [8, 9.5], [-6, -19], [10, -16]] as const) kit.lightPole(x, z);
  // Drums and pallet near the workshop (clutter for scale).
  for (const [x, z] of [[9.2, -0.4], [9.9, -0.2], [9.5, 0.4]] as const) kit.cyl(0.58, 0.88, V(x, 0.44, z), "#2a5d9c", { collider: true, outline: true });
  kit.box(1.2, 0.14, 1.0, V(-8, 0.07, 2), "#8a6a44", { collider: true });
  kit.box(1.0, 0.8, 0.8, V(-8, 0.55, 2), "#c49a5c", { outline: true });

  return {
    id: "petrochem",
    bounds: { minX: -19.5, maxX: 19.5, minZ: -23.5, maxZ: 9.8 },
    colliders: kit.colliders,
    circles: kit.circles,
    map: kit.map,
    anchors,
    update: (dt, time, player) => animated.forEach((a) => a.update(dt, time, player)),
    relabel: () => kit.relabel(),
    shadowCasters: kit.shadowCasters,
  };
}
