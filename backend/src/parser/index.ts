/**
 * Punto de entrada del parser de saves de Elden Ring (.sl2).
 *
 * Flujo:
 *   1. Validar magic BND4.
 *   2. Leer resúmenes desde la sección de sistema (nombre, nivel, activo, playtime).
 *   3. Para cada slot activo, leer datos del slot y buscar el bloque de stats.
 *   4. Devolver ParsedSave con toda la información.
 */

import { parseBnd4Header, ParseError } from './bnd4';
import { readAllSummaries } from './summary';
import { findStats } from './stats';
import { SLOT, SUMMARY } from './constants';
import type { ParsedSave, CharacterSlot, CharacterData, CharacterStats } from './types';

export { ParseError };
export type { ParsedSave, CharacterSlot, CharacterData, CharacterStats };

export function parseSl2(buf: Buffer): ParsedSave {
  // 1. Validar BND4
  parseBnd4Header(buf);

  // 2. Leer resúmenes de todos los slots
  const summaries = readAllSummaries(buf);

  // 3. Construir slots con stats
  const slots: CharacterSlot[] = summaries.map((summary) => {
    if (!summary.active) {
      return { index: summary.index, active: false };
    }

    const slotData = extractSlotData(buf, summary.index);
    const statsResult = slotData ? findStats(slotData, summary.level) : undefined;

    const character: CharacterData = {
      name:            summary.name,
      level:           summary.level,
      playtimeSeconds: summary.playtimeSeconds,
      stats:           statsResult?.stats ?? zeroStats(),
    };

    return { index: summary.index, active: true, character };
  });

  return { fileSize: buf.length, slots };
}

/**
 * Extrae los bytes de datos del slot `index` desde el archivo completo.
 * Devuelve undefined si el slot está fuera del rango del archivo.
 */
function extractSlotData(buf: Buffer, index: number): Buffer | undefined {
  const offset = SLOT.DATA_BASE + index * SLOT.DATA_STRIDE;
  const end    = offset + SLOT.DATA_SIZE;
  if (end > buf.length) return undefined;
  return buf.subarray(offset, end);
}

function zeroStats(): CharacterStats {
  return {
    vigor: 0, mind: 0, endurance: 0, strength: 0,
    dexterity: 0, intelligence: 0, faith: 0, arcane: 0,
  };
}

// ──────────────────────────────────────────────────────────────
// Utilidad: hex dump para calibración de offsets
// ──────────────────────────────────────────────────────────────

/**
 * Devuelve un hex dump formateado de una región del buffer.
 * Útil para verificar offsets con un .sl2 real.
 *
 * @param buf    Buffer del archivo
 * @param offset Offset absoluto donde empezar
 * @param length Cuántos bytes mostrar
 * @param label  Etiqueta opcional para la sección
 */
export function hexDump(buf: Buffer, offset: number, length: number, label?: string): string {
  const lines: string[] = [];
  if (label) lines.push(`── ${label} (offset 0x${offset.toString(16)}) ──`);

  const end = Math.min(offset + length, buf.length);

  for (let i = offset; i < end; i += 16) {
    const row = buf.subarray(i, Math.min(i + 16, end));
    const hex = Array.from(row)
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
    const ascii = Array.from(row)
      .map(b => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.'))
      .join('');
    lines.push(`${i.toString(16).padStart(8, '0')}  ${hex.padEnd(47, ' ')}  |${ascii}|`);
  }

  return lines.join('\n');
}

/**
 * Offsets de resumen conocidos para un slot dado.
 * Útil para apuntar exactamente dónde leer con hexDump().
 */
export function summaryOffsetsForSlot(index: number): Record<string, number> {
  const headerBase = SUMMARY.HEADER_BASE + index * SUMMARY.HEADER_STRIDE;
  return {
    activeStatus: SUMMARY.ACTIVE_BASE + index,
    nameStart:    headerBase + SUMMARY.FIELD.NAME,
    levelOffset:  headerBase + SUMMARY.FIELD.LEVEL,
    playtime:     headerBase + SUMMARY.FIELD.PLAYTIME,
  };
}
