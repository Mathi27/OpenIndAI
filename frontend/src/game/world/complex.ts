// World 2 — "OpenIndustri Industrial Training Complex" (fictional), the shared
// data-driven world for the 45-mission campaign. A site preset supplies the
// backdrop (fence, gate, racks, buildings, tanks, skyline, lighting hints) and
// each mission places its own props, NPCs and zones from its definition, so
// every level gets a different layout, equipment set and interactive states.
import { Color3, CreateGround, Mesh, StandardMaterial, TransformNode, Vector3 } from "../babylon";
import { Kit, PALETTE } from "./kit";
import { groundTexture, paint, tagAnchor, zoneBorder } from "./petrochem";
import { buildProp, type PropInstance } from "./props";
import type { Anchor, WorldBuild, WorldContext } from "./types";

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** Recurring characters: one consistent look per role across all missions. */
export const ROSTER_LOOK: Record<string, { suit: string; helmet: string; vest?: string }> = {
  supervisor: { suit: "#2b5fa8", helmet: "#f2f2ee", vest: PALETTE.orange },
  safety_officer: { suit: "#2f8f5b", helmet: "#2fbf71", vest: PALETTE.yellow },
  senior_tech: { suit: "#d9822b", helmet: PALETTE.yellow, vest: "#ffc23d" },
  operator: { suit: "#4a5568", helmet: "#f2f2ee", vest: "#3fa9f5" },
  coordinator: { suit: "#8b1e2d", helmet: PALETTE.red, vest: "#ff5a5f" },
  contractor: { suit: "#6b4f2a", helmet: PALETTE.blue, vest: PALETTE.orange },
};

export const FENCE = { minX: -24, maxX: 24, minZ: -26, maxZ: 22 };

type Site = "process" | "tank_farm" | "workshop" | "yard" | "utility";

