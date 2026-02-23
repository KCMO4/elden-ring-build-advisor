/**
 * Extrae la información de resumen de cada personaje desde la sección
 * de sistema del .sl2 (cabecera rápida usada en el menú de selección).
 *
 * Los offsets son absolutos al archivo completo y están verificados
 * en múltiples implementaciones de referencia.
 */

import { SLOT, SUMMARY } from './constants';
import { ParseError } from './bnd4';

export interface SlotSummary {
  index: number;
  active: boolean;
  name: string;
  level: number;
  playtimeSeconds: number;
}

/**
 * Lee los resúmenes de los 10 slots desde la sección de sistema.
 * Lanza ParseError si el archivo es demasiado pequeño.
 */
export function readAllSummaries(buf: Buffer): SlotSummary[] {
  const minSize = SUMMARY.ACTIVE_BASE + SLOT.COUNT;
  if (buf.length < minSize) {
    throw new ParseError(
      `El archivo es demasiado pequeño para contener la sección de resumen ` +
      `(${buf.length} bytes, se necesitan al menos ${minSize})`,
    );
  }

  const summaries: SlotSummary[] = [];
  for (let i = 0; i < SLOT.COUNT; i++) {
    summaries.push(readSlotSummary(buf, i));
  }
  return summaries;
}

function readSlotSummary(buf: Buffer, index: number): SlotSummary {
  // ── Estado activo ──────────────────────────────────────────────
  const active = buf.readUInt8(SUMMARY.ACTIVE_BASE + index) !== 0;

  if (!active) {
    return { index, active, name: '', level: 0, playtimeSeconds: 0 };
  }

  // ── Cabecera de resumen ────────────────────────────────────────
  const headerBase = SUMMARY.HEADER_BASE + index * SUMMARY.HEADER_STRIDE;
  const headerEnd  = headerBase + SUMMARY.HEADER_STRIDE;

  if (headerEnd > buf.length) {
    throw new ParseError(
      `Cabecera del slot ${index} excede el tamaño del archivo`,
    );
  }

  const name           = readUtf16Name(buf, headerBase + SUMMARY.FIELD.NAME, SUMMARY.FIELD.NAME_BYTES);
  const level          = buf.readUInt16LE(headerBase + SUMMARY.FIELD.LEVEL);
  const playtimeSeconds = buf.readUInt32LE(headerBase + SUMMARY.FIELD.PLAYTIME);

  return { index, active, name, level, playtimeSeconds };
}

/**
 * Lee una cadena UTF-16LE de `maxBytes` bytes desde `offset`,
 * deteniéndose en el primer terminador nulo (0x00 0x00).
 */
function readUtf16Name(buf: Buffer, offset: number, maxBytes: number): string {
  const end   = Math.min(offset + maxBytes, buf.length);
  const slice = buf.subarray(offset, end);

  // Busca terminador nulo UTF-16LE
  let nullPos = slice.length;
  for (let i = 0; i + 1 < slice.length; i += 2) {
    if (slice[i] === 0 && slice[i + 1] === 0) {
      nullPos = i;
      break;
    }
  }

  return slice.subarray(0, nullPos).toString('utf16le');
}
