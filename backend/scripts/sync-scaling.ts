/**
 * sync-scaling.ts — Downloads exact weapon scaling data from regulation.bin JSON exports.
 *
 * Source: ThomasJClark/elden-ring-weapon-calculator (GitHub)
 * This project exports regulation.bin param tables as JSON files.
 *
 * We download:
 * - CalcCorrectGraph.json: All 20+ scaling curve variants (breakpoints + adjPt)
 * - EquipParamWeapon.json: Per-weapon exact scaling coefficients + graph IDs
 * - ReinforceParamWeapon.json: Upgrade curve tables (damage + scaling multipliers per level)
 *
 * Outputs:
 * - src/data/calcCorrectGraphs.json: Simplified CalcCorrectGraph data (all IDs)
 * - src/data/weaponScaling.json: Per-weapon exact scaling indexed by weapon ID
 * - src/data/reinforceParams.json: Upgrade tables indexed by reinforceTypeId
 *
 * Usage: npm run sync-scaling
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const DATA_DIR = path.join(__dirname, '..', 'src', 'data');

const BASE_URL = 'https://raw.githubusercontent.com/ThomasJClark/elden-ring-weapon-calculator/main/public/regulation.bin';

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

// ── CalcCorrectGraph ──────────────────────────────────────────

interface RawCalcCorrectGraphRow {
  ID: number;
  stageMaxVal0: number; stageMaxVal1: number; stageMaxVal2: number; stageMaxVal3: number; stageMaxVal4: number;
  stageMaxGrowVal0: number; stageMaxGrowVal1: number; stageMaxGrowVal2: number; stageMaxGrowVal3: number; stageMaxGrowVal4: number;
  adjPt_maxGrowVal0: number; adjPt_maxGrowVal1: number; adjPt_maxGrowVal2: number; adjPt_maxGrowVal3: number; adjPt_maxGrowVal4: number;
}

interface GraphStage {
  maxVal: number;
  maxGrowVal: number;
  adjPt: number;
}

function processCalcCorrectGraphs(raw: RawCalcCorrectGraphRow[]): Record<number, GraphStage[]> {
  const result: Record<number, GraphStage[]> = {};
  for (const row of raw) {
    result[row.ID] = [
      { maxVal: row.stageMaxVal0, maxGrowVal: row.stageMaxGrowVal0, adjPt: row.adjPt_maxGrowVal0 },
      { maxVal: row.stageMaxVal1, maxGrowVal: row.stageMaxGrowVal1, adjPt: row.adjPt_maxGrowVal1 },
      { maxVal: row.stageMaxVal2, maxGrowVal: row.stageMaxGrowVal2, adjPt: row.adjPt_maxGrowVal2 },
      { maxVal: row.stageMaxVal3, maxGrowVal: row.stageMaxGrowVal3, adjPt: row.adjPt_maxGrowVal3 },
      { maxVal: row.stageMaxVal4, maxGrowVal: row.stageMaxGrowVal4, adjPt: row.adjPt_maxGrowVal4 },
    ];
  }
  return result;
}

// ── EquipParamWeapon ──────────────────────────────────────────

interface RawEquipParamWeapon {
  ID: number;
  correctStrength: number;
  correctAgility: number;    // DEX
  correctMagic: number;      // INT
  correctFaith: number;
  correctLuck: number;       // ARC

  correctType_Physics: number;
  correctType_Magic: number;
  correctType_Fire: number;
  correctType_Thunder: number;
  correctType_Dark: number;  // Holy

  reinforceTypeId: number;

  attackBasePhysics: number;
  attackBaseMagic: number;
  attackBaseFire: number;
  attackBaseThunder: number;
  attackBaseDark: number;

  // Required stats
  properStrength: number;
  properAgility: number;
  properMagic: number;
  properFaith: number;
  properLuck: number;
}

interface WeaponScalingEntry {
  /** Exact scaling coefficients (÷100 to get multiplier) */
  str: number;
  dex: number;
  int: number;
  fai: number;
  arc: number;
  /** CalcCorrectGraph IDs for each damage type */
  graphPhys: number;
  graphMag: number;
  graphFire: number;
  graphLtn: number;
  graphHoly: number;
  /** ReinforceParamWeapon ID */
  reinforceId: number;
  /** Base damage at +0 */
  basePhys: number;
  baseMag: number;
  baseFire: number;
  baseLtn: number;
  baseHoly: number;
}

