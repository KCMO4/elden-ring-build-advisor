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
 *   Usamos valores representativos del rango de cada grado.
 * - No tenemos las tablas ReinforceParamWeapon, que cambian el escalado con cada nivel
 *   de mejora. El upgradeMultiplier es una aproximación lineal.
 * - Se usa CalcCorrectGraph ID 0 (Default) para físico y ID 4 (Magic) para elemental.
 *   Armas con afinidades Heavy/Keen/Quality/Occult usan IDs ligeramente diferentes
 *   (1/2/7/8) con breakpoints similares.
 *
 * Precisión esperada: ±5-15% del valor real, dependiendo del arma y nivel de mejora.
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
// del rango de cada grado. Esto introduce error inherente (~±15%).
const GRADE_COEFF: Record<string, number> = {
  'S': 1.75,  // S grade: raw ≥175, typical 175-250
  'A': 1.50,  // A grade: raw 140-174
  'B': 1.10,  // B grade: raw 90-139
  'C': 0.75,  // C grade: raw 60-89
  'D': 0.40,  // D grade: raw 25-59
  'E': 0.12,  // E grade: raw 1-24
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

// ── Cálculo de AR estimado ────────────────────────────────────────

/** Retorna el AR estimado (total por tipo de daño + total) para el arma equipada. */
export function estimateEquippedAR(
  weapon: EquippedWeapon,
  stats: CharacterStats,
): { physical: number; magic: number; fire: number; lightning: number; holy: number; total: number } {
  const lvl    = weapon.upgradeLevel ?? 0;
  const mult   = upgradeMultiplier(lvl);
  const dmg    = weapon.damage!;
  const scl    = weapon.scaling!;

  // Daño base ajustado por nivel de mejora
  const bPhys = Math.round(dmg.physical  * mult);
  const bMag  = Math.round(dmg.magic     * mult);
  const bFire = Math.round(dmg.fire      * mult);
  const bLig  = Math.round(dmg.lightning * mult);
  const bHoly = Math.round(dmg.holy      * mult);

  // Bonus de escalado: cada stat escala su tipo de daño correspondiente
  // Física: STR + DEX → physical (CalcCorrectGraph ID 0)
  const strBonus = bPhys * (GRADE_COEFF[scl.str] ?? 0) * interpGraph(PHYS_GRAPH,  stats.strength);
  const dexBonus = bPhys * (GRADE_COEFF[scl.dex] ?? 0) * interpGraph(PHYS_GRAPH,  stats.dexterity);
  // Mágica: INT → magic (CalcCorrectGraph ID 4)
  const intBonus = bMag  * (GRADE_COEFF[scl.int] ?? 0) * interpGraph(MAGIC_GRAPH, stats.intelligence);
  // Fuego / Relámp / Sagrado: FAI (CalcCorrectGraph ID 4)
  const faiMag   = bMag  * (GRADE_COEFF[scl.fai] ?? 0) * interpGraph(MAGIC_GRAPH, stats.faith);
  const faiFire  = bFire * (GRADE_COEFF[scl.fai] ?? 0) * interpGraph(MAGIC_GRAPH, stats.faith);
  const faiLig   = bLig  * (GRADE_COEFF[scl.fai] ?? 0) * interpGraph(MAGIC_GRAPH, stats.faith);
  const faiHoly  = bHoly * (GRADE_COEFF[scl.fai] ?? 0) * interpGraph(MAGIC_GRAPH, stats.faith);
  // ARC: escalado arcano (CalcCorrectGraph ID 7)
  const arcBonus = bPhys * (GRADE_COEFF[scl.arc] ?? 0) * interpGraph(ARC_GRAPH,   stats.arcane);

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
  const lvl  = weapon.upgradeLevel ?? 0;
  const mult = upgradeMultiplier(lvl);
  const dmg  = weapon.damage!;
  const scl  = weapon.scaling!;

  const bPhys = Math.round(dmg.physical  * mult);
  const bMag  = Math.round(dmg.magic     * mult);
  const bFire = Math.round(dmg.fire      * mult);
  const bLig  = Math.round(dmg.lightning * mult);
  const bHoly = Math.round(dmg.holy      * mult);

  const strBon  = bPhys * (GRADE_COEFF[scl.str] ?? 0) * interpGraph(PHYS_GRAPH,  stats.strength);
  const dexBon  = bPhys * (GRADE_COEFF[scl.dex] ?? 0) * interpGraph(PHYS_GRAPH,  stats.dexterity);
  const intBon  = bMag  * (GRADE_COEFF[scl.int] ?? 0) * interpGraph(MAGIC_GRAPH, stats.intelligence);
  const faiMag  = bMag  * (GRADE_COEFF[scl.fai] ?? 0) * interpGraph(MAGIC_GRAPH, stats.faith);
  const faiFire = bFire * (GRADE_COEFF[scl.fai] ?? 0) * interpGraph(MAGIC_GRAPH, stats.faith);
  const faiLig  = bLig  * (GRADE_COEFF[scl.fai] ?? 0) * interpGraph(MAGIC_GRAPH, stats.faith);
  const faiHoly = bHoly * (GRADE_COEFF[scl.fai] ?? 0) * interpGraph(MAGIC_GRAPH, stats.faith);
  const arcBon  = bPhys * (GRADE_COEFF[scl.arc] ?? 0) * interpGraph(ARC_GRAPH,   stats.arcane);

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
