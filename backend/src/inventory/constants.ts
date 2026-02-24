/**
 * Constantes del módulo de inventario de Elden Ring (.sl2)
 *
 * Los offsets son relativos al inicio del slot data (los 0x280000 bytes
 * de cada personaje), NO al inicio del archivo .sl2.
 *
 * Fuentes:
 *   - Ariescyn/EldenRing-Save-Manager (hexedit.py)
 *   - mi5hmash/SL2Bonfire (CharacterSlot.cs)
 *   - Comunidad Elden Ring modding (FXR wiki, Smithbox)
 *
 * NOTA: Los offsets de equipo pueden necesitar calibración con
 * /api/debug si el juego ha sido actualizado. El campo NEEDS_CALIBRATION
 * indica si el offset es tentativo.
 */

// ── Ítems de equipo — slots dentro del slot data ────────────────────────────

/**
 * Offset base de la sección de equipo dentro del slot data.
 * A partir de aquí están los slots de armas, armaduras y talismanes.
 *
 * Cada slot ocupa 4 bytes (uint32 LE).
 * Un slot vacío contiene 0xFFFFFFFF o 0x00000000.
 */
export const EQUIPMENT = {
  /** Offset base de la sección de equipo dentro del slot data */
  BASE: 0x370,

  /** Slots de arma en mano derecha (×3) — offsets relativos a BASE */
  RIGHT_HAND_OFFSETS: [0x00, 0x04, 0x08] as const,

  /** Slots de arma en mano izquierda (×3) — offsets relativos a BASE */
  LEFT_HAND_OFFSETS:  [0x0C, 0x10, 0x14] as const,

  /** Slots de armadura — offsets relativos a BASE */
  ARMOR: {
    HEAD:  0x20,
    CHEST: 0x24,
    HANDS: 0x28,
    LEGS:  0x2C,
  },

  /** Slots de talismanes (×4) — offsets relativos a BASE */
  TALISMAN_OFFSETS: [0x40, 0x44, 0x48, 0x4C] as const,

  /**
   * true = offsets verificados con .sl2 real.
   * false = estimados de la comunidad, pueden necesitar calibración.
   *
   * NOTA: Estos offsets ya no se usan directamente. La lectura de equipo
   * usa ChrAsm2 = vigor_offset + 0x310 (calculado dinámicamente).
   */
  NEEDS_CALIBRATION: false,
} as const;

// ── Inventario — array de ítems ──────────────────────────────────────────────

/**
 * Cada entrada del array de inventario ocupa ITEM_ENTRY_SIZE bytes:
 *   [itemId: uint32 LE][flag: uint32 LE]
 *
 * Las entradas son pares de 8 bytes: el itemId codifica la categoría en el
 * nibble alto y el ID base en los 28 bits restantes. El segundo campo (flag)
 * vale 1 si el ítem está en posesión del personaje, 0 de lo contrario.
 */
export const INVENTORY = {
  /** Bytes por entrada de inventario */
  ITEM_ENTRY_SIZE: 8,

  /**
   * ID que marca una entrada vacía en el inventario.
   * 0xFFFFFFFF es el valor más común; también puede ser 0x00000000.
   */
  EMPTY_ITEM_ID: 0xFFFFFFFF,

  /**
   * Máximo número de ítems en el inventario del personaje.
   * Elden Ring permite hasta 3000 ítems.
   */
  MAX_ITEMS: 3000,

  /**
   * ID del "Tarnished's Wizened Finger" — ítem ancla siempre presente
   * en el inventario de todo personaje.
   * Se usa para localizar el inicio del array de inventario.
   * Valor en el .sl2: 0x4000006A (categoría 0x40 = consumible, base 0x6A = 106)
   */
  ANCHOR_ITEM_ID: 0x4000006A,

  /**
   * Radio de búsqueda del ancla (en bytes) desde el inicio del slot data.
   * El inventario suele estar en los primeros 500 KB del slot data.
   */
  SEARCH_WINDOW: 0x80000,
} as const;

// ── Inventory Held — cantidades reales de ítems ─────────────────────────────

/**
 * La sección "inventory_held" almacena las cantidades reales de cada ítem.
 * Cada entrada tiene 12 bytes: [gaitem_handle: u32, quantity: u32, acquisition_index: u32]
 *
 * Fuente: ClayAmore/ER-Save-Lib (Rust) — InventoryHeld struct.
 *
 * Offset desde vigor_offset:
 *   ChrAsm2 está a vigor + 0x310, mide 0x60 bytes (24 × u32).
 *   inventory_held empieza inmediatamente después: ChrAsm2 + 0x60 = vigor + 0x370.
 *   El primer u32 es common_item_count, seguido de common_items[2688] × 12 bytes,
 *   luego key_item_count (u32), key_items[384] × 12 bytes.
 *
 * Verificado empíricamente con save real (Zhyak, slot 2, nivel 68):
 *   vigor=0xaad0, held=0xae40, count=537, key_count=76.
 */
export const INVENTORY_HELD = {
  /** Offset desde vigor_offset hasta el inicio de inventory_held (ChrAsm2 + 0x60) */
  VIGOR_TO_HELD_OFFSET: 0x370,
  /** Capacidad de common items (held inventory) */
  COMMON_CAPACITY: 2688,   // 0xA80
  /** Capacidad de key items (held inventory) */
  KEY_CAPACITY: 384,        // 0x180
  /** Bytes por entrada (gaitem_handle + quantity + acquisition_index) */
  ENTRY_SIZE: 12,
} as const;

// ── Decodificación de IDs de ítems ──────────────────────────────────────────

/**
 * Los 4 bits más significativos del itemId indican la categoría del ítem.
 * El resto (28 bits) es el ID base del ítem dentro de su categoría.
 *
 * Rangos documentados por la comunidad (Elden Ring 1.10+):
 */
export const ITEM_CATEGORY = {
  /** Máscara para extraer los bits de categoría (nibble alto del byte alto) */
  TYPE_MASK:    0xF0000000,
  /** Máscara para extraer el ID base del ítem */
  BASE_ID_MASK: 0x0FFFFFFF,

  /** Armas (espadas, arcos, bastones, sellos...) */
  WEAPON:    0x00000000,
  /** Protecciones (yelmo, peto, guantes, grebas) */
  ARMOR:     0x10000000,
  /** Accesorios y talismanes */
  TALISMAN:  0x20000000,
  /** Gestos */
  GESTURE:   0x30000000,
  /** Consumibles, materiales y objetos varios */
  CONSUMABLE: 0x40000000,
  /** Hechizos (sorceries e incantations) */
  SPELL:     0x80000000,
} as const;
