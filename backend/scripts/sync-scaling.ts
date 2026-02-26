/**
 * sync-scaling.ts — Downloads exact weapon scaling data from regulation.bin.
 *
 * Source: ThomasJClark/elden-ring-weapon-calculator (GitHub)
 * The repo exports a single JSON bundle with all regulation.bin param tables.
 *
 * Outputs:
 * - src/data/calcCorrectGraphs.json: CalcCorrectGraph curves (all IDs)
 * - src/data/weaponScaling.json: Per-weapon exact scaling indexed by game weapon ID
 * - src/data/reinforceParams.json: Upgrade tables indexed by reinforceTypeId
 *
 * Usage: npm run sync-scaling
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const DATA_DIR = path.join(__dirname, '..', 'src', 'data');

const REGULATION_URL =
  'https://raw.githubusercontent.com/ThomasJClark/elden-ring-weapon-calculator/master/public/regulation-vanilla-v1.14.js';

function fetchJSON(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'elden-ring-build-advisor' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchJSON(res.headers.location!).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (e) {
          reject(new Error(`Invalid JSON from ${url}: ${e}`));
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ── Types for the new regulation bundle ───────────────────────

interface GraphStage {
  maxVal: number;
  maxGrowVal: number;
  adjPt: number;
}

interface RegulationWeapon {
  name: string;
  weaponName: string;
  affinityId: number;
  weaponType: number;
  requirements: Record<string, number>;
  attack: [number, number][];          // [damageType, baseDamage]
  attributeScaling: [string, number][]; // [stat, coefficient]
  reinforceTypeId: number;
  attackElementCorrectId: number;
  calcCorrectGraphIds: Record<string, number>; // damageType → graphId
  statusSpEffectParamIds?: number[];
}

interface ReinforceLevel {
  attack: Record<string, number>;           // "0" → mult, "1" → mult, ...
  attributeScaling: Record<string, number>; // "str" → mult, "dex" → mult, ...
}

interface RegulationBundle {
  calcCorrectGraphs: Record<string, GraphStage[]>;
  reinforceTypes: Record<string, ReinforceLevel[]>;
  weapons: RegulationWeapon[];
  attackElementCorrects: unknown;
  statusSpEffectParams: unknown;
  scalingTiers: unknown;
}

// ── Output types (matching frontend expectations) ─────────────

interface WeaponScalingEntry {
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

interface ReinforceLevelData {
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

// ── Name → game ID mapping ───────────────────────────────────

/** Default CalcCorrectGraph IDs per damage type */
const DEFAULT_GRAPH: Record<number, number> = {
  0: 0,  // Physical → graph 0
  1: 4,  // Magic → graph 4
  2: 4,  // Fire → graph 4
  3: 4,  // Lightning → graph 4
  4: 4,  // Holy → graph 4
};

function buildNameToGameId(): Map<string, number> {
  const gameIdsPath = path.join(DATA_DIR, 'gameIds.json');
  const gameIds: Record<string, string> = JSON.parse(fs.readFileSync(gameIdsPath, 'utf-8'));

  // Load known weapon names from weapons.json to disambiguate IDs in the
  // 1M-3M range (where weapon and armor param IDs overlap)
  const weaponsPath = path.join(DATA_DIR, 'weapons.json');
  const weapons: Array<{ name: string }> = JSON.parse(fs.readFileSync(weaponsPath, 'utf-8'));
  const knownWeaponNames = new Set(weapons.map(w => w.name));

  // Build reverse mapping: name → gameId (smallest ID wins for Standard variant)
  const nameMap = new Map<string, number>();

  for (const [idStr, name] of Object.entries(gameIds)) {
    const id = Number(idStr);
    if (id <= 0) continue;
    // Only consider base weapon IDs (no infusion offset, no upgrade level)
    if (id % 10000 !== 0) continue;
    // IDs in the 1M-3M range overlap with armor params — only include if the
    // name matches a known weapon from weapons.json
    if (id >= 1_000_000 && id < 3_000_000 && !knownWeaponNames.has(name)) continue;

    // Keep the first (smallest) ID for each name
    const existing = nameMap.get(name);
    if (existing === undefined || id < existing) {
      nameMap.set(name, id);
    }
  }

  return nameMap;
}

// ── Transform regulation bundle data ─────────────────────────