function backdrop(kit: Kit, site: Site, t: WorldContext["t"]): void {
  const fenceMat = kit.mat("#9aa3ad", { alpha: 0.55 });
  const fence = (a: [number, number], b: [number, number]) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const rot = Math.atan2(b[0] - a[0], b[1] - a[1]);
    kit.box(0.04, 2.2, len, V((a[0] + b[0]) / 2, 1.1, (a[1] + b[1]) / 2), fenceMat, { rotY: rot, pickable: false });
    kit.map.push({ kind: "line", pts: [a, b], stroke: "#8a96a8", width: 2, dash: [4, 3] });
  };
  const { minX, maxX, minZ, maxZ } = FENCE;
  fence([minX, minZ], [-4, minZ]);
  fence([4, minZ], [maxX, minZ]);
  fence([minX, minZ], [minX, maxZ]);
  fence([maxX, minZ], [maxX, maxZ]);
  fence([minX, maxZ], [maxX, maxZ]);
  // Gate with complex name.
  kit.box(0.4, 4.6, 0.4, V(-4, 2.3, minZ), PALETTE.orange, { collider: true, outline: true });
  kit.box(0.4, 4.6, 0.4, V(4, 2.3, minZ), PALETTE.orange, { collider: true, outline: true });
  kit.box(8.6, 0.9, 0.4, V(0, 4.8, minZ), PALETTE.navy, { outline: true });
  kit.plate(() => t("world.label.complexGate"), 8.2, 0.75, V(0, 4.8, minZ - 0.22), Math.PI, { bg: PALETTE.navy, fg: "#fff" });
  kit.sign("mandatory", () => t("world.sign.ppe"), V(-5.2, 1.6, minZ - 0.05), Math.PI);
  kit.sign("warning", () => t("world.sign.trainingArea"), V(5.2, 1.6, minZ - 0.05), Math.PI);
  // Main walkway.
  paint(kit, 0, -16, 2.4, 20, "#5a616c", 1, 0.01);
  paint(kit, -1.25, -16, 0.12, 20, PALETTE.yellow);
  paint(kit, 1.25, -16, 0.12, 20, PALETTE.yellow);
  kit.map.push({ kind: "line", pts: [[0, -26], [0, -6]], stroke: "#7f8896", width: 6 });
  // Pipe rack along the north fence.
  for (let x = -22; x <= 22; x += 4) {
    kit.box(0.25, 4.8, 0.25, V(x, 2.4, 18.4), PALETTE.steelDark, { collider: true });
    kit.box(0.25, 4.8, 0.25, V(x, 2.4, 19.6), PALETTE.steelDark, { collider: true });
    kit.box(0.2, 0.2, 1.4, V(x, 4.6, 19), PALETTE.steelDark);
  }
  [[PALETTE.steel, 0.35, 18.7], [PALETTE.yellow, 0.25, 19.1], [PALETTE.petrol, 0.4, 19.4]].forEach(([c, d, z]) => kit.pipe(V(-23, 4.9, z as number), V(23, 4.9, z as number), d as number, c as string));
  kit.map.push({ kind: "rect", rect: { minX: -23, maxX: 23, minZ: 18.2, maxZ: 19.8 }, fill: "#5d6876" });
  for (const [x, z] of [[-14, -20], [14, -20], [-16, 4], [16, 4], [-8, 15], [8, 15]] as const) kit.lightPole(x, z);
  // Skyline beyond the fence (decorative).
  kit.cyl(2.2, 22, V(-32, 11, 10), "#c7ccd3", { outline: true, tess: 20 });
  for (let y = 4; y < 22; y += 4) kit.cyl(2.6, 0.25, V(-32, y, 10), PALETTE.steelDark, { tess: 20 });
  kit.cyl(0.8, 30, V(32, 15, 30), "#b9bec7", { tess: 12 });
  kit.tank(-12, 30, 4, 8);
  kit.tank(4, 31, 5, 9.5);

  // Site-specific backdrop modules (kept outside the central mission area |x| < 15, z < 15).
  if (site === "process") {
    kit.building({ minX: -23, maxX: -17, minZ: -12, maxZ: -4 }, 4, "#c9d3df", { door: { side: "e" }, sign: () => t("world.label.controlRoom"), signColors: { bg: PALETTE.red, fg: "#fff" }, windows: true });
    kit.cyl(1.8, 14, V(-20, 7, 10), "#c7ccd3", { collider: true, outline: true, tess: 20, shadow: true });
    kit.cyl(1.2, 9, V(20, 4.5, 10), "#d8dde4", { collider: true, outline: true, tess: 18 });
    kit.cyl(1.0, 4, V(19.5, 1.0, -2), "#c7ccd3", { rotX: Math.PI / 2, outline: true });
    kit.addCollider(19.5, -2, 1.0, 4);
  } else if (site === "tank_farm") {
    kit.tank(-19, 9, 3, 7, "#e7e3d4");
    kit.tank(-19, -3, 3, 6);
    kit.tank(19, 9, 3, 7);
    kit.box(0.4, 0.8, 26, V(-15.5, 0.4, 3), PALETTE.concrete, { collider: true });
    kit.box(0.4, 0.8, 14, V(15.5, 0.4, 9), PALETTE.concrete, { collider: true });
    kit.building({ minX: 17, maxX: 23, minZ: -14, maxZ: -6 }, 3.6, "#e9ecef", { door: { side: "w" }, sign: () => t("world.label.controlRoom"), signColors: { bg: PALETTE.red, fg: "#fff" }, windows: true });
  } else if (site === "workshop") {
    kit.building({ minX: 16, maxX: 23, minZ: -12, maxZ: 0 }, 5, "#b8c0ca", { door: { side: "w" }, sign: () => t("world.label.workshop"), windows: true });
    kit.building({ minX: 16, maxX: 23, minZ: 4, maxZ: 13 }, 5, "#d8dde4", { door: { side: "w" }, sign: () => t("world.label.warehouse"), windows: false });
    kit.building({ minX: -23, maxX: -17, minZ: -12, maxZ: -5 }, 3.3, "#e9ecef", { door: { side: "e" }, sign: () => t("world.label.safetyOffice"), signColors: { bg: PALETTE.green, fg: "#fff" }, windows: true });
  } else if (site === "yard") {
    kit.building({ minX: -23, maxX: -16, minZ: -14, maxZ: -4 }, 3.6, "#e9ecef", { door: { side: "e" }, sign: () => t("world.label.adminBlock"), signColors: { bg: PALETTE.navy, fg: "#fff" }, windows: true });
    kit.building({ minX: 16, maxX: 23, minZ: -14, maxZ: -2 }, 5, "#d8dde4", { door: { side: "w" }, sign: () => t("world.label.warehouse"), windows: false });
    kit.cyl(1.6, 10, V(19.5, 5, 9), "#c7ccd3", { collider: true, outline: true, tess: 18 });
  } else {
    kit.building({ minX: -23, maxX: -17, minZ: -12, maxZ: -4 }, 3.6, "#c9d3df", { door: { side: "e" }, sign: () => t("world.label.substation"), signColors: { bg: PALETTE.yellow, fg: "#111" }, windows: false });
    kit.cyl(6, 8, V(19, 4, 8), "#b9c4cf", { collider: true, outline: true, tess: 24, top: 4.6 });
    kit.box(4, 2.2, 3, V(19.5, 1.1, -6), "#3d7a5c", { collider: true, outline: true });
  }
}

