/**
 * Build Advisor — lógica de recomendaciones de armas para Elden Ring.
 *
 * Dado el bloque de stats de un personaje, analiza qué armas puede usar,
 * estima su AR (Attack Rating), detecta stats "cerca del umbral" y
 * señala si algún stat está siendo desaprovechado.
 */

import type { Weapon, WeaponScaling, CharacterStatsForFilter } from './types';
import { ItemStore } from './store';

// ── Tipos del advisor ────────────────────────────────────────

export interface WeaponRecommendation {
  weapon: Weapon;
  /** AR estimado con los stats actuales (suma de daño base × multiplicador de escalado) */
  estimatedAR: number;
  /** Si el arma puede equiparse ya */
  canEquip: boolean;
  /**
   * Stats que faltan para poder equipar el arma
   * (solo presentes si canEquip = false)
   */
  missingStats?: Partial<CharacterStatsForFilter>;
  /**
   * Stats que, si se subieran, mejorarían notablemente el AR de esta arma.
   * Indica el número de puntos necesarios para el próximo umbral de escalado.
   */
  nearThreshold?: ThresholdHint[];
}

export interface ThresholdHint {
  stat: keyof CharacterStatsForFilter;
  currentValue: number;
  /** Cuántos puntos faltan para el próximo umbral de mejora */
  pointsNeeded: number;
  /** AR adicional estimado al alcanzar el umbral */
  arGain: number;
}

export interface AdvisorResult {
  /** Armas equipables ordenadas por AR estimado (mayor primero) */
  usable: WeaponRecommendation[];
  /** Armas a 1-5 stats de poder equiparse (oportunidades cercanas) */
  nearlyUsable: WeaponRecommendation[];
  /** Stats que no escalan con ninguna arma equipada (están "desperdiciados") */
  wastedStats: Array<keyof CharacterStatsForFilter>;
}

// ── Multiplicadores de escalado ──────────────────────────────

/**
 * Multiplicadores aproximados para cada grado de escalado.
 * Fuente: wiki.fextralife.com / Elden Ring weapon scaling tables.
 * Estos son valores representativos en nivel de mejora máximo.
 */
const SCALING_MULTIPLIER: Record<string, number> = {
  'S': 1.4,
  'A': 1.0,
  'B': 0.75,
  'C': 0.5,
  'D': 0.3,
  'E': 0.1,
  '-': 0.0,
};

// ── Umbrales de stats para las distintas categorías de escalado ──────────────

/**
 * Valores de stat donde el grado de escalado "salta" a la siguiente letra.
 * Simplificado — los valores reales del juego son más complejos.
 */
const SCALING_THRESHOLDS = [20, 40, 60, 80] as const;

// ── Función principal ────────────────────────────────────────

/**
 * Analiza las stats del personaje y devuelve recomendaciones de armas.
 *
 * @param stats       Stats actuales del personaje
 * @param topN        Cuántas armas incluir en el top (default: 10)
 * @param nearlyRange Diferencia máxima de stats para "nearlyUsable" (default: 5)
 */
