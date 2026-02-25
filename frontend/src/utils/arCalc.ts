/**
 * Estimación de Attack Rating (AR) para Elden Ring.
 *
 * Usa las curvas CalcCorrectGraph reales extraídas de regulation.bin
 * (fuente: ThomasJClark/elden-ring-weapon-calculator, hanslhansl/elden-ring-damage-optimizer).
 *
 * La interpolación entre breakpoints usa factores exponenciales (adjPt) exactos del juego.
 *
 * Si los datos exactos de scaling están disponibles (via sync-scaling), se usan los valores
 * de correctStrength/etc. y CalcCorrectGraph per-weapon. Si no, se usan valores
 * representativos por grado de escalado (S/A/B/C/D/E) como fallback.
 *
 * Precisión: Con datos exactos ±1-2 AR; con fallback ±5-10% del valor real.
 */

import type { EquippedWeapon, CharacterStats } from '../types';
import { getScalingData } from './scalingData';
import type { GraphStage, WeaponScalingEntry, ReinforceLevelData } from './scalingData';

// ── CalcCorrectGraph — datos reales de regulation.bin ────────────

interface CalcCorrectStage {
  maxVal: number;
  maxGrowVal: number;
  adjPt: number;
}

/** ID 0: Default — Physical scaling (Standard affinity, STR/DEX) */
const PHYS_GRAPH: CalcCorrectStage[] = [
  { maxVal:   1, maxGrowVal: 0.00, adjPt:  1.2 },
  { maxVal:  18, maxGrowVal: 0.25, adjPt: -1.2 },
  { maxVal:  60, maxGrowVal: 0.75, adjPt:  1.0 },
  { maxVal:  80, maxGrowVal: 0.90, adjPt:  1.0 },
  { maxVal: 150, maxGrowVal: 1.10, adjPt:  1.0 },
];

/** ID 4: Magic / Fire / Lightning / Holy (elemental scaling, INT/FAI) */
const MAGIC_GRAPH: CalcCorrectStage[] = [
  { maxVal:  1, maxGrowVal: 0.00, adjPt: 1.0 },
  { maxVal: 20, maxGrowVal: 0.40, adjPt: 1.0 },
  { maxVal: 50, maxGrowVal: 0.80, adjPt: 1.0 },
  { maxVal: 80, maxGrowVal: 0.95, adjPt: 1.0 },
  { maxVal: 99, maxGrowVal: 1.00, adjPt: 1.0 },
];

/** ID 7: Occult (Arcane scaling for physical/elemental damage) */
const ARC_GRAPH: CalcCorrectStage[] = [
  { maxVal:   1, maxGrowVal: 0.00, adjPt:  1.2 },
  { maxVal:  20, maxGrowVal: 0.35, adjPt: -1.2 },
  { maxVal:  60, maxGrowVal: 0.75, adjPt:  1.0 },
  { maxVal:  80, maxGrowVal: 0.90, adjPt:  1.0 },
  { maxVal: 150, maxGrowVal: 1.10, adjPt:  1.0 },
];

/** Fallback graph lookup by graph ID */
const FALLBACK_GRAPHS: Record<number, CalcCorrectStage[]> = {
  0: PHYS_GRAPH,
  1: PHYS_GRAPH,  // Heavy physical (similar to default)
  2: PHYS_GRAPH,  // Keen physical
  3: PHYS_GRAPH,  // Quality physical
  4: MAGIC_GRAPH,
  7: ARC_GRAPH,
  8: ARC_GRAPH,   // Occult variant
  12: ARC_GRAPH,  // Blood/Poison ARC
  14: PHYS_GRAPH, // STR-specific
  16: PHYS_GRAPH, // DEX-specific
};

/**
 * Interpola un valor de stat sobre un CalcCorrectGraph usando la fórmula exacta del juego.
 */
