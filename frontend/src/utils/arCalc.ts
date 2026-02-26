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

// ── Somber detection ─────────────────────────────────────────────
// Definitive: scaling data has reinforce tables — somber = 11 entries, standard = 26.
// Fallback heuristic: infusion present → standard; upgradeLevel > 10 → standard.

export function isSomberHeuristic(weapon: { upgradeLevel?: number; infusion?: string; baseId?: number }): boolean {
  // Try definitive detection from scaling data (reinforce table length)
  if (weapon.baseId) {
    const bundle = getScalingData();
    if (bundle) {
      const exactW = bundle.weapons[weapon.baseId] ?? bundle.weapons[weapon.baseId * 100];
      if (exactW) {
        const table = bundle.reinforce[exactW.reinforceId];
        if (table) return table.length <= 11;
      }
    }
  }
  // Fallback heuristic: somber weapons max at +10 and can't be infused
  if (weapon.infusion && weapon.infusion !== 'Standard' && weapon.infusion !== 'None') return false;
  if ((weapon.upgradeLevel ?? 0) > 10) return false;
  // Default to standard (more common) when we can't determine
  return false;
}

// ── Upgrade multipliers (fallback) ──────────────────────────────

function upgradeMultiplier(upgradeLevel: number, somber: boolean): number {
  if (upgradeLevel <= 0) return 1.0;
  const [maxN, factor] = somber ? [10, 1.44] : [25, 1.45];
  return 1.0 + (upgradeLevel / maxN) * factor;
}

