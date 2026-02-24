// ──────────────────────────────────────────────────────────────
// Tipos del módulo de inventario de Elden Ring
// ──────────────────────────────────────────────────────────────

/**
 * Categoría de un ítem según su ID en el .sl2.
 *
 * Nibble alto del itemId:
 *   0x0 = weapon (EquipParamWeapon + flechas/ballestas en rango 50M+)
 *   0x1 = armor  (EquipParamProtector)
 *   0x2 = talisman (EquipParamAccessory)
 *   0x4 = consumable (EquipParamGoods — incluye hechizos, espíritus, materiales, etc.)
 *   0x8 = ash_of_war (EquipParamGem — Cenizas de Guerra)
 */
export type ItemCategory =
  | 'weapon'
  | 'ammo'         // Flechas y ballestas (nibble 0x0, base ID 50M+)
  | 'armor'
  | 'talisman'
  | 'spell'        // Hechizos desde nibble 0x4 (IDs 4000-7999)
  | 'spirit'       // Spirit Ashes (nibble 0x4, IDs 200000-299999)
  | 'ash_of_war'   // Cenizas de guerra (nibble 0x8, EquipParamGem)
  | 'consumable'   // Flasks, boluses, grease, throwables, misc
  | 'material'     // Materiales de crafteo (animal parts, plantas, etc.)
  | 'upgrade'      // Smithing Stones, Somber Stones, Glovewort
  | 'crystal_tear' // Lágrimas del Flask of Wondrous Physick
  | 'key_item'     // Ítems clave, mapas, notas, llaves, Bell Bearings
  | 'cookbook'     // Recetas de crafteo (Nomadic Warrior's Cookbook, etc.)
  | 'multiplayer'  // Ítems multijugador (Fingers, Rings, Effigies, etc.)
  | 'gesture'      // Gestos
  | 'unknown';

/** Ítem crudo tal como aparece en el slot data del .sl2 */
export interface RawInventoryItem {
  /** ID del ítem en el formato del .sl2 */
  itemId: number;
  /** Unique ID de la instancia del ítem */
  uid: number;
  /** Cantidad (1 para armas/armaduras equipables, >1 para consumibles) */
  quantity: number;
  /** Categoría decodificada del ID */
  category: ItemCategory;
  /** ID base del ítem (sin el byte de tipo) */
  baseId: number;
}

/** Ítem del inventario con nombre resuelto de la base de datos */
export interface ResolvedInventoryItem extends RawInventoryItem {
  name: string;
  image?: string;
  /** Nivel de mejora del arma (+0 a +25 / +10 para únicas). undefined si no aplica. */
  upgradeLevel?: number;
  /** Tipo de ítem (weapon type, armor type, spell type, shield category) */
  itemType?: string;
  /** Daño base — para armas */
  damage?: { physical: number; magic: number; fire: number; lightning: number; holy: number };
  /** Escalado — para armas */
  scaling?: { str: string; dex: string; int: string; fai: string; arc: string };
  /** Negación de daño — para armaduras */
  defense?: { physical: number; strike: number; slash: number; pierce: number; magic: number; fire: number; lightning: number; holy: number };
  /** Peso — armas, armaduras, escudos */
  weight?: number;
  /** Estabilidad (Guard Boost) — escudos */
  stability?: number;
  /** Efecto o descripción corta — talismanes, consumibles, espíritus */
  effect?: string;
  /** Afinidad — cenizas de guerra */
  affinity?: string;
  /** Nombre de la habilidad — cenizas de guerra */
  skill?: string;
  /** Coste de FP — espíritus invocables */
  fpCost?: number;
  /** Coste de HP — espíritus invocables */
  hpCost?: number;
}