function interpGraph(graph: CalcCorrectStage[] | GraphStage[], stat: number): number {
  const s = Math.max(graph[0].maxVal, Math.min(graph[graph.length - 1].maxVal, stat));
  for (let i = 1; i < graph.length; i++) {
    const prev = graph[i - 1];
    const curr = graph[i];
    if (s <= curr.maxVal) {
      const range = curr.maxVal - prev.maxVal;
      if (range <= 0) return curr.maxGrowVal;
      let ratio = (s - prev.maxVal) / range;
      ratio = Math.max(0, Math.min(1, ratio));

      const adj = prev.adjPt;
      if (adj > 0 && adj !== 1.0) {
        ratio = Math.pow(ratio, adj);
      } else if (adj < 0) {
        ratio = 1 - Math.pow(1 - ratio, -adj);
      }

      return prev.maxGrowVal + (curr.maxGrowVal - prev.maxGrowVal) * ratio;
    }
  }
  return graph[graph.length - 1].maxGrowVal;
}

// ── Coeficientes de grado (fallback) ──────────────────────────
const GRADE_COEFF: Record<string, number> = {
  'S': 1.85,
  'A': 1.55,
  'B': 1.15,
  'C': 0.75,
  'D': 0.42,
  'E': 0.12,
  '-': 0.00,
};

// ── Upgrade multipliers (fallback) ──────────────────────────────

function upgradeMultiplier(upgradeLevel: number): number {
  if (upgradeLevel <= 0) return 1.0;
  const isUnique = upgradeLevel <= 10;
  const [maxN, factor] = isUnique ? [10, 1.44] : [25, 1.45];
  return 1.0 + (upgradeLevel / maxN) * factor;
}

function scalingUpgradeMultiplier(upgradeLevel: number): number {
  if (upgradeLevel <= 0) return 1.0;
  const isUnique = upgradeLevel <= 10;
  const [maxN, factor] = isUnique ? [10, 0.50] : [25, 0.50];
  return 1.0 + (upgradeLevel / maxN) * factor;
}

// ── Flat Defense (game-accurate piecewise formulas) ──────────────

export interface FlatDefense {
  physical: number;
  magic: number;
  fire: number;
  lightning: number;
  holy: number;
}

function defenseFromLevel(runeLevel: number): number {
  const v = runeLevel + 79;
  if (v <= 149) return 40 + 60 * (v / 149);
  if (v <= 190) return 100 + 20 * ((v - 149) / 41);
  if (v <= 240) return 120 + 15 * ((v - 190) / 50);
  return 135 + 20 * ((v - 240) / 552);
}

function defenseFromStat(stat: number): number {
  if (stat <= 1)  return 0;
  if (stat <= 30) return 10 * ((stat - 1) / 29);
  if (stat <= 40) return 10 + 5 * ((stat - 30) / 10);
  if (stat <= 60) return 15 + 15 * ((stat - 40) / 20);
  return 30 + 10 * ((stat - 60) / 39);
}

export function calcFlatDefense(level: number, stats: CharacterStats): FlatDefense {
  const lvl = defenseFromLevel(level);
  return {
    physical:  Math.floor(lvl + defenseFromStat(stats.strength)),
    magic:     Math.floor(lvl + defenseFromStat(stats.intelligence)),
    fire:      Math.floor(lvl + defenseFromStat(stats.vigor)),
    lightning: Math.floor(lvl),
    holy:      Math.floor(lvl + defenseFromStat(stats.arcane)),
  };
}

// ── Infusion Modifiers ───────────────────────────────────────────

interface InfusionMod {
  physMult: number;
  elemRatio: number;
  elemType: 'magic' | 'fire' | 'lightning' | 'holy' | null;
  strScale: number;
  dexScale: number;
  intScale: number;
  faiScale: number;
  arcScale: number;
}

