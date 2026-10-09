// Walkability check over the 2D collision map: can the player get from A to B?
// Used by automated tests to prove every mission object is physically reachable.
import type { WorldBuild } from "./types";

const CELL = 0.25;
const RADIUS = 0.3;

function blocked(w: WorldBuild, x: number, z: number): boolean {
  const b = w.bounds;
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return true;
  for (const r of w.colliders) {
    const cx = Math.max(r.minX, Math.min(x, r.maxX));
    const cz = Math.max(r.minZ, Math.min(z, r.maxZ));
    if ((x - cx) ** 2 + (z - cz) ** 2 < RADIUS * RADIUS) return true;
  }
  for (const c of w.circles) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + RADIUS) ** 2) return true;
  return false;
}

export function reachable(w: WorldBuild, from: { x: number; z: number }, to: { x: number; z: number }, tolerance = 0.8): boolean {
  const b = w.bounds;
  const nx = Math.ceil((b.maxX - b.minX) / CELL);
  const nz = Math.ceil((b.maxZ - b.minZ) / CELL);
  const idx = (i: number, j: number) => j * nx + i;
  const cellOf = (p: { x: number; z: number }) => [Math.round((p.x - b.minX) / CELL), Math.round((p.z - b.minZ) / CELL)] as const;
  const seen = new Uint8Array(nx * nz);
  const [si, sj] = cellOf(from);
  const queue: number[] = [];
  const push = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= nx || j >= nz) return;
    const k = idx(i, j);
    if (seen[k]) return;
    seen[k] = 1;
    if (blocked(w, b.minX + i * CELL, b.minZ + j * CELL)) return;
    queue.push(k);
  };
  push(si, sj);
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q];
    const i = k % nx;
    const j = Math.floor(k / nx);
    const x = b.minX + i * CELL;
    const z = b.minZ + j * CELL;
    if (Math.hypot(x - to.x, z - to.z) <= tolerance) return true;
    push(i + 1, j);
    push(i - 1, j);
    push(i, j + 1);
    push(i, j - 1);
  }
  return false;
}