function processWeaponScaling(raw: RawEquipParamWeapon[]): Record<number, WeaponScalingEntry> {
  const result: Record<number, WeaponScalingEntry> = {};
  for (const w of raw) {
    // Skip invalid entries (ID 0, no base damage, etc.)
    if (w.ID <= 0) continue;
    if (w.attackBasePhysics <= 0 && w.attackBaseMagic <= 0 && w.attackBaseFire <= 0
      && w.attackBaseThunder <= 0 && w.attackBaseDark <= 0) continue;

    result[w.ID] = {
      str: w.correctStrength,
      dex: w.correctAgility,
      int: w.correctMagic,
      fai: w.correctFaith,
      arc: w.correctLuck,
      graphPhys: w.correctType_Physics,
      graphMag: w.correctType_Magic,
      graphFire: w.correctType_Fire,
      graphLtn: w.correctType_Thunder,
      graphHoly: w.correctType_Dark,
      reinforceId: w.reinforceTypeId,
      basePhys: w.attackBasePhysics,
      baseMag: w.attackBaseMagic,
      baseFire: w.attackBaseFire,
      baseLtn: w.attackBaseThunder,
      baseHoly: w.attackBaseDark,
    };
  }
  return result;
}

// ── ReinforceParamWeapon ──────────────────────────────────────

interface RawReinforceRow {
  ID: number;
  physicsAtkRate: number;
  magicAtkRate: number;
  fireAtkRate: number;
  thunderAtkRate: number;
  darkAtkRate: number;
  correctStrengthRate: number;
  correctAgilityRate: number;
  correctMagicRate: number;
  correctFaithRate: number;
  correctLuckRate: number;
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

function processReinforceParams(raw: RawReinforceRow[]): Record<number, ReinforceLevelData[]> {
  // IDs are reinforceTypeId * 100 + level
  // e.g. reinforceTypeId 0 has IDs 0, 1, 2, ..., 25
  // reinforceTypeId 100 has IDs 10000, 10001, ..., 10010
  const grouped = new Map<number, Map<number, ReinforceLevelData>>();

  for (const row of raw) {
    if (row.ID < 0) continue;
    const typeId = Math.floor(row.ID / 100);
    const level = row.ID % 100;

    if (!grouped.has(typeId)) grouped.set(typeId, new Map());
    grouped.get(typeId)!.set(level, {
      physAtk: row.physicsAtkRate,
      magAtk: row.magicAtkRate,
      fireAtk: row.fireAtkRate,
      ltnAtk: row.thunderAtkRate,
      holyAtk: row.darkAtkRate,
      strScl: row.correctStrengthRate,
      dexScl: row.correctAgilityRate,
      intScl: row.correctMagicRate,
      faiScl: row.correctFaithRate,
      arcScl: row.correctLuckRate,
    });
  }

  const result: Record<number, ReinforceLevelData[]> = {};
  for (const [typeId, levels] of grouped) {
    const maxLevel = Math.max(...levels.keys());
    const arr: ReinforceLevelData[] = [];
    for (let i = 0; i <= maxLevel; i++) {
      arr.push(levels.get(i) ?? {
        physAtk: 1, magAtk: 1, fireAtk: 1, ltnAtk: 1, holyAtk: 1,
        strScl: 1, dexScl: 1, intScl: 1, faiScl: 1, arcScl: 1,
      });
    }
    result[typeId] = arr;
  }

  return result;
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log('Downloading CalcCorrectGraph...');
  const rawGraphs = await fetchJSON(`${BASE_URL}/CalcCorrectGraph.json`) as RawCalcCorrectGraphRow[];
  console.log(`  ${rawGraphs.length} graph entries`);

  console.log('Downloading EquipParamWeapon...');
  const rawWeapons = await fetchJSON(`${BASE_URL}/EquipParamWeapon.json`) as RawEquipParamWeapon[];
  console.log(`  ${rawWeapons.length} weapon entries`);

  console.log('Downloading ReinforceParamWeapon...');
  const rawReinforce = await fetchJSON(`${BASE_URL}/ReinforceParamWeapon.json`) as RawReinforceRow[];
  console.log(`  ${rawReinforce.length} reinforce entries`);

  const graphs = processCalcCorrectGraphs(rawGraphs);
  const weaponScaling = processWeaponScaling(rawWeapons);
  const reinforceParams = processReinforceParams(rawReinforce);

  console.log(`Processed: ${Object.keys(graphs).length} graphs, ${Object.keys(weaponScaling).length} weapons, ${Object.keys(reinforceParams).length} reinforce types`);

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
  console.log('\nDone! Run audit to verify: npm run audit');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