const INFUSION_MODIFIERS: Record<string, InfusionMod> = {
  Heavy:       { physMult: 1.04, elemRatio: 0,    elemType: null,        strScale: 1.55, dexScale: 0.30, intScale: 0,    faiScale: 0,    arcScale: 0    },
  Keen:        { physMult: 1.00, elemRatio: 0,    elemType: null,        strScale: 0.30, dexScale: 1.50, intScale: 0,    faiScale: 0,    arcScale: 0    },
  Quality:     { physMult: 0.95, elemRatio: 0,    elemType: null,        strScale: 1.05, dexScale: 1.05, intScale: 0,    faiScale: 0,    arcScale: 0    },
  Fire:        { physMult: 0.65, elemRatio: 0.65, elemType: 'fire',      strScale: 0.80, dexScale: 0,    intScale: 0,    faiScale: 0,    arcScale: 0    },
  'Flame Art': { physMult: 0.65, elemRatio: 0.65, elemType: 'fire',      strScale: 0,    dexScale: 0,    intScale: 0,    faiScale: 1.40, arcScale: 0    },
  Lightning:   { physMult: 0.65, elemRatio: 0.65, elemType: 'lightning',  strScale: 0,    dexScale: 0.80, intScale: 0,    faiScale: 0,    arcScale: 0    },
  Sacred:      { physMult: 0.65, elemRatio: 0.65, elemType: 'holy',       strScale: 0,    dexScale: 0,    intScale: 0,    faiScale: 1.40, arcScale: 0    },
  Magic:       { physMult: 0.65, elemRatio: 0.65, elemType: 'magic',      strScale: 0,    dexScale: 0,    intScale: 1.40, faiScale: 0,    arcScale: 0    },
  Cold:        { physMult: 0.80, elemRatio: 0.55, elemType: 'magic',      strScale: 0.55, dexScale: 0.55, intScale: 1.10, faiScale: 0,    arcScale: 0    },
  Poison:      { physMult: 0.85, elemRatio: 0,    elemType: null,        strScale: 0.55, dexScale: 0.55, intScale: 0,    faiScale: 0,    arcScale: 1.30 },
  Blood:       { physMult: 0.85, elemRatio: 0,    elemType: null,        strScale: 0.55, dexScale: 0.55, intScale: 0,    faiScale: 0,    arcScale: 1.30 },
  Occult:      { physMult: 0.90, elemRatio: 0,    elemType: null,        strScale: 0.50, dexScale: 0.50, intScale: 0,    faiScale: 0,    arcScale: 1.60 },
};

// ── Helper: resolve exact graph ──────────────────────────────

function resolveGraph(graphId: number): CalcCorrectStage[] | GraphStage[] {
  const bundle = getScalingData();
  if (bundle?.graphs[graphId]) return bundle.graphs[graphId];
  return FALLBACK_GRAPHS[graphId] ?? PHYS_GRAPH;
}

// ── Helper: try exact calculation ────────────────────────────

