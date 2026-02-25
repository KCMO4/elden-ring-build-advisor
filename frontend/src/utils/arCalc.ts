/**
 * Estimación de Attack Rating (AR) para Elden Ring.
 *
 * Usa las curvas CalcCorrectGraph reales extraídas de regulation.bin
 * (fuente: ThomasJClark/elden-ring-weapon-calculator, hanslhansl/elden-ring-damage-optimizer).
 *
 * La interpolación entre breakpoints usa factores exponenciales (adjPt) exactos del juego.
 *
 * Limitaciones conocidas:
 * - Los grados de escalado (S/A/B/C/D/E) son letras; el valor exacto varía por arma.
 *   Usamos valores representativos calibrados contra armas comunes.
 * - scalingUpgradeMultiplier aproxima cómo el escalado mejora con cada nivel de
 *   upgrade (~+50% al máximo), sin las tablas ReinforceParamWeapon exactas.
 * - Se usa CalcCorrectGraph ID 0 (Default) para físico y ID 4 (Magic) para elemental.
 *   Armas con afinidades Heavy/Keen/Quality/Occult usan IDs ligeramente diferentes
 *   (1/2/7/8) con breakpoints similares.
 *
 * Precisión esperada: ±5-10% del valor real para la mayoría de armas.
 */

import type { EquippedWeapon, CharacterStats } from '../types';

// ── CalcCorrectGraph — datos reales de regulation.bin ────────────
//
// Cada entrada = { maxVal (stat breakpoint), maxGrowVal (output 0-1), adjPt (exponente) }
// La curva entre breakpoints usa interpolación no-lineal:
//   adjPt > 0 → ratio^adjPt      (acelerante: empieza lento)
//   adjPt < 0 → 1-(1-ratio)^|adj| (desacelerante: empieza rápido)
//   adjPt = 1 → lineal

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

/**
 * Interpola un valor de stat sobre un CalcCorrectGraph usando la fórmula exacta del juego.
 * El adjPt del stage ANTERIOR (left boundary) controla la forma de la curva en ese intervalo.
 */
function interpGraph(graph: CalcCorrectStage[], stat: number): number {
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
      // adj === 0 or adj === 1.0 → linear (ratio unchanged)

      return prev.maxGrowVal + (curr.maxGrowVal - prev.maxGrowVal) * ratio;
    }
  }
  return graph[graph.length - 1].maxGrowVal;
}

// ── Coeficientes de grado ────────────────────────────────────────
// El juego almacena un valor de escalado exacto por arma (correctStrength, etc.)
// y usa umbrales para asignar la letra: S≥175, A≥140, B≥90, C≥60, D≥25, E≥1
// (valores ÷100 para obtener el multiplicador real).
//
// Como solo tenemos la letra (de fanapis), usamos valores representativos
// del rango de cada grado, calibrados con armas comunes del juego.
const GRADE_COEFF: Record<string, number> = {
  'S': 1.85,  // S grade: raw ≥175, typical 180-200 (Ruins Greatsword STR S = 186)
  'A': 1.55,  // A grade: raw 140-174, typical ~155  (Uchigatana +25 DEX A = 155)
  'B': 1.15,  // B grade: raw 90-139, typical ~115   (Longsword +25 STR B = 109)
  'C': 0.75,  // C grade: raw 60-89, typical ~75     (Uchigatana base DEX C = 80)
  'D': 0.42,  // D grade: raw 25-59, typical ~42     (Claymore INT D = 40)
  'E': 0.12,  // E grade: raw 1-24, typical ~12      (Uchigatana base ARC E = 15)
  '-': 0.00,
};

// ── Fórmula de upgrade (incremento del daño base por nivel) ──────
//
// Armas somber (+0 a +10): factor máximo ~×2.44 (e.g. Moonveil base 73 → +10: 178)
// Armas estándar (+0 a +25): factor máximo ~×2.45 (e.g. Longsword base 110 → +25: 269)
//
// Aproximación lineal: damage(N) = base × (1 + (N / maxN) × factor)
//
// Heurística: si upgradeLevel <= 10 → arma somber (maxN=10)
//             si upgradeLevel > 10  → arma estándar (maxN=25)

function upgradeMultiplier(upgradeLevel: number): number {
  if (upgradeLevel <= 0) return 1.0;
  const isUnique = upgradeLevel <= 10;
  const [maxN, factor] = isUnique ? [10, 1.44] : [25, 1.45];
  return 1.0 + (upgradeLevel / maxN) * factor;
}

/**
 * Scaling values improve with upgrades. At max upgrade, scaling is roughly
 * 1.4-1.6× the base +0 value for most weapons (ReinforceParamWeapon data).
 * Since we only have the +0 scaling grade, we approximate the upgrade effect
 * with a linear interpolation: 1.0 at +0, ~1.5 at max.
 */
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
//
// Approximate multipliers for how infusions alter base damage and scaling.
// Only applies to standard (smithing stone) weapons with an affinity.
// Somber weapons have no infusion — their base data is already correct.

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

// ── Cálculo de AR estimado ────────────────────────────────────────

