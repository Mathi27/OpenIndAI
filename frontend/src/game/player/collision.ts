// Pure 2D (XZ) collision for the first-person player: a circle sliding
// against axis-aligned rectangles and circles, clamped to world bounds.
import type { Circle, Rect } from "../world/types";

export interface Vec2 {
  x: number;
  z: number;
}

/** Push a circle at p (radius r) out of every overlapping obstacle. */
export function resolve(p: Vec2, r: number, rects: readonly Rect[], circles: readonly Circle[], bounds: Rect): Vec2 {
  let { x, z } = p;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (const b of rects) {
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        z = cz + (dz / d) * r;
      } else {
        // Centre inside the rectangle: exit through the nearest edge.
        const exits = [
          { d: x - b.minX, x: b.minX - r, z },
          { d: b.maxX - x, x: b.maxX + r, z },
          { d: z - b.minZ, x, z: b.minZ - r },
          { d: b.maxZ - z, x, z: b.maxZ + r },
        ].sort((a, c) => a.d - c.d);
        x = exits[0].x;
        z = exits[0].z;
      }
      moved = true;
    }
    for (const c of circles) {
      const dx = x - c.x;
      const dz = z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + r;
      if (d >= min) continue;
      if (d < 1e-6) {
        x = c.x + min;
      } else {
        x = c.x + (dx / d) * min;
        z = c.z + (dz / d) * min;
      }
      moved = true;
    }
    if (!moved) break;
  }
  x = Math.max(bounds.minX + r, Math.min(bounds.maxX - r, x));
  z = Math.max(bounds.minZ + r, Math.min(bounds.maxZ - r, z));
  return { x, z };
}

/**
 * Frame-rate-independent velocity update with acceleration and damping.
 * `wish` is the desired unit direction in world XZ (or zero).
 */
export function stepVelocity(v: Vec2, wish: Vec2, dt: number, maxSpeed: number, accel = 14, damping = 10): Vec2 {
  const target = { x: wish.x * maxSpeed, z: wish.z * maxSpeed };
  const k = 1 - Math.exp(-(wish.x || wish.z ? accel : damping) * dt);
  return { x: v.x + (target.x - v.x) * k, z: v.z + (target.z - v.z) * k };
}

export function insideRect(p: Vec2, r: Rect): boolean {
  return p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;
}