function tryExactAR(
  weapon: EquippedWeapon,
  stats: CharacterStats,
): { physical: number; magic: number; fire: number; lightning: number; holy: number; total: number } | null {
  const bundle = getScalingData();
  if (!bundle) return null;

  // Find weapon in exact data by baseId
  const baseId = weapon.baseId;
  if (!baseId) return null;

  // Weapon IDs in regulation.bin may differ from our baseId format
  // Try the baseId directly and also baseId * 100 (common format)
  const exactW: WeaponScalingEntry | undefined =
    bundle.weapons[baseId] ?? bundle.weapons[baseId * 100];
  if (!exactW) return null;

  const lvl = weapon.upgradeLevel ?? 0;

  // Get reinforce table
  const reinforceTable: ReinforceLevelData[] | undefined = bundle.reinforce[exactW.reinforceId];
  if (!reinforceTable) return null;

  const reinforceIdx = Math.min(lvl, reinforceTable.length - 1);
  const rf = reinforceTable[reinforceIdx];

  // Base damage at +upgrade
  const bPhys = Math.round(exactW.basePhys * rf.physAtk);
  const bMag  = Math.round(exactW.baseMag  * rf.magAtk);
  const bFire = Math.round(exactW.baseFire * rf.fireAtk);
  const bLtn  = Math.round(exactW.baseLtn  * rf.ltnAtk);
  const bHoly = Math.round(exactW.baseHoly * rf.holyAtk);

  // Scaling coefficients at +upgrade (÷100 to get multiplier)
  const strCoeff = (exactW.str / 100) * rf.strScl;
  const dexCoeff = (exactW.dex / 100) * rf.dexScl;
  const intCoeff = (exactW.int / 100) * rf.intScl;
  const faiCoeff = (exactW.fai / 100) * rf.faiScl;
  const arcCoeff = (exactW.arc / 100) * rf.arcScl;

  // Resolve correct CalcCorrectGraph per damage type
  const gPhys = resolveGraph(exactW.graphPhys);
  const gMag  = resolveGraph(exactW.graphMag);
  const gFire = resolveGraph(exactW.graphFire);
  const gLtn  = resolveGraph(exactW.graphLtn);
  const gHoly = resolveGraph(exactW.graphHoly);

  // Physical: STR + DEX + ARC all contribute
  const strPhys = bPhys * strCoeff * interpGraph(gPhys, stats.strength);
  const dexPhys = bPhys * dexCoeff * interpGraph(gPhys, stats.dexterity);
  const arcPhys = bPhys * arcCoeff * interpGraph(resolveGraph(7), stats.arcane);

  // Elemental: INT contributes to magic, FAI to fire/lightning/holy, ARC to all elemental
  const intMag  = bMag  * intCoeff * interpGraph(gMag, stats.intelligence);
  const faiMag  = bMag  * faiCoeff * interpGraph(gMag, stats.faith);
  const faiFire = bFire * faiCoeff * interpGraph(gFire, stats.faith);
  const faiLtn  = bLtn  * faiCoeff * interpGraph(gLtn, stats.faith);
  const faiHoly = bHoly * faiCoeff * interpGraph(gHoly, stats.faith);

  const arcMag  = bMag  * arcCoeff * interpGraph(resolveGraph(7), stats.arcane);
  const arcFire = bFire * arcCoeff * interpGraph(resolveGraph(7), stats.arcane);
  const arcLtn  = bLtn  * arcCoeff * interpGraph(resolveGraph(7), stats.arcane);
  const arcHoly = bHoly * arcCoeff * interpGraph(resolveGraph(7), stats.arcane);

  const physical  = Math.round(bPhys + strPhys + dexPhys + arcPhys);
  const magic     = Math.round(bMag  + intMag + faiMag + arcMag);
  const fire      = Math.round(bFire + faiFire + arcFire);
  const lightning = Math.round(bLtn  + faiLtn + arcLtn);
  const holy      = Math.round(bHoly + faiHoly + arcHoly);
  const total     = physical + magic + fire + lightning + holy;

  return { physical, magic, fire, lightning, holy, total };
}

// ── Cálculo de AR estimado (con fallback) ───────────────────────