/** Arma equipada en un slot de mano */
export interface EquippedWeapon {
  /** ID crudo del .sl2 (gaitem_handle o 0xFFFFFFFF = vacío) */
  rawId: number;
  /** ID base del arma/armadura/talismán */
  baseId: number;
  /** Nombre del ítem o null si no se encontró en la base de datos */
  name: string | null;
  /** Nivel de mejora del arma (+0 a +25 / +10 para únicas). undefined si no aplica. */
  upgradeLevel?: number;
  /** URL de la imagen del ítem (fanapis.com) */
  image?: string;
  /** Infusión del arma (Heavy, Keen, Fire, etc.). undefined = Standard */
  infusion?: string;
  /** Daño base del arma (solo para weapons) */
  damage?: { physical: number; magic: number; fire: number; lightning: number; holy: number };
  /** Escalado del arma (solo para weapons) */
  scaling?: { str: string; dex: string; int: string; fai: string; arc: string };
  /** Peso del ítem */
  weight?: number;
  /** Defensa de la armadura (solo para armors) */
  defense?: { physical: number; strike: number; slash: number; pierce: number; magic: number; fire: number; lightning: number; holy: number };
  /** Poise de la armadura */
  poise?: number;
  /** Resistencias de la armadura */
  immunity?:   number;
  robustness?: number;
  focus?:      number;
  vitality?:   number;
  /** Estabilidad (Guard Boost) — escudos */
  stability?: number;
  /** Nombre de la habilidad (Ash of War skill) — armas */
  skill?: string;
  /** Efecto o descripción corta (principalmente para talismanes) */
  effect?: string;
}

/** Ítem en un quick slot o pouch */
export interface QuickSlotItem {
  /** ID crudo del .sl2 (inventory ID con nibble de categoría, 0xFFFFFFFF = vacío) */
  rawId: number;
  /** ID base del ítem (sin nibble de categoría) */
  baseId: number;
  /** Nombre del ítem o null si no se encontró */
  name: string | null;
  /** URL de la imagen del ítem */
  image?: string;
  /** Cantidad (cargas de flask, etc.). undefined = 1 */
  quantity?: number;
}

/** Ítems equipados en el personaje */
export interface EquippedItems {
  rightHand: [EquippedWeapon, EquippedWeapon, EquippedWeapon];
  leftHand:  [EquippedWeapon, EquippedWeapon, EquippedWeapon];
  head:   EquippedWeapon;
  chest:  EquippedWeapon;
  hands:  EquippedWeapon;
  legs:   EquippedWeapon;
  talismans: [EquippedWeapon, EquippedWeapon, EquippedWeapon, EquippedWeapon];
  /** Quick item slots (10 slots: flasks, consumables, etc.) */
  quickItems: QuickSlotItem[];
  /** Pouch items (6 slots: spirit ashes, torrent whistle, etc.) */
  pouch: QuickSlotItem[];
  /** Equipped Great Rune (null = none equipped) */
  greatRune: QuickSlotItem | null;
  /** Crystal Tears equipped in the Flask of Wondrous Physick */
  physickTears: QuickSlotItem[];
  /** Attuned spells in memory slots (empty if none equipped) */
  spellSlots: QuickSlotItem[];
  /** Total memory slot count = 2 (base) + Memory Stones in inventory */
  memorySlotCount: number;
}

/** Inventario completo categorizado */
export interface Inventory {
  weapons:      ResolvedInventoryItem[];
  ammos:        ResolvedInventoryItem[];   // Flechas y ballestas
  armors:       ResolvedInventoryItem[];
  talismans:    ResolvedInventoryItem[];
  spells:       ResolvedInventoryItem[];   // Hechizos (desde nibble 0x4)
  spirits:      ResolvedInventoryItem[];   // Spirit Ashes
  ashesOfWar:   ResolvedInventoryItem[];   // Cenizas de guerra (nibble 0x8, TBD)
  consumables:  ResolvedInventoryItem[];   // Flasks, boluses, comidas, etc.
  materials:    ResolvedInventoryItem[];   // Materiales de crafteo
  upgrades:     ResolvedInventoryItem[];   // Piedras de mejora, glovewort
  crystalTears: ResolvedInventoryItem[];   // Lágrimas para Flask
  keyItems:     ResolvedInventoryItem[];   // Ítems clave, mapas, notas
  cookbooks:    ResolvedInventoryItem[];   // Recetas de crafteo
  multiplayer:  ResolvedInventoryItem[];   // Ítems multijugador
  /** Ítems sin categoría conocida */
  other:        RawInventoryItem[];
}

/** Resultado completo del escaneo de un slot */
export interface InventoryScanResult {
  equipped: EquippedItems;
  inventory: Inventory;
}