function scalingUpgradeMultiplier(upgradeLevel: number, somber: boolean): number {
  if (upgradeLevel <= 0) return 1.0;
  const [maxN, factor] = somber ? [10, 0.50] : [25, 0.50];
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

// Level-based defense component (softcaps at 71, 91, 161)
function defenseFromLevel(runeLevel: number): number {
  if (runeLevel < 72)  return 40 + (runeLevel + 78) / 2.483;
  if (runeLevel < 92)  return 29 + runeLevel;
  if (runeLevel < 161) return 120 + (runeLevel - 91) / 4.667;
  return 135 + (runeLevel - 161) / 27.6;
}

// Each defense type has its own stat curve (softcaps differ!)

// Physical ← STR (softcaps 30, 40, 60)
function physDefFromSTR(str: number): number {
  if (str < 30)  return str / 3;
  if (str < 40)  return 10 + (str - 30) / 2;
  if (str < 60)  return 15 + (str - 40) / 1.333;
  return 30 + (str - 60) / 3.9;
}

// Magic ← INT (softcaps 20, 35, 60) — contributes much more per point
function magDefFromINT(int: number): number {
  if (int < 20)  return int * 2;
  if (int < 35)  return 40 + (int - 20) / 1.5;
  if (int < 60)  return 50 + (int - 35) / 2.5;
  return 60 + (int - 60) / 3.9;
}

// Fire ← VIG (softcaps 30, 40, 60)
function fireDefFromVIG(vig: number): number {
  if (vig < 30)  return vig / 1.5;
  if (vig < 40)  return 20 + (vig - 30) * 2;
  if (vig < 60)  return vig;
  return 60 + (vig - 60) / 3.9;
}

// Holy ← ARC (softcaps 20, 35, 60) — same curve as Magic/INT
function holyDefFromARC(arc: number): number {
  if (arc < 20)  return arc * 2;
  if (arc < 35)  return 40 + (arc - 20) / 1.5;
  if (arc < 60)  return 50 + (arc - 35) / 2.5;
  return 60 + (arc - 60) / 3.9;
}

export function calcFlatDefense(level: number, stats: CharacterStats): FlatDefense {
  const lvl = defenseFromLevel(level);
  return {
    physical:  Math.floor(lvl + physDefFromSTR(stats.strength)),
    magic:     Math.floor(lvl + magDefFromINT(stats.intelligence)),
    fire:      Math.floor(lvl + fireDefFromVIG(stats.vigor)),
    lightning: Math.floor(lvl),
    holy:      Math.floor(lvl + holyDefFromARC(stats.arcane)),
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

// ── Weapon requirement penalty ──────────────────────────────────
// When you don't meet a weapon's stat requirements, the game applies a severe
// AR penalty (~60% reduction). 2H STR bonus counts for requirement checks.

export function meetsRequirements(
  weapon: EquippedWeapon,
  stats: CharacterStats,
  twoHanding: boolean = false,
): boolean {
  const req = weapon.requirements;
  if (!req) return true;
  const effStr = twoHanding ? Math.min(99, Math.floor(stats.strength * 1.5)) : stats.strength;
  return effStr >= (req.str ?? 0) &&
    stats.dexterity >= (req.dex ?? 0) &&
    stats.intelligence >= (req.int ?? 0) &&
    stats.faith >= (req.fai ?? 0) &&
    stats.arcane >= (req.arc ?? 0);
}

const UNMET_PENALTY = 0.4; // ~60% damage reduction when requirements not met

// ── Cálculo de AR estimado (con fallback) ───────────────────────

export function estimateEquippedAR(
  weapon: EquippedWeapon,
  stats: CharacterStats,
  twoHanding: boolean = false,
): { physical: number; magic: number; fire: number; lightning: number; holy: number; total: number } {
  // Try exact calculation first
  const exact = tryExactAR(weapon, stats);
  if (exact) {
    if (!meetsRequirements(weapon, stats, twoHanding)) {
      return {
        physical: Math.round(exact.physical * UNMET_PENALTY),
        magic: Math.round(exact.magic * UNMET_PENALTY),
        fire: Math.round(exact.fire * UNMET_PENALTY),
        lightning: Math.round(exact.lightning * UNMET_PENALTY),
        holy: Math.round(exact.holy * UNMET_PENALTY),
        total: Math.round(exact.total * UNMET_PENALTY),
      };
    }
    return exact;
  }

  // Fallback: approximation by scaling grade
  const lvl    = weapon.upgradeLevel ?? 0;
  const somber = isSomberHeuristic(weapon);
  const mult   = upgradeMultiplier(lvl, somber);
  const sclMul = scalingUpgradeMultiplier(lvl, somber);
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

  const pen = meetsRequirements(weapon, stats, twoHanding) ? 1 : UNMET_PENALTY;
  const physical  = Math.round((bPhys + strBonus + dexBonus + arcPhysBon) * pen);
  const magic     = Math.round((bMag  + intBonus + faiMag + arcMagBon) * pen);
  const fire      = Math.round((bFire + faiFire + arcFireBon) * pen);
  const lightning = Math.round((bLig  + faiLig + arcLigBon) * pen);
  const holy      = Math.round((bHoly + faiHoly + arcHolyBon) * pen);
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

function tryExactARWithBreakdown(
  weapon: EquippedWeapon,
  stats: CharacterStats,
  applyPenalty = true,
): { ar: { physical: number; magic: number; fire: number; lightning: number; holy: number; total: number }; breakdown: ARBreakdown } | null {
  const bundle = getScalingData();
  if (!bundle) return null;

  const baseId = weapon.baseId;
  if (!baseId) return null;

  const exactW: WeaponScalingEntry | undefined =
    bundle.weapons[baseId] ?? bundle.weapons[baseId * 100];
  if (!exactW) return null;

  const lvl = weapon.upgradeLevel ?? 0;
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

  // Scaling coefficients at +upgrade
  const strCoeff = (exactW.str / 100) * rf.strScl;
  const dexCoeff = (exactW.dex / 100) * rf.dexScl;
  const intCoeff = (exactW.int / 100) * rf.intScl;
  const faiCoeff = (exactW.fai / 100) * rf.faiScl;
  const arcCoeff = (exactW.arc / 100) * rf.arcScl;

  // Resolve CalcCorrectGraph per damage type
  const gPhys = resolveGraph(exactW.graphPhys);
  const gMag  = resolveGraph(exactW.graphMag);
  const gFire = resolveGraph(exactW.graphFire);
  const gLtn  = resolveGraph(exactW.graphLtn);
  const gHoly = resolveGraph(exactW.graphHoly);
  const gArc  = resolveGraph(7);

  // Per-stat bonuses
  const strPhys = bPhys * strCoeff * interpGraph(gPhys, stats.strength);
  const dexPhys = bPhys * dexCoeff * interpGraph(gPhys, stats.dexterity);

  const intMag  = bMag  * intCoeff * interpGraph(gMag, stats.intelligence);
  const faiMag  = bMag  * faiCoeff * interpGraph(gMag, stats.faith);
  const faiFire = bFire * faiCoeff * interpGraph(gFire, stats.faith);
  const faiLtn  = bLtn  * faiCoeff * interpGraph(gLtn, stats.faith);
  const faiHoly = bHoly * faiCoeff * interpGraph(gHoly, stats.faith);

  const arcPhys = bPhys * arcCoeff * interpGraph(gArc, stats.arcane);
  const arcMag  = bMag  * arcCoeff * interpGraph(gArc, stats.arcane);
  const arcFire = bFire * arcCoeff * interpGraph(gArc, stats.arcane);
  const arcLtn  = bLtn  * arcCoeff * interpGraph(gArc, stats.arcane);
  const arcHoly = bHoly * arcCoeff * interpGraph(gArc, stats.arcane);

  const pen = applyPenalty && !meetsRequirements(weapon, stats) ? UNMET_PENALTY : 1;

  const physical  = Math.round((bPhys + strPhys + dexPhys + arcPhys) * pen);
  const magic     = Math.round((bMag  + intMag + faiMag + arcMag) * pen);
  const fire      = Math.round((bFire + faiFire + arcFire) * pen);
  const lightning = Math.round((bLtn  + faiLtn + arcLtn) * pen);
  const holy      = Math.round((bHoly + faiHoly + arcHoly) * pen);
  const total     = physical + magic + fire + lightning + holy;

  return {
    ar: { physical, magic, fire, lightning, holy, total },
    breakdown: {
      base: { physical: bPhys, magic: bMag, fire: bFire, lightning: bLtn, holy: bHoly },
      strBonus: Math.round((strPhys) * pen),
      dexBonus: Math.round((dexPhys) * pen),
      intBonus: Math.round((intMag) * pen),
      faiBonus: Math.round((faiMag + faiFire + faiLtn + faiHoly) * pen),
      arcBonus: Math.round((arcPhys + arcMag + arcFire + arcLtn + arcHoly) * pen),
    },
  };
}

export function estimateARWithBreakdown(
  weapon: EquippedWeapon,
  stats:  CharacterStats,
  applyPenalty = true,
): { ar: ReturnType<typeof estimateEquippedAR>; breakdown: ARBreakdown } {
  // Try exact calculation first (regulation.bin data)
  const exactResult = tryExactARWithBreakdown(weapon, stats, applyPenalty);
  if (exactResult) return exactResult;

  // Fallback: approximation by scaling grade
  const lvl    = weapon.upgradeLevel ?? 0;
  const somber = isSomberHeuristic(weapon);
  const mult   = upgradeMultiplier(lvl, somber);
  const sclMul = scalingUpgradeMultiplier(lvl, somber);
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

  const pen = applyPenalty && !meetsRequirements(weapon, stats) ? UNMET_PENALTY : 1;
  const physical  = Math.round((bPhys + strBon + dexBon + arcPhysBon) * pen);
  const magic     = Math.round((bMag  + intBon + faiMag + arcMagBon) * pen);
  const fire      = Math.round((bFire + faiFire + arcFireBon) * pen);
  const lightning = Math.round((bLig  + faiLig + arcLigBon) * pen);
  const holy      = Math.round((bHoly + faiHoly + arcHolyBon) * pen);
  const total     = physical + magic + fire + lightning + holy;

  return {
    ar: { physical, magic, fire, lightning, holy, total },
    breakdown: {
      base: { physical: bPhys, magic: bMag, fire: bFire, lightning: bLig, holy: bHoly },
      strBonus: Math.round(strBon * pen),
      dexBonus: Math.round(dexBon * pen),
      intBonus: Math.round(intBon * pen),
      faiBonus: Math.round((faiMag + faiFire + faiLig + faiHoly) * pen),
      arcBonus: Math.round((arcPhysBon + arcMagBon + arcFireBon + arcLigBon + arcHolyBon) * pen),
    },
  };
}

// ── Spell Scaling (Sorcery / Incant Scaling) estimate ────────────

/** Approximate spell buff base values at upgrade levels (community data averages) */
const SPELL_BUFF_BASE: Record<'standard' | 'somber', number[]> = {
  standard: [100, 103, 106, 109, 112, 115, 119, 123, 128, 133, 138, 144, 150, 156, 162, 169, 176, 183, 190, 198, 206, 214, 222, 231, 240, 250],
  somber:   [100, 115, 130, 145, 162, 180, 198, 218, 235, 245, 250],
};

const SPELL_GRADE_COEFF: Record<string, number> = {
  'S': 1.40, 'A': 1.00, 'B': 0.75, 'C': 0.60, 'D': 0.30, 'E': 0.10, '-': 0,
};

/**
 * Estimates Sorcery/Incant Scaling for a staff or seal.
 *
 * When exact scaling data is loaded: uses real CalcCorrectGraph curves +
 * exact weapon scaling coefficients from regulation.bin.
 * Otherwise falls back to grade-based approximation.
 */
export function estimateSpellScaling(
  weapon: EquippedWeapon,
  stats: CharacterStats,
): number | null {
  if (!weapon.itemType) return null;
  const isStaff = weapon.itemType === 'Glintstone Staff';
  const isSeal  = weapon.itemType === 'Sacred Seal';
  if (!isStaff && !isSeal) return null;
  if (!weapon.scaling) return null;

  // Base spell buff from upgrade level
  const lvl = weapon.upgradeLevel ?? 0;
  const isSomber = isSomberHeuristic(weapon);
  const table = isSomber ? SPELL_BUFF_BASE.somber : SPELL_BUFF_BASE.standard;
  const baseBuff = table[Math.min(lvl, table.length - 1)];

  // ── Try exact path (scaling data loaded) ──
  const bundle = getScalingData();
  if (bundle && weapon.baseId) {
    const exactW = bundle.weapons[weapon.baseId] ?? bundle.weapons[weapon.baseId * 100];
    if (exactW) {
      const reinforceTable = bundle.reinforce[exactW.reinforceId];
      const rf = reinforceTable?.[Math.min(lvl, (reinforceTable?.length ?? 1) - 1)];
      if (rf) {
        // Exact scaling coefficients at current upgrade level (÷100 for multiplier)
        const intCoeff = (exactW.int / 100) * rf.intScl;
        const faiCoeff = (exactW.fai / 100) * rf.faiScl;
        const arcCoeff = (exactW.arc / 100) * rf.arcScl;

        // Resolve exact CalcCorrectGraph per stat
        const gInt = resolveGraph(exactW.graphMag);
        const gFai = resolveGraph(exactW.graphHoly);
        const gArc = resolveGraph(7);

        const intContrib = intCoeff * interpGraph(gInt, stats.intelligence);
        const faiContrib = faiCoeff * interpGraph(gFai, stats.faith);
        const arcContrib = arcCoeff * interpGraph(gArc, stats.arcane);

        return Math.round(baseBuff * (1 + intContrib + faiContrib + arcContrib));
      }
    }
  }

  // ── Fallback: grade-based approximation ──
  const primaryStat = isStaff ? stats.intelligence : stats.faith;
  const primaryGrade = isStaff ? weapon.scaling.int : weapon.scaling.fai;
  const coeff = SPELL_GRADE_COEFF[primaryGrade] ?? 0;

  const secGrade = isStaff ? weapon.scaling.fai : weapon.scaling.arc;
  const secStat  = isStaff ? stats.faith : stats.arcane;
  const secCoeff = SPELL_GRADE_COEFF[secGrade] ?? 0;

  const primaryContrib = coeff * interpGraph(MAGIC_GRAPH, primaryStat);
  const secContrib     = secCoeff > 0 ? secCoeff * 0.5 * interpGraph(MAGIC_GRAPH, secStat) : 0;

  return Math.round(baseBuff * (1 + primaryContrib + secContrib));
}

// ── ARC Passive Buildup Scaling ──────────────────────────────────
// Blood/Poison buildup scales with Arcane via CalcCorrectGraph (same ARC curve).
// Uses the weapon's ARC scaling grade to determine the coefficient.

export function estimatePassiveBuildup(
  baseBuildup: number,
  arcane: number,
  arcGrade: string,
): number {
  const coeff = GRADE_COEFF[arcGrade] ?? 0;
  if (coeff <= 0) return baseBuildup;
  return Math.round(baseBuildup * (1 + coeff * interpGraph(ARC_GRAPH, arcane)));
}