function processWeapons(
  weapons: RegulationWeapon[],
  nameToGameId: Map<string, number>,
): { scaling: Record<number, WeaponScalingEntry>; matched: number; unmatched: number } {
  const result: Record<number, WeaponScalingEntry> = {};
  let matched = 0;
  let unmatched = 0;

  for (const w of weapons) {
    // Skip truly invalid entries (Unarmed has no weaponName match anyway)
    if (!w.weaponName) continue;

    const gameBaseId = nameToGameId.get(w.weaponName);
    if (gameBaseId === undefined) {
      unmatched++;
      continue;
    }

    // Compute the param ID for this specific affinity variant
    // affinityId -1 = unique/somber weapon (no infusion) → use base ID directly
    const affinityOffset = w.affinityId > 0 ? w.affinityId * 100 : 0;
    const paramId = gameBaseId + affinityOffset;

    // Extract base damage per type
    const attackMap: Record<number, number> = {};
    for (const [type, dmg] of w.attack) {
      attackMap[type] = dmg;
    }

    // Extract scaling coefficients per stat
    const scalingMap: Record<string, number> = {};
    for (const [stat, coeff] of w.attributeScaling) {
      scalingMap[stat] = coeff;
    }

    // Resolve CalcCorrectGraph IDs (fall back to defaults)
    const graphIds = w.calcCorrectGraphIds;

    result[paramId] = {
      str: Math.round((scalingMap.str ?? 0) * 100),
      dex: Math.round((scalingMap.dex ?? 0) * 100),
      int: Math.round((scalingMap.int ?? 0) * 100),
      fai: Math.round((scalingMap.fai ?? 0) * 100),
      arc: Math.round((scalingMap.arc ?? 0) * 100),
      graphPhys: graphIds['0'] ?? DEFAULT_GRAPH[0],
      graphMag:  graphIds['1'] ?? DEFAULT_GRAPH[1],
      graphFire: graphIds['2'] ?? DEFAULT_GRAPH[2],
      graphLtn:  graphIds['3'] ?? DEFAULT_GRAPH[3],
      graphHoly: graphIds['4'] ?? DEFAULT_GRAPH[4],
      reinforceId: w.reinforceTypeId,
      basePhys: attackMap[0] ?? 0,
      baseMag:  attackMap[1] ?? 0,
      baseFire: attackMap[2] ?? 0,
      baseLtn:  attackMap[3] ?? 0,
      baseHoly: attackMap[4] ?? 0,
    };

    matched++;
  }

  return { scaling: result, matched, unmatched };
}

function processReinforceTypes(
  reinforceTypes: Record<string, ReinforceLevel[]>,
): Record<number, ReinforceLevelData[]> {
  const result: Record<number, ReinforceLevelData[]> = {};

  for (const [typeIdStr, levels] of Object.entries(reinforceTypes)) {
    const typeId = Number(typeIdStr);
    result[typeId] = levels.map((lvl) => ({
      physAtk: lvl.attack['0'] ?? 1,
      magAtk:  lvl.attack['1'] ?? 1,
      fireAtk: lvl.attack['2'] ?? 1,
      ltnAtk:  lvl.attack['3'] ?? 1,
      holyAtk: lvl.attack['4'] ?? 1,
      strScl: lvl.attributeScaling.str ?? 1,
      dexScl: lvl.attributeScaling.dex ?? 1,
      intScl: lvl.attributeScaling.int ?? 1,
      faiScl: lvl.attributeScaling.fai ?? 1,
      arcScl: lvl.attributeScaling.arc ?? 1,
    }));
  }

  return result;
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log('Downloading regulation bundle...');
  const bundle = await fetchJSON(REGULATION_URL) as RegulationBundle;
  console.log(`  ${bundle.weapons.length} weapon entries`);
  console.log(`  ${Object.keys(bundle.calcCorrectGraphs).length} graph curves`);
  console.log(`  ${Object.keys(bundle.reinforceTypes).length} reinforce types`);

  // Build name → gameId mapping from our data
  const nameToGameId = buildNameToGameId();
  console.log(`\nName → gameId mapping: ${nameToGameId.size} weapons`);

  // Process CalcCorrectGraphs (already in the right format)
  const graphs: Record<number, GraphStage[]> = {};
  for (const [id, stages] of Object.entries(bundle.calcCorrectGraphs)) {
    graphs[Number(id)] = stages;
  }

  // Process weapons
  const { scaling: weaponScaling, matched, unmatched } = processWeapons(bundle.weapons, nameToGameId);
  console.log(`Weapons matched: ${matched}, unmatched: ${unmatched}`);

  // Process reinforce types
  const reinforceParams = processReinforceTypes(bundle.reinforceTypes);

  console.log(`\nProcessed: ${Object.keys(graphs).length} graphs, ${Object.keys(weaponScaling).length} weapons, ${Object.keys(reinforceParams).length} reinforce types`);

  // Write outputs
  const graphPath = path.join(DATA_DIR, 'calcCorrectGraphs.json');
  const weaponPath = path.join(DATA_DIR, 'weaponScaling.json');
  const reinforcePath = path.join(DATA_DIR, 'reinforceParams.json');

  fs.writeFileSync(graphPath, JSON.stringify(graphs, null, 0));
  fs.writeFileSync(weaponPath, JSON.stringify(weaponScaling, null, 0));
  fs.writeFileSync(reinforcePath, JSON.stringify(reinforceParams, null, 0));

  const graphSize = (fs.statSync(graphPath).size / 1024).toFixed(1);
  const weaponSize = (fs.statSync(weaponPath).size / 1024).toFixed(1);
  const reinforceSize = (fs.statSync(reinforcePath).size / 1024).toFixed(1);

  console.log(`\nWritten:`);
  console.log(`  calcCorrectGraphs.json: ${graphSize} KB`);
  console.log(`  weaponScaling.json: ${weaponSize} KB`);
  console.log(`  reinforceParams.json: ${reinforceSize} KB`);
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
