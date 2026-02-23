/**
 * Tests del parser de Elden Ring .sl2
 *
 * Usa un buffer sintético que imita la estructura BND4 + sección de sistema
 * para verificar la lógica de lectura sin necesitar un .sl2 real.
 */

import { parseSl2, ParseError, hexDump, summaryOffsetsForSlot } from '../index';
import { SLOT, SUMMARY, BND4 as BND4_CONST } from '../constants';
import { parseBnd4Header } from '../bnd4';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Tamaño mínimo de archivo para que los offsets de resumen sean válidos */
const MIN_VALID_SIZE = SUMMARY.ACTIVE_BASE + SLOT.COUNT + SUMMARY.HEADER_STRIDE;

/** Construye un buffer BND4 mínimo válido con `fileCount` entradas */
function makeBnd4Header(fileCount = 11): Buffer {
  const buf = Buffer.alloc(BND4_CONST.HEADER_SIZE, 0);
  buf.write('BND4', 0, 'ascii');
  buf.writeUInt32LE(fileCount, BND4_CONST.FIELD.FILE_COUNT);
  buf.writeUInt32LE(0x20, BND4_CONST.FIELD.ENTRY_HEADER_SIZE); // 32 bytes/entry
  return buf;
}

/** Escribe un nombre UTF-16LE en un buffer en el offset dado */
function writeUtf16(buf: Buffer, offset: number, name: string): void {
  const encoded = Buffer.from(name, 'utf16le');
  encoded.copy(buf, offset);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('parseBnd4Header', () => {
  test('acepta un magic BND4 válido', () => {
    const buf = makeBnd4Header();
    const info = parseBnd4Header(buf);
    expect(info.magic).toBe('BND4');
    expect(info.fileCount).toBe(11);
  });

  test('lanza ParseError si el magic es incorrecto', () => {
    const buf = Buffer.alloc(64, 0);
    buf.write('ABCD', 0, 'ascii');
    expect(() => parseBnd4Header(buf)).toThrow(ParseError);
  });

  test('lanza ParseError si el buffer es demasiado pequeño', () => {
    const buf = Buffer.alloc(10, 0);
    expect(() => parseBnd4Header(buf)).toThrow(ParseError);
  });
});

describe('summaryOffsetsForSlot', () => {
  test('slot 0 devuelve el offset de nombre correcto', () => {
    const offsets = summaryOffsetsForSlot(0);
    expect(offsets['nameStart']).toBe(SUMMARY.HEADER_BASE + SUMMARY.FIELD.NAME);
    expect(offsets['activeStatus']).toBe(SUMMARY.ACTIVE_BASE);
  });

  test('slot 1 está desplazado por HEADER_STRIDE', () => {
    const offsets0 = summaryOffsetsForSlot(0);
    const offsets1 = summaryOffsetsForSlot(1);
    expect(offsets1['nameStart'] - offsets0['nameStart']).toBe(SUMMARY.HEADER_STRIDE);
  });
});

describe('hexDump', () => {
  test('produce líneas formateadas', () => {
    const buf = Buffer.from([0x42, 0x4e, 0x44, 0x34]); // "BND4"
    const dump = hexDump(buf, 0, 4, 'Test');
    expect(dump).toContain('42 4e 44 34');
    expect(dump).toContain('BND4');
  });
});

describe('parseSl2 — buffer inválido', () => {
  test('lanza ParseError con buffer vacío', () => {
    expect(() => parseSl2(Buffer.alloc(0))).toThrow(ParseError);
  });

  test('lanza ParseError si el magic no es BND4', () => {
    const buf = Buffer.alloc(1024, 0);
    buf.write('XXXX', 0, 'ascii');
    expect(() => parseSl2(buf)).toThrow(ParseError);
  });

  test('devuelve 10 slots inactivos con buffer mínimo válido', () => {
    // Buffer grande con BND4 válido pero sin datos reales
    const buf = Buffer.alloc(MIN_VALID_SIZE + 0x100, 0);
    makeBnd4Header().copy(buf, 0);

    const result = parseSl2(buf);
    expect(result.slots).toHaveLength(SLOT.COUNT);
    expect(result.slots.every(s => !s.active)).toBe(true);
  });
});

describe('parseSl2 — slot activo sintético', () => {
  test('extrae nombre y nivel de un slot activo', () => {
    const buf = Buffer.alloc(MIN_VALID_SIZE + 0x100, 0);
    makeBnd4Header().copy(buf, 0);

    // Activar slot 0
    buf.writeUInt8(1, SUMMARY.ACTIVE_BASE + 0);

    // Escribir nombre "Tarnished" en UTF-16LE
    const headerBase = SUMMARY.HEADER_BASE + 0 * SUMMARY.HEADER_STRIDE;
    writeUtf16(buf, headerBase + SUMMARY.FIELD.NAME, 'Tarnished');

    // Escribir nivel 50
    buf.writeUInt16LE(50, headerBase + SUMMARY.FIELD.LEVEL);

    // Escribir playtime (1h = 3600s)
    buf.writeUInt32LE(3600, headerBase + SUMMARY.FIELD.PLAYTIME);

    const result = parseSl2(buf);
    const slot0 = result.slots[0];

    expect(slot0.active).toBe(true);
    expect(slot0.character!.name).toBe('Tarnished');
    expect(slot0.character!.level).toBe(50);
    expect(slot0.character!.playtimeSeconds).toBe(3600);
  });
});
