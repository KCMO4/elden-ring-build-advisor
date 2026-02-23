import { BND4 } from './constants';
import type { Bnd4Info } from './types';

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

/**
 * Valida el magic "BND4" y devuelve información básica de la cabecera.
 * No asume endianness: Elden Ring PC usa little-endian.
 */
export function parseBnd4Header(buf: Buffer): Bnd4Info {
  if (buf.length < BND4.HEADER_SIZE) {
    throw new ParseError(
      `Archivo demasiado pequeño: ${buf.length} bytes (mínimo ${BND4.HEADER_SIZE})`,
    );
  }

  const magic = buf.toString('ascii', 0, 4);
  if (magic !== BND4.MAGIC) {
    throw new ParseError(
      `Magic inválido: se esperaba "BND4", se encontró "${magic}"`,
    );
  }

  const fileCount       = buf.readUInt32LE(BND4.FIELD.FILE_COUNT);
  const entryHeaderSize = buf.readUInt32LE(BND4.FIELD.ENTRY_HEADER_SIZE);
  const version         = buf
    .subarray(BND4.FIELD.SIGNATURE, BND4.FIELD.SIGNATURE + 8)
    .toString('ascii')
    .replace(/\0/g, '');

  return { magic, fileCount, version, entryHeaderSize };
}

/**
 * Devuelve el offset absoluto (en el archivo) donde comienzan los datos
 * de una entrada BND4 dada su posición en el directorio.
 *
 * Estructura de cada entrada de directorio:
 *   0x00: uint32 dataOffset  ← offset absoluto al dato
 *   0x08: uint32 dataSize
 */
export function getEntryDataOffset(buf: Buffer, entryIndex: number, entryHeaderSize: number): number {
  const entryBase = BND4.HEADER_SIZE + entryIndex * entryHeaderSize;
  if (entryBase + entryHeaderSize > buf.length) {
    throw new ParseError(`Entrada ${entryIndex} está fuera del rango del buffer`);
  }
  return buf.readUInt32LE(entryBase + BND4.ENTRY.DATA_OFFSET);
}