/** Retorna el AR estimado (total por tipo de daño + total) para el arma equipada. */
export function estimateEquippedAR(
  weapon: EquippedWeapon,
  stats: CharacterStats,
): { physical: number; magic: number; fire: number; lightning: number; holy: number; total: number } {
  const lvl    = weapon.upgradeLevel ?? 0;
  const mult   = upgradeMultiplier(lvl);
  const sclMul = scalingUpgradeMultiplier(lvl);
  const dmg    = weapon.damage!;
  const scl    = weapon.scaling!;

  // Infusion modifier (only for standard weapons with an affinity)
  const inf = weapon.infusion ? INFUSION_MODIFIERS[weapon.infusion] : undefined;

  // Daño base ajustado por nivel de mejora (+ infusion physMult)
  const bPhys = Math.round(dmg.physical * mult * (inf?.physMult ?? 1));
  // Elemental: base data + infusion-added elemental
  const infElemPhys = inf?.elemRatio ? Math.round(dmg.physical * mult * inf.elemRatio) : 0;
  const bMag  = Math.round(dmg.magic     * mult) + (inf?.elemType === 'magic'     ? infElemPhys : 0);
  const bFire = Math.round(dmg.fire      * mult) + (inf?.elemType === 'fire'      ? infElemPhys : 0);
  const bLig  = Math.round(dmg.lightning * mult) + (inf?.elemType === 'lightning' ? infElemPhys : 0);
  const bHoly = Math.round(dmg.holy      * mult) + (inf?.elemType === 'holy'      ? infElemPhys : 0);

  // Scaling coefficients (modified by infusion if present)
  const strCoeff = (GRADE_COEFF[scl.str] ?? 0) * (inf?.strScale ?? 1);
  const dexCoeff = (GRADE_COEFF[scl.dex] ?? 0) * (inf?.dexScale ?? 1);
  const intCoeff = (GRADE_COEFF[scl.int] ?? 0) * (inf?.intScale ?? 1);
  const faiCoeff = (GRADE_COEFF[scl.fai] ?? 0) * (inf?.faiScale ?? 1);
  const arcCoeff = (GRADE_COEFF[scl.arc] ?? 0) * (inf?.arcScale ?? 1);

  // Bonus de escalado: cada stat escala su tipo de daño correspondiente
  const strBonus = bPhys * strCoeff * sclMul * interpGraph(PHYS_GRAPH,  stats.strength);
  const dexBonus = bPhys * dexCoeff * sclMul * interpGraph(PHYS_GRAPH,  stats.dexterity);
  const intBonus = bMag  * intCoeff * sclMul * interpGraph(MAGIC_GRAPH, stats.intelligence);
  const faiMag   = bMag  * faiCoeff * sclMul * interpGraph(MAGIC_GRAPH, stats.faith);
  const faiFire  = bFire * faiCoeff * sclMul * interpGraph(MAGIC_GRAPH, stats.faith);
  const faiLig   = bLig  * faiCoeff * sclMul * interpGraph(MAGIC_GRAPH, stats.faith);
  const faiHoly  = bHoly * faiCoeff * sclMul * interpGraph(MAGIC_GRAPH, stats.faith);
  const arcBonus = bPhys * arcCoeff * sclMul * interpGraph(ARC_GRAPH,   stats.arcane);

  const physical  = Math.round(bPhys + strBonus + dexBonus + arcBonus);
  const magic     = Math.round(bMag  + intBonus + faiMag);
  const fire      = Math.round(bFire + faiFire);
  const lightning = Math.round(bLig  + faiLig);
  const holy      = Math.round(bHoly + faiHoly);
  const total     = physical + magic + fire + lightning + holy;

  return { physical, magic, fire, lightning, holy, total };
}

/**
 * Apilamiento multiplicativo de negación de daño (fórmula exacta del juego).
 * Cada pieza de armadura aporta una fracción de negación independiente.
 *
 * total_negation% = (1 − ∏(1 − ni/100)) × 100
 */
export function stackNegation(values: number[]): number {
  const product = values.reduce((acc, v) => acc * (1 - v / 100), 1.0);
  return Math.round((1 - product) * 1000) / 10; // una décima de precisión
}

// ── Desglose de escalado ──────────────────────────────────

export interface ARBreakdown {
  /** Daño base por tipo, ajustado por nivel de mejora (antes del escalado de stats) */
  base: { physical: number; magic: number; fire: number; lightning: number; holy: number };
  /** Contribución neta de cada stat al AR total (suma de todos los tipos afectados) */
  strBonus: number;
  dexBonus: number;
  intBonus: number;
  faiBonus: number;
  arcBonus: number;
}

/**
 * Igual que estimateEquippedAR pero también devuelve el desglose intermedio:
 * daño base por nivel y aporte de cada stat.
 */
export function estimateARWithBreakdown(
  weapon: EquippedWeapon,
  stats:  CharacterStats,
): { ar: ReturnType<typeof estimateEquippedAR>; breakdown: ARBreakdown } {
  const lvl    = weapon.upgradeLevel ?? 0;
  const mult   = upgradeMultiplier(lvl);
  const sclMul = scalingUpgradeMultiplier(lvl);
  const dmg    = weapon.damage!;
  const scl    = weapon.scaling!;

  // Infusion modifier
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
  const arcBon  = bPhys * arcCoeff * sclMul * interpGraph(ARC_GRAPH,   stats.arcane);

  const physical  = Math.round(bPhys + strBon + dexBon + arcBon);
  const magic     = Math.round(bMag  + intBon + faiMag);
  const fire      = Math.round(bFire + faiFire);
  const lightning = Math.round(bLig  + faiLig);
  const holy      = Math.round(bHoly + faiHoly);
  const total     = physical + magic + fire + lightning + holy;

  return {
    ar: { physical, magic, fire, lightning, holy, total },
    breakdown: {
      base: { physical: bPhys, magic: bMag, fire: bFire, lightning: bLig, holy: bHoly },
      strBonus: Math.round(strBon),
      dexBonus: Math.round(dexBon),
      intBonus: Math.round(intBon),
      faiBonus: Math.round(faiMag + faiFire + faiLig + faiHoly),
      arcBonus: Math.round(arcBon),
    },
  };
}
