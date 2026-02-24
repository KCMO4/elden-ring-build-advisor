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
  /** Efecto o descripción corta (principalmente para talismanes) */
  effect?: string;
}

export interface QuickSlotItem {
  rawId: number;
  baseId: number;
  name: string | null;
  image?: string;
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

// ── Advisor ─────────────────────────────────────────────────

export type ScalingGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | '-';

export interface WeaponScaling {
  str: ScalingGrade;
  dex: ScalingGrade;
  int: ScalingGrade;
  fai: ScalingGrade;
  arc: ScalingGrade;
}

export interface StatRequirements {
  str: number;
  dex: number;
  int: number;
  fai: number;
  arc: number;
}

export interface AdvisorWeapon {
  id: number;
  name: string;
  type: string;
  estimatedAR: number;
  scaling: WeaponScaling;
  requirements: StatRequirements;
  image?: string;
}

export interface WeaponRecommendation {
  weapon: AdvisorWeapon;
  estimatedAR: number;
  canEquip: boolean;
}

export interface AdvisorResponse {
  usable: WeaponRecommendation[];
  nearlyUsable: WeaponRecommendation[];
  wastedStats: string[];
}
