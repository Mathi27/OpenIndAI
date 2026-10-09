import type { AbstractMesh, Scene, Vector3 } from "../babylon";
import type { MissionDef } from "../../mission/types";
import type { Quality } from "../../app/settings";

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Circle {
  x: number;
  z: number;
  r: number;
}

/** 2D minimap primitives in world coordinates (x east, z north). */
export type MapShape =
  | { kind: "rect"; rect: Rect; fill: string; stroke?: string; label?: string }
  | { kind: "circle"; x: number; z: number; r: number; fill: string; stroke?: string }
  | { kind: "line"; pts: [number, number][]; stroke: string; width: number; dash?: number[] };

export interface Anchor {
  id: string;
  kind: "interactable" | "npc";
  /** Point the player looks at / marker location. */
  focus: Vector3;
  meshes: AbstractMesh[];
}

export interface WorldBuild {
  id: string;
  bounds: Rect;
  colliders: Rect[];
  circles: Circle[];
  map: MapShape[];
  anchors: Map<string, Anchor>;
  shadowCasters: AbstractMesh[];
  /** Called every frame for ambient animation (beacons, flare, NPC idle). */
  update(dt: number, time: number, player: Vector3): void;
  /** Re-render translated in-world labels after a language change. */
  relabel(): void;
}

export interface WorldContext {
  scene: Scene;
  mission: MissionDef;
  quality: Quality;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export type WorldBuilder = (ctx: WorldContext) => WorldBuild;
