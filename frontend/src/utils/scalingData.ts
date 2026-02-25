/**
 * Lazy-loading module for exact weapon scaling data from regulation.bin.
 *
 * Fetches data once from /api/scaling and caches it for the session.
 * If data is not available (sync-scaling not run yet), falls back silently.
 */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export interface GraphStage {
  maxVal: number;
  maxGrowVal: number;
  adjPt: number;
}

export interface WeaponScalingEntry {
  str: number;
  dex: number;
  int: number;
  fai: number;
  arc: number;
  graphPhys: number;
  graphMag: number;
  graphFire: number;
  graphLtn: number;
  graphHoly: number;
  reinforceId: number;
  basePhys: number;
  baseMag: number;
  baseFire: number;
  baseLtn: number;
  baseHoly: number;
}

export interface ReinforceLevelData {
  physAtk: number;
  magAtk: number;
  fireAtk: number;
  ltnAtk: number;
  holyAtk: number;
  strScl: number;
  dexScl: number;
  intScl: number;
  faiScl: number;
  arcScl: number;
}

export interface ScalingBundle {
  graphs: Record<number, GraphStage[]>;
  weapons: Record<number, WeaponScalingEntry>;
  reinforce: Record<number, ReinforceLevelData[]>;
}

let cachedBundle: ScalingBundle | null = null;
let fetchPromise: Promise<ScalingBundle | null> | null = null;

/**
 * Fetches the scaling bundle once and caches it.
 * Returns null if data is not available.
 */
export async function loadScalingData(): Promise<ScalingBundle | null> {
  if (cachedBundle) return cachedBundle;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const res = await fetch(`${API_URL}/api/scaling`);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.available) return null;
      cachedBundle = {
        graphs: data.graphs,
        weapons: data.weapons,
        reinforce: data.reinforce,
      };
      return cachedBundle;
    } catch {
      return null;
    }
  })();

  return fetchPromise;
}

/**
 * Returns the cached scaling bundle (synchronous).
 * Returns null if not yet loaded — call loadScalingData() first.
 */
export function getScalingData(): ScalingBundle | null {
  return cachedBundle;
}
