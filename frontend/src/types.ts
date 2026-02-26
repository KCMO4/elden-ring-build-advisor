// ──────────────────────────────────────────────────────────────
// Tipos espejo de las respuestas del backend
// ──────────────────────────────────────────────────────────────

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

export interface DamageStats {
  physical:  number;
  magic:     number;
  fire:      number;
  lightning: number;
  holy:      number;
}

export interface DefenseStats {
  physical:  number;
  strike:    number;
  slash:     number;
  pierce:    number;
  magic:     number;
  fire:      number;
  lightning: number;
  holy:      number;
}

export interface EquippedWeapon {
  rawId: number;
  baseId: number;
  name: string | null;
  upgradeLevel?: number;
  image?: string;
  /** Infusión del arma (Heavy, Keen, Fire, etc.). undefined = Standard */
  infusion?: string;
  damage?:  DamageStats;
  scaling?: { str: string; dex: string; int: string; fai: string; arc: string };
  weight?:  number;
  defense?: DefenseStats;
  /** Poise de la armadura */
  poise?: number;
  /** Resistencias de la armadura */
  immunity?:   number;
  robustness?: number;
  focus?:      number;
  vitality?:   number;
  /** Estabilidad (Guard Boost) — escudos */
  stability?: number;
  /** Guarded Damage Negation — weapons and shields */
  guardNegation?: { physical: number; magic: number; fire: number; lightning: number; holy: number; boost?: number };
  /** Critical hit multiplier (default 100, daggers higher) */
  critical?: number;
  /** Physical damage types (Standard, Strike, Slash, Pierce) */
  damageTypes?: string[];
  /** Nombre de la habilidad (Ash of War skill) — armas */
  skill?: string;
  /** FP cost of the weapon's skill [tap] or [tap, hold] */
  skillFpCost?: number[];
  /** Efecto o descripción corta (principalmente para talismanes) */
  effect?: string;
  /** Cantidad (cargas de flask, etc.). undefined = 1 */
  quantity?: number;
  /** Stat requirements — armas */
  requirements?: StatRequirements;
  /** Passive effects (blood, frost, poison, etc.) — armas */
  passives?: Array<{ type: string; buildup: number }>;
  /** Tipo de ítem (weapon type, armor type, shield category) */
  itemType?: string;
}

export interface QuickSlotItem {
  rawId: number;
  baseId: number;
  name: string | null;
  image?: string;
  quantity?: number;
  /** Tipo de hechizo (solo para spells en memory slots) */
  spellType?: 'sorcery' | 'incantation';
  /** FP cost to cast (solo para spells) */
  cost?: number;
  /** Memory slots required (solo para spells) */
  slots?: number;
  /** In-game description */
  description?: string;
  /** Stat requirements */
  requirements?: { str: number; dex: number; int: number; fai: number; arc: number };
  /** Efecto del ítem (consumibles, etc.) */
  effect?: string;
}

export interface EquippedItems {
  rightHand: [EquippedWeapon, EquippedWeapon, EquippedWeapon];
  leftHand:  [EquippedWeapon, EquippedWeapon, EquippedWeapon];
  head:   EquippedWeapon;
  chest:  EquippedWeapon;
  hands:  EquippedWeapon;
  legs:   EquippedWeapon;
  talismans: [EquippedWeapon, EquippedWeapon, EquippedWeapon, EquippedWeapon];
  quickItems: QuickSlotItem[];
  pouch: QuickSlotItem[];
  greatRune: QuickSlotItem | null;
  /** Crystal Tears equipped in the Flask of Wondrous Physick */
  physickTears?: QuickSlotItem[];
  /** Attuned spells in memory slots */
  spellSlots?: QuickSlotItem[];
  /** Total memory slot count = 2 (base) + Memory Stones */
  memorySlotCount?: number;
}

export interface ResolvedInventoryItem {
  itemId: number;
  uid: number;
  quantity: number;
  category: string;
  baseId: number;
  name: string;
  image?: string;
  /** Nivel de mejora del arma (+0 a +25). undefined si no aplica. */
  upgradeLevel?: number;
  /** Infusión del arma (Heavy, Keen, Fire, etc.). undefined = Standard */
  infusion?: string;
  /** Tipo de ítem (weapon type, armor type, spell type) */
  itemType?: string;
  /** Daño base — para armas */
  damage?: DamageStats;
  /** Escalado — para armas */
  scaling?: { str: string; dex: string; int: string; fai: string; arc: string };
  /** Negación de daño — para armaduras */
  defense?: DefenseStats;
  /** Peso — armas, armaduras, escudos */
  weight?: number;
  /** Estabilidad (Guard Boost) — escudos */
  stability?: number;
  /** Critical hit multiplier — weapons (default 100, daggers higher) */
  critical?: number;
  /** Physical damage types (Standard, Strike, Slash, Pierce) */
  damageTypes?: string[];
  /** FP cost of the weapon's skill [tap] or [tap, hold] */
  skillFpCost?: number[];
  /** Guarded Damage Negation — weapons and shields */
  guardNegation?: { physical: number; magic: number; fire: number; lightning: number; holy: number; boost?: number };
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
  /** Stat requirements (weapons, spells) */
  requirements?: StatRequirements;
  /** Passive effects (blood, frost, poison, etc.) — weapons */
  passives?: Array<{ type: string; buildup: number }>;
  /** Poise — armaduras (inventario) */
  poise?: number;
  /** Resistencias — armaduras (inventario) */
  immunity?:   number;
  robustness?: number;
  focus?:      number;
  vitality?:   number;
  /** FP cost to cast — spells */
  cost?: number;
  /** Memory slots required — spells */
  slots?: number;
  /** In-game description — spells */
  description?: string;
}

export interface Inventory {
  weapons:      ResolvedInventoryItem[];
  ammos:        ResolvedInventoryItem[];
  armors:       ResolvedInventoryItem[];
  talismans:    ResolvedInventoryItem[];
  spells:       ResolvedInventoryItem[];
  spirits:      ResolvedInventoryItem[];
  ashesOfWar:   ResolvedInventoryItem[];
  consumables:  ResolvedInventoryItem[];
  materials:    ResolvedInventoryItem[];
  upgrades:     ResolvedInventoryItem[];
  crystalTears: ResolvedInventoryItem[];
  keyItems:     ResolvedInventoryItem[];
  cookbooks:    ResolvedInventoryItem[];
  multiplayer:  ResolvedInventoryItem[];
}

export interface CharacterData {
  slot: number;
  name: string;
  level: number;
  playtime: string;
  /** Runas actualmente en posesión (souls equivalent) */
  heldRunes: number;
  stats: CharacterStats;
  equipped: EquippedItems;
  inventory: Inventory;
}

export interface ParseResponse {
  characters: CharacterData[];
}

// ── Shared types ────────────────────────────────────────────

export type ScalingGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | '-';

export interface StatRequirements {
  str: number;
  dex: number;
  int: number;
  fai: number;
  arc: number;
}