export function getAdvisorResult(
  stats: CharacterStatsForFilter,
  topN = 10,
  nearlyRange = 5,
): AdvisorResult {
  const store = ItemStore.getInstance();
  const allWeapons = store.getWeapons();

  const usable: WeaponRecommendation[] = [];
  const nearlyUsable: WeaponRecommendation[] = [];

  for (const weapon of allWeapons) {
    const missing = getMissingStats(weapon, stats);
    const totalMissing = Object.values(missing).reduce((a, b) => a + b, 0);

    if (totalMissing === 0) {
      // Puede equiparla
      const estimatedAR = estimateAR(weapon, stats);
      const nearThreshold = getNearThresholdHints(weapon, stats);
      usable.push({ weapon, estimatedAR, canEquip: true, nearThreshold });
    } else if (totalMissing <= nearlyRange) {
      // Está cerca de poder equiparla
      const estimatedAR = estimateAR(weapon, stats);
      nearlyUsable.push({
        weapon,
        estimatedAR,
        canEquip: false,
        missingStats: missing,
      });
    }
  }

  // Ordenar por AR estimado descendente y limitar a topN
  usable.sort((a, b) => b.estimatedAR - a.estimatedAR);
  nearlyUsable.sort((a, b) => b.estimatedAR - a.estimatedAR);

  const wastedStats = detectWastedStats(stats, usable.slice(0, topN).map(r => r.weapon));

  return {
    usable: usable.slice(0, topN),
    nearlyUsable: nearlyUsable.slice(0, topN),
    wastedStats,
  };
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Estima el AR total del arma con las stats del personaje.
 * AR = daño_base_total + escalado_str + escalado_dex + escalado_int + escalado_fai + escalado_arc
 */
function estimateAR(weapon: Weapon, stats: CharacterStatsForFilter): number {
  const baseDamage =
    weapon.damage.physical +
    weapon.damage.magic +
    weapon.damage.fire +
    weapon.damage.lightning +
    weapon.damage.holy;

  const scalingBonus =
    applyScaling(weapon.damage.physical, weapon.scaling.str, stats.strength) +
    applyScaling(weapon.damage.physical, weapon.scaling.dex, stats.dexterity) +
    applyScaling(weapon.damage.magic,    weapon.scaling.int, stats.intelligence) +
    applyScaling(weapon.damage.magic,    weapon.scaling.fai, stats.faith) +
    applyScaling(weapon.damage.physical, weapon.scaling.arc, stats.arcane);

  return Math.round(baseDamage + scalingBonus);
}

function applyScaling(baseDamage: number, grade: string, statValue: number): number {
  const multiplier = SCALING_MULTIPLIER[grade] ?? 0;
  if (multiplier === 0) return 0;
  // Bonus proporcional al valor del stat (simplificado lineal)
  return baseDamage * multiplier * (statValue / 99);
}

/**
 * Devuelve los stats faltantes para poder equipar el arma.
 * Si el resultado es {} el personaje puede equiparla.
 */
function getMissingStats(
  weapon: Weapon,
  stats: CharacterStatsForFilter,
): Partial<CharacterStatsForFilter> {
  const missing: Partial<CharacterStatsForFilter> = {};

  const checks: Array<[keyof CharacterStatsForFilter, number, number]> = [
    ['strength',     stats.strength,     weapon.requirements.str],
    ['dexterity',    stats.dexterity,    weapon.requirements.dex],
    ['intelligence', stats.intelligence, weapon.requirements.int],
    ['faith',        stats.faith,        weapon.requirements.fai],
    ['arcane',       stats.arcane,       weapon.requirements.arc],
  ];

  for (const [key, current, required] of checks) {
    if (required > 0 && current < required) {
      missing[key] = required - current;
    }
  }

  return missing;
}

/**
 * Detecta si el personaje está a pocos puntos de un umbral de escalado
 * que mejoraría el AR del arma.
 */
function getNearThresholdHints(
  weapon: Weapon,
  stats: CharacterStatsForFilter,
): ThresholdHint[] {
  const hints: ThresholdHint[] = [];
  const PROXIMITY = 5; // puntos de margen para considerar "cerca"

  const scalingMap: Array<[keyof CharacterStatsForFilter, keyof WeaponScaling]> = [
    ['strength',     'str'],
    ['dexterity',    'dex'],
    ['intelligence', 'int'],
    ['faith',        'fai'],
    ['arcane',       'arc'],
  ];

  for (const [statKey, scalingKey] of scalingMap) {
    const grade = weapon.scaling[scalingKey];
    if (grade === '-') continue;

    const current = stats[statKey] ?? 1;
    for (const threshold of SCALING_THRESHOLDS) {
      if (current < threshold && threshold - current <= PROXIMITY) {
        hints.push({
          stat: statKey,
          currentValue: current,
          pointsNeeded: threshold - current,
          arGain: Math.round(
            applyScaling(weapon.damage.physical, grade, threshold) -
            applyScaling(weapon.damage.physical, grade, current),
          ),
        });
        break; // solo el umbral más cercano
      }
    }
  }

  return hints;
}

/**
 * Detecta stats que el personaje tiene altos pero que ningún arma
 * del top usa para escalar (stats "desperdiciados").
 */
function detectWastedStats(
  stats: CharacterStatsForFilter,
  topWeapons: Weapon[],
): Array<keyof CharacterStatsForFilter> {
  const HIGH_THRESHOLD = 20;
  const wasted: Array<keyof CharacterStatsForFilter> = [];

  const scalingMap: Array<[keyof CharacterStatsForFilter, keyof WeaponScaling]> = [
    ['strength',     'str'],
    ['dexterity',    'dex'],
    ['intelligence', 'int'],
    ['faith',        'fai'],
    ['arcane',       'arc'],
  ];

  for (const [statKey, scalingKey] of scalingMap) {
    const value = stats[statKey] ?? 1;
    if (value < HIGH_THRESHOLD) continue;

    const anyWeaponScales = topWeapons.some(w => w.scaling[scalingKey] !== '-');
    if (!anyWeaponScales) {
      wasted.push(statKey);
    }
  }

  return wasted;
}
