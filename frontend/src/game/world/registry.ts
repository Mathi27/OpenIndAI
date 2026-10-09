// World registry: scenario data selects a world by id; worlds are reusable
// across missions of the same industry.
import { buildComplex } from "./complex";
import { buildPetrochem } from "./petrochem";
import type { WorldBuild, WorldBuilder, WorldContext } from "./types";

const WORLDS: Record<string, WorldBuilder> = {
  petrochem: buildPetrochem,
  complex: buildComplex,
};

export class UnknownWorldError extends Error {}

export function hasWorld(id: string): boolean {
  return id in WORLDS;
}

export function buildWorld(id: string, ctx: WorldContext): WorldBuild {
  const builder = WORLDS[id];
  if (!builder) throw new UnknownWorldError(`World "${id}" is not available`);
  return builder(ctx);
}
