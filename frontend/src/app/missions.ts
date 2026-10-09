import { get } from "../api/client";
import type { MissionDef } from "../mission/types";

const cache = new Map<string, MissionDef>();

export async function getMission(id: string): Promise<MissionDef> {
  const hit = cache.get(id);
  if (hit) return hit;
  const m = await get<MissionDef>(`/missions/${encodeURIComponent(id)}`);
  cache.set(id, m);
  return m;
}

export function clearMissionCache(): void {
  cache.clear();
}
