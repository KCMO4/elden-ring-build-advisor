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
  damage?:  DamageStats;
  scaling?: { str: string; dex: string; int: string; fai: string; arc: string };
  weight?:  number;
  defense?: DefenseStats;
}

export interface EquippedItems {
  rightHand: [EquippedWeapon, EquippedWeapon, EquippedWeapon];
  leftHand:  [EquippedWeapon, EquippedWeapon, EquippedWeapon];
  head:   EquippedWeapon;
  chest:  EquippedWeapon;
  hands:  EquippedWeapon;
  legs:   EquippedWeapon;
  talismans: [EquippedWeapon, EquippedWeapon, EquippedWeapon, EquippedWeapon];
}

export interface ResolvedInventoryItem {
  itemId: number;
  uid: number;
  quantity: number;
  category: string;
  baseId: number;
  name: string;
  image?: string;
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
