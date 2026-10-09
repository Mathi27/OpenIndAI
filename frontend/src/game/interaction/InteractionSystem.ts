// Ray-based interaction targeting: what the crosshair points at, whether it is
// in range, and highlighting of the current target.
import { Color3, HighlightLayer, Mesh, Ray, Vector3, type AbstractMesh, type FreeCamera, type Scene } from "../babylon";
import type { Anchor, WorldBuild } from "../world/types";

export interface Target {
  id: string;
  kind: Anchor["kind"];
  distance: number;
  inRange: boolean;
  maxDistance: number;
}

export class InteractionSystem {
  private highlight: HighlightLayer | null = null;
  private highlighted: string | null = null;
  current: Target | null = null;
  enabled = true;
  private ray = new Ray(Vector3.Zero(), Vector3.Forward(), 8);
  private frame = 0;

  constructor(
    private scene: Scene,
    private camera: FreeCamera,
    private world: WorldBuild,
    private maxDistanceOf: (id: string, kind: Anchor["kind"]) => number | null,
    useHighlight: boolean,
  ) {
    if (useHighlight) {
      this.highlight = new HighlightLayer("interactHL", scene, { isStroke: true, blurHorizontalSize: 0.6, blurVerticalSize: 0.6, mainTextureRatio: 0.5 });
      this.highlight.innerGlow = false;
    }
  }

  private predicate = (m: AbstractMesh): boolean => m.isPickable && m.isEnabled() && m.isVisible && m.renderingGroupId === 0;

  update(): Target | null {
    if (!this.enabled) {
      this.setHighlight(null, false);
      this.current = null;
      return null;
    }
    // Picking every other frame is plenty for a crosshair and halves the cost.
    if (this.frame++ % 2 === 1) return this.current;
    this.camera.getForwardRayToRef(this.ray, 8);
    const hit = this.scene.pickWithRay(this.ray, this.predicate, false);
    let target: Target | null = null;
    if (hit?.hit && hit.pickedMesh) {
      const id = findAnchorId(hit.pickedMesh);
      const anchor = id ? this.world.anchors.get(id) : undefined;
      if (anchor) {
        const max = this.maxDistanceOf(anchor.id, anchor.kind);
        if (max !== null) target = { id: anchor.id, kind: anchor.kind, distance: hit.distance, maxDistance: max, inRange: hit.distance <= max };
      }
    }
    this.current = target;
    this.setHighlight(target?.id ?? null, target?.inRange ?? false);
    return target;
  }

  private setHighlight(id: string | null, inRange: boolean): void {
    const key = id && inRange ? id : null;
    if (key === this.highlighted) return;
    if (this.highlight) {
      this.highlight.removeAllMeshes();
      if (key) {
        const color = this.world.anchors.get(key)?.kind === "npc" ? Color3.FromHexString("#3fa9f5") : Color3.FromHexString("#ffb347");
        for (const m of this.world.anchors.get(key)?.meshes ?? []) if (m instanceof Mesh) this.highlight.addMesh(m, color);
      }
    } else {
      // Low-quality fallback: brighten outlines instead of a highlight pass.
      for (const m of this.world.anchors.get(this.highlighted ?? "")?.meshes ?? []) m.outlineColor = Color3.FromHexString("#0b1220");
      for (const m of this.world.anchors.get(key ?? "")?.meshes ?? []) {
        m.renderOutline = true;
        m.outlineColor = Color3.FromHexString("#ffb347");
      }
    }
    this.highlighted = key;
  }

  dispose(): void {
    this.highlight?.dispose();
  }
}

function findAnchorId(mesh: AbstractMesh): string | null {
  let node: AbstractMesh | null = mesh;
  while (node) {
    const id = (node.metadata as { anchorId?: string } | null)?.anchorId;
    if (id) return id;
    node = node.parent as AbstractMesh | null;
  }
  return null;
}
