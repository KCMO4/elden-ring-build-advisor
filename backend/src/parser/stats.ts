/**
 * Localiza y extrae los atributos (stats) del personaje desde el bloque
 * de datos de su slot (entradas 0-9 del BND4).
 *
 * Estrategia:
 *   Los stats no están en un offset fijo documentado públicamente.
 *   Se localizan usando el invariante de Elden Ring:
 *
 *     vigor + mind + endurance + strength + dexterity
 *     + intelligence + faith + arcane  =  level + 79
 *
 *   Cada stat ocupa 4 bytes (uint32 LE), orden: vig, mnd, end, str, dex, int, fai, arc.
 *   Además se valida que el uint16 a offset +44 desde la base coincida con el nivel.
 *
 * Fuente: Ariescyn/EldenRing-Save-Manager (hexedit.py)
 */

import { STATS } from './constants';
import type { CharacterStats } from './types';

export interface StatsResult {
  stats: CharacterStats;
  /** Offset dentro del slot donde se encontró el bloque de stats */
  foundAtOffset: number;
}

/**
 * Busca el bloque de stats dentro de los datos de un slot.
 * Devuelve undefined si no encuentra el patrón (slot corrupto o vacío).
 */
export function findStats(slotData: Buffer, level: number): StatsResult | undefined {
  const targetSum = level + STATS.SUM_CONSTANT;
  const blockSize = STATS.ORDER.length * STATS.STRIDE;

  // Busca en todo el slot, en pasos de 4 bytes (aligned)
  for (let i = 0; i <= slotData.length - blockSize - 44; i += 4) {
    const values = readStatBlock(slotData, i);
    if (values === null) continue;

    const sum = values.reduce((a, b) => a + b, 0);
    if (sum !== targetSum) continue;

    // Validación cruzada: el uint16 a +44 debe coincidir con el nivel
    const levelCross = slotData.readUInt16LE(i + STATS.LEVEL_CROSS_CHECK_OFFSET);
    if (levelCross !== level) continue;

    return {
      stats: {
        vigor:        values[0],
        mind:         values[1],
        endurance:    values[2],
        strength:     values[3],
        dexterity:    values[4],
        intelligence: values[5],
        faith:        values[6],
        arcane:       values[7],
      },
      foundAtOffset: i,
    };
  }

  return undefined;
}

/**
 * Lee los 8 stats como uint32 desde el offset dado.
 * Devuelve null si algún valor está fuera del rango válido [1, 99].
 */
function readStatBlock(buf: Buffer, offset: number): number[] | null {
  const values: number[] = [];

  for (let s = 0; s < STATS.ORDER.length; s++) {
    const v = buf.readUInt32LE(offset + s * STATS.STRIDE);
    if (v < STATS.MIN || v > STATS.MAX) return null;
    values.push(v);
  }

  return values;
}