export function estimateEquippedAR(
  weapon: EquippedWeapon,
  stats: CharacterStats,
): { physical: number; magic: number; fire: number; lightning: number; holy: number; total: number } {
  // Try exact calculation first
  const exact = tryExactAR(weapon, stats);
  if (exact) return exact;

  // Fallback: approximation by scaling grade
  const lvl    = weapon.upgradeLevel ?? 0;
  const mult   = upgradeMultiplier(lvl);
  const sclMul = scalingUpgradeMultiplier(lvl);
  const dmg    = weapon.damage!;
  const scl    = weapon.scaling!;

  const inf = weapon.infusion ? INFUSION_MODIFIERS[weapon.infusion] : undefined;

  const bPhys = Math.round(dmg.physical * mult * (inf?.physMult ?? 1));
  const infElemPhys = inf?.elemRatio ? Math.round(dmg.physical * mult * inf.elemRatio) : 0;
  const bMag  = Math.round(dmg.magic     * mult) + (inf?.elemType === 'magic'     ? infElemPhys : 0);
  const bFire = Math.round(dmg.fire      * mult) + (inf?.elemType === 'fire'      ? infElemPhys : 0);
  const bLig  = Math.round(dmg.lightning * mult) + (inf?.elemType === 'lightning' ? infElemPhys : 0);
  const bHoly = Math.round(dmg.holy      * mult) + (inf?.elemType === 'holy'      ? infElemPhys : 0);

  const strCoeff = (GRADE_COEFF[scl.str] ?? 0) * (inf?.strScale ?? 1);
  const dexCoeff = (GRADE_COEFF[scl.dex] ?? 0) * (inf?.dexScale ?? 1);
  const intCoeff = (GRADE_COEFF[scl.int] ?? 0) * (inf?.intScale ?? 1);
  const faiCoeff = (GRADE_COEFF[scl.fai] ?? 0) * (inf?.faiScale ?? 1);
  const arcCoeff = (GRADE_COEFF[scl.arc] ?? 0) * (inf?.arcScale ?? 1);

  const strBonus = bPhys * strCoeff * sclMul * interpGraph(PHYS_GRAPH,  stats.strength);
  const dexBonus = bPhys * dexCoeff * sclMul * interpGraph(PHYS_GRAPH,  stats.dexterity);
  const intBonus = bMag  * intCoeff * sclMul * interpGraph(MAGIC_GRAPH, stats.intelligence);
  const faiMag   = bMag  * faiCoeff * sclMul * interpGraph(MAGIC_GRAPH, stats.faith);
  const faiFire  = bFire * faiCoeff * sclMul * interpGraph(MAGIC_GRAPH, stats.faith);
  const faiLig   = bLig  * faiCoeff * sclMul * interpGraph(MAGIC_GRAPH, stats.faith);
  const faiHoly  = bHoly * faiCoeff * sclMul * interpGraph(MAGIC_GRAPH, stats.faith);
  const arcPhysBon = bPhys * arcCoeff * sclMul * interpGraph(ARC_GRAPH, stats.arcane);
  const arcMagBon  = bMag  * arcCoeff * sclMul * interpGraph(ARC_GRAPH, stats.arcane);
  const arcFireBon = bFire * arcCoeff * sclMul * interpGraph(ARC_GRAPH, stats.arcane);
  const arcLigBon  = bLig  * arcCoeff * sclMul * interpGraph(ARC_GRAPH, stats.arcane);
  const arcHolyBon = bHoly * arcCoeff * sclMul * interpGraph(ARC_GRAPH, stats.arcane);

  const physical  = Math.round(bPhys + strBonus + dexBonus + arcPhysBon);
  const magic     = Math.round(bMag  + intBonus + faiMag + arcMagBon);
  const fire      = Math.round(bFire + faiFire + arcFireBon);
  const lightning = Math.round(bLig  + faiLig + arcLigBon);
  const holy      = Math.round(bHoly + faiHoly + arcHolyBon);
  const total     = physical + magic + fire + lightning + holy;

  return { physical, magic, fire, lightning, holy, total };
}

/**
 * Apilamiento multiplicativo de negación de daño (fórmula exacta del juego).
 */
export function stackNegation(values: number[]): number {
  const product = values.reduce((acc, v) => acc * (1 - v / 100), 1.0);
  return Math.round((1 - product) * 1000) / 10;
}

// ── Desglose de escalado ──────────────────────────────────

export interface ARBreakdown {
  base: { physical: number; magic: number; fire: number; lightning: number; holy: number };
  strBonus: number;
  dexBonus: number;
  intBonus: number;
  faiBonus: number;
  arcBonus: number;
}