export function buildComplex(ctx: WorldContext): WorldBuild {
  const { scene, t, mission } = ctx;
  const kit = new Kit(scene);
  const anchors = new Map<string, Anchor>();
  const props = new Map<string, PropInstance>();
  const npcRoots = new Map<string, { root: TransformNode; rect: { minX: number; maxX: number; minZ: number; maxZ: number }; orig: { minX: number; maxX: number; minZ: number; maxZ: number } }>();
  const animated: ((dt: number, time: number, player: Vector3) => void)[] = [];
  const site = (mission.scene.site ?? "process") as Site;

  const ground = CreateGround("ground", { width: 170, height: 170 }, scene);
  ground.material = groundTexture(kit, site === "tank_farm" ? "#4a4b47" : PALETTE.asphalt, "rgba(255,255,255,0.05)", 170);
  ground.receiveShadows = true;
  ground.isPickable = true;
  backdrop(kit, site, t);

  // Mission zones: restricted areas get a red hatch, work areas a yellow border.
  for (const z of mission.zones) {
    const restricted = mission.scene.restrictedZones.includes(z.id);
    const cx = (z.minX + z.maxX) / 2;
    const cz = (z.minZ + z.maxZ) / 2;
    if (restricted) {
      paint(kit, cx, cz, z.maxX - z.minX, z.maxZ - z.minZ, "#5b2a2a", 0.5, 0.009);
      zoneBorder(kit, z.minX, z.maxX, z.minZ, z.maxZ, PALETTE.red);
      kit.map.push({ kind: "rect", rect: z, fill: "rgba(232,66,63,0.18)", stroke: PALETTE.red });
    } else {
      zoneBorder(kit, z.minX, z.maxX, z.minZ, z.maxZ, PALETTE.yellow);
      kit.map.push({ kind: "rect", rect: z, fill: "rgba(255,194,61,0.10)", stroke: PALETTE.yellow });
    }
  }

  // Mission props. A prop with an id becomes an interaction anchor.
  for (const p of mission.scene.props ?? []) {
    let inst: PropInstance;
    try {
      inst = buildProp(kit, t, p, kit.map);
    } catch (e) {
      // A broken prop must fail visibly but never crash the whole mission.
      console.error(`Prop ${p.id ?? p.type} failed to build`, e);
      continue;
    }
    const key = p.id ?? ((p.params ?? {}) as { key?: string }).key;
    if (key) props.set(key, inst);
    if (p.id) tagAnchor(anchors, p.id, "interactable", inst.focus, inst.meshes);
    if (inst.update) animated.push(inst.update);
  }

  // NPCs from the recurring roster.
  for (const npcDef of mission.npcs) {
    const look = ROSTER_LOOK[npcDef.portrait] ?? ROSTER_LOOK.supervisor;
    const heading = (npcDef.heading * Math.PI) / 180;
    const npc = kit.character(look, V(npcDef.x, 0, npcDef.z), heading);
    tagAnchor(anchors, npcDef.id, "npc", V(npcDef.x, 1.6, npcDef.z), npc.meshes);
    kit.addCollider(npcDef.x, npcDef.z, 0.7, 0.7);
    const rect = kit.colliders[kit.colliders.length - 1];
    npcRoots.set(npcDef.id, { root: npc.root, rect, orig: { ...rect } });
    const plate = kit.plate(() => t(npcDef.nameKey), 1.6, 0.26, V(0, 2.35, 0), 0, { bg: PALETTE.navy, fg: "#fff" }, { pickable: false });
    plate.parent = npc.root;
    plate.billboardMode = Mesh.BILLBOARDMODE_Y;
    animated.push((dt, time, player) => {
      npc.root.position.y = Math.sin(time * 2 + npcDef.x) * 0.01;
      npc.armR.rotation.x = Math.sin(time * 1.3 + npcDef.z) * 0.08;
      const dx = player.x - npc.root.position.x;
      const dz = player.z - npc.root.position.z;
      const target = Math.hypot(dx, dz) < 6 ? Math.atan2(dx, dz) : heading;
      let diff = target - npc.root.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      npc.root.rotation.y += diff * Math.min(1, dt * 3);
    });
  }

  // Night/dusk: emissive lamp heads read as lit.
  if (mission.scene.time === "night" || mission.scene.time === "dusk") {
    const lamp = new StandardMaterial("nightLamp", scene);
    lamp.emissiveColor = new Color3(1, 0.95, 0.75);
    lamp.disableLighting = true;
    for (const m of scene.meshes) if (m.material && (m.material as StandardMaterial).emissiveColor?.equals(Color3.FromHexString("#fff4c2"))) m.material = lamp;
  }

  return {
    id: "complex",
    bounds: { minX: FENCE.minX + 0.5, maxX: FENCE.maxX - 0.5, minZ: FENCE.minZ + 0.6, maxZ: 17.8 },
    colliders: kit.colliders,
    circles: kit.circles,
    map: kit.map,
    anchors,
    update: (dt, time, player) => animated.forEach((fn) => fn(dt, time, player)),
    relabel: () => kit.relabel(),
    shadowCasters: kit.shadowCasters,
    setPropState: (id, state) => {
      const p = props.get(id);
      if (!p) return false;
      p.setState(state);
      return true;
    },
    setAnchorVisible: (id, on) => {
      const p = props.get(id);
      p?.setHidden(!on);
      const n = npcRoots.get(id);
      if (n) {
        n.root.setEnabled(on);
        Object.assign(n.rect, on ? n.orig : { minX: 1e9, maxX: 1e9, minZ: 1e9, maxZ: 1e9 });
      }
    },
    standPoint: (id) => props.get(id)?.stand ?? null,
  };
}
