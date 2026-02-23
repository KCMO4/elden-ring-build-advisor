// ──────────────────────────────────────────────────────────────
// Tipos públicos del parser de Elden Ring .sl2
// ──────────────────────────────────────────────────────────────

export interface ParsedSave {
  /** Tamaño total del archivo en bytes */
  fileSize: number;
  /** Slots con información rápida (nombre, nivel, activo) */
  slots: CharacterSlot[];
}

export interface CharacterSlot {
  /** Índice 0-9 */
  index: number;
  /** true si el slot tiene un personaje */
  active: boolean;
  character?: CharacterData;
}

export interface CharacterData {
  name: string;
  level: number;
  /** Tiempo jugado en segundos */
  playtimeSeconds: number;
  /** Atributos del personaje */
  stats: CharacterStats;
}

export interface CharacterStats {
  vigor: number;
  mind: number;
  endurance: number;
  strength: number;
  dexterity: number;
  intelligence: number;
  faith: number;
  arcane: number;
}

export interface Bnd4Info {
  magic: string;
  fileCount: number;
  /** Versión del archivo (campo ASCII de 8 bytes) */
  version: string;
  /** Tamaño de cada entrada de directorio en bytes */
  entryHeaderSize: number;
}
