/**
 * Constantes del formato de guardado de Elden Ring (.sl2)
 *
 * Fuentes:
 *   - Ariescyn/EldenRing-Save-Manager (hexedit.py)
 *   - dsyer/jersc (SaveGame.java)
 *   - mi5hmash/SL2Bonfire (Bnd4Header.cs, CharacterSlot.cs)
 *
 * Offsets verificados cruzando las tres implementaciones.
 */

// ──────────────────────────────────────────────────────────────
// BND4 — Contenedor del archivo .sl2
// ──────────────────────────────────────────────────────────────

export const BND4 = {
  /** "BND4" en ASCII */
  MAGIC: 'BND4',

  /** Tamaño total de la cabecera BND4 */
  HEADER_SIZE: 0x40,

  /** Offsets dentro de la cabecera BND4 */
  FIELD: {
    FILE_COUNT:       0x0C,   // int32 — número de entradas
    SIGNATURE:        0x18,   // 8 bytes ASCII ("00000001" en ER)
    ENTRY_HEADER_SIZE: 0x20,  // int32 — bytes por entrada de directorio
    DATA_OFFSET:      0x28,   // int32 — offset al inicio de los datos
  },

  /** Offsets dentro de cada entrada de directorio */
  ENTRY: {
    DATA_OFFSET: 0x00,   // uint32 — offset absoluto al dato de la entrada
    DATA_SIZE:   0x08,   // uint32 — tamaño del dato
  },
} as const;

// ──────────────────────────────────────────────────────────────
// Slots de guardado de personaje
// ──────────────────────────────────────────────────────────────

export const SLOT = {
  /** Número de slots de personaje (no incluye el slot de sistema) */
  COUNT: 10,

  /** Tamaño de datos de cada slot (2 621 440 bytes) */
  DATA_SIZE: 0x280000,

  /**
   * Offset absoluto en el archivo al inicio del slot 0.
   * Calculado como: BND4_HEADER(0x40) + entries(11×0x20=0x160) + padding(0x110).
   * Verificado en múltiples implementaciones.
   */
  DATA_BASE: 0x310,

  /**
   * Stride entre slots (datos + 0x10 bytes de padding/checksum).
   * slot_n_offset = DATA_BASE + n × DATA_STRIDE
   */
  DATA_STRIDE: 0x280010,
} as const;

// ──────────────────────────────────────────────────────────────
// Resumen de personaje — sección de sistema (11ª entrada BND4)
//
// Esta sección contiene datos rápidos (nombre, nivel, estado activo)
// usados en el menú de selección de personaje.
// Está al final del archivo, tras los 10 slots de personaje.
// ──────────────────────────────────────────────────────────────

export const SUMMARY = {
  /**
   * Offset absoluto del array de estado activo.
   * Un byte por slot: 1 = activo, 0 = vacío.
   * summary_active[n] = file[ACTIVE_BASE + n]
   */
  ACTIVE_BASE: 0x1901D04,

  /**
   * Offset absoluto al inicio de las cabeceras de resumen de personaje.
   * summary_header[n] = file[HEADER_BASE + n × HEADER_STRIDE]
   */
  HEADER_BASE: 0x1901D0E,

  /** Bytes por cabecera de personaje */
  HEADER_STRIDE: 0x24C,

  /** Offsets dentro de cada cabecera de resumen (relativos a HEADER_BASE + n×STRIDE) */
  FIELD: {
    /** Nombre del personaje: UTF-16LE, 16 chars máximo (32 bytes) */
    NAME:       0x00,
    NAME_BYTES: 0x20,

    /** Nivel del personaje: uint16 */
    LEVEL:      0x22,

    /** Tiempo jugado en segundos: uint32 */
    PLAYTIME:   0x26,
  },
} as const;

// ──────────────────────────────────────────────────────────────
// Stats (atributos) del personaje — dentro del slot de datos
//
// Los stats NO están en un offset fijo documentado públicamente,
// por lo que se localizan mediante búsqueda de patrón.
// ──────────────────────────────────────────────────────────────

export const STATS = {
  /**
   * Invariante de Elden Ring:
   *   vigor + mind + endurance + strength + dexterity
   *   + intelligence + faith + arcane  =  level + 79
   *
   * Válido para todas las clases. Útil para validar el patrón.
   * Fuente: EldenRing-Save-Manager / hexedit.py
   */
  SUM_CONSTANT: 79,

  /** Cada stat ocupa 4 bytes (uint32 little-endian) */
  STRIDE: 4,

  /** Orden de los 8 atributos dentro del bloque de stats */
  ORDER: [
    'vigor', 'mind', 'endurance', 'strength',
    'dexterity', 'intelligence', 'faith', 'arcane',
  ] as const,

  /**
   * Offset del nivel dentro del bloque de stats (uint16).
   * Se usa para validación cruzada con el nivel del resumen.
   */
  LEVEL_CROSS_CHECK_OFFSET: 44,

  /** Rango válido de cada stat (game limit) */
  MIN: 1,
  MAX: 99,
} as const;