export function estimateARWithBreakdown(
  weapon: EquippedWeapon,
  stats:  CharacterStats,
): { ar: ReturnType<typeof estimateEquippedAR>; breakdown: ARBreakdown } {
  const lvl    = weapon.upgradeLevel ?? 0;
  const mult   = upgradeMultiplier(lvl);
  const sclMul = scalingUpgradeMultiplier(lvl);
  const dmg    = weapon.damage!;
  const scl    = weapon.scaling!;

  const inf = weapon.infusion ? INFUSION_MODIFIERS[weapon.infusion] : undefined;

  const bPhys = Math.round(dmg.physical * mult * (inf?.physMult ?? 1));
  const infElemPhys = inf?.elemRatio ? Math.round(dmg.physical * mult * inf.elemRatio) : 0;
  const bMag  = Math.round(dmg.magic     * mult) + (inf?.elemType === 'magic'     ? infElemPhys : 0);
  const bFire = Math.round(dmg.fire      * mult) + (inf?.elemType === 'fire'      ? infElemPhys : 0);
  const bLig  = Math.round(dmg.lightning * mult) + (inf?.elemType === 'lightning' ? infElemPhys : 0);
  const bHoly = Math.round(dmg.holy      * mult) + (inf?.elemType === 'holy'      ? infElemPhys : 0);

  const strCoeff = (GRADE_COEFF[scl.str] ?? 0) * (inf?.strScale ?? 1);
  const dexCoeff = (GRADE_COEFF[scl.dex] ?? 0) * (inf?.dexScale ?? 1);
  const intCoeff = (GRADE_COEFF[scl.int] ?? 0) * (inf?.intScale ?? 1);
  const faiCoeff = (GRADE_COEFF[scl.fai] ?? 0) * (inf?.faiScale ?? 1);
  const arcCoeff = (GRADE_COEFF[scl.arc] ?? 0) * (inf?.arcScale ?? 1);

  const strBon  = bPhys * strCoeff * sclMul * interpGraph(PHYS_GRAPH,  stats.strength);
  const dexBon  = bPhys * dexCoeff * sclMul * interpGraph(PHYS_GRAPH,  stats.dexterity);
  const intBon  = bMag  * intCoeff * sclMul * interpGraph(MAGIC_GRAPH, stats.intelligence);
  const faiMag  = bMag  * faiCoeff * sclMul * interpGraph(MAGIC_GRAPH, stats.faith);
  const faiFire = bFire * faiCoeff * sclMul * interpGraph(MAGIC_GRAPH, stats.faith);
  const faiLig  = bLig  * faiCoeff * sclMul * interpGraph(MAGIC_GRAPH, stats.faith);
  const faiHoly = bHoly * faiCoeff * sclMul * interpGraph(MAGIC_GRAPH, stats.faith);
  const arcPhysBon = bPhys * arcCoeff * sclMul * interpGraph(ARC_GRAPH, stats.arcane);
  const arcMagBon  = bMag  * arcCoeff * sclMul * interpGraph(ARC_GRAPH, stats.arcane);
  const arcFireBon = bFire * arcCoeff * sclMul * interpGraph(ARC_GRAPH, stats.arcane);
  const arcLigBon  = bLig  * arcCoeff * sclMul * interpGraph(ARC_GRAPH, stats.arcane);
  const arcHolyBon = bHoly * arcCoeff * sclMul * interpGraph(ARC_GRAPH, stats.arcane);

  const physical  = Math.round(bPhys + strBon + dexBon + arcPhysBon);
  const magic     = Math.round(bMag  + intBon + faiMag + arcMagBon);
  const fire      = Math.round(bFire + faiFire + arcFireBon);
  const lightning = Math.round(bLig  + faiLig + arcLigBon);
  const holy      = Math.round(bHoly + faiHoly + arcHolyBon);
  const total     = physical + magic + fire + lightning + holy;

  return {
    ar: { physical, magic, fire, lightning, holy, total },
    breakdown: {
      base: { physical: bPhys, magic: bMag, fire: bFire, lightning: bLig, holy: bHoly },
      strBonus: Math.round(strBon),
      dexBonus: Math.round(dexBon),
      intBonus: Math.round(intBon),
      faiBonus: Math.round(faiMag + faiFire + faiLig + faiHoly),
      arcBonus: Math.round(arcPhysBon + arcMagBon + arcFireBon + arcLigBon + arcHolyBon),
    },
  };
}
