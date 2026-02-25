// ──────────────────────────────────────────────────────────────
// Tipos del módulo de ítems de Elden Ring
// ──────────────────────────────────────────────────────────────

export type WeaponType =
  | 'Dagger' | 'Straight Sword' | 'Greatsword' | 'Colossal Sword'
  | 'Thrusting Sword' | 'Heavy Thrusting Sword' | 'Curved Sword' | 'Curved Greatsword'
  | 'Katana' | 'Twinblade' | 'Hammer' | 'Great Hammer' | 'Flail' | 'Axe' | 'Greataxe'
  | 'Lance' | 'Great Spear' | 'Halberd' | 'Scythe' | 'Whip' | 'Fist' | 'Claw'
  | 'Light Bow' | 'Bow' | 'Greatbow' | 'Crossbow' | 'Ballista'
  | 'Small Shield' | 'Medium Shield' | 'Greatshield'
  | 'Glintstone Staff' | 'Sacred Seal'
  | 'Colossal Weapon' | 'Spear' | 'Other';

export type ArmorType = 'Helm' | 'Chest Armor' | 'Gauntlets' | 'Leg Armor';

export type ScalingGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | '-';

export interface StatRequirements {
  str: number;
  dex: number;
  int: number;
  fai: number;
  arc: number;
}

export interface WeaponScaling {
  str: ScalingGrade;
  dex: ScalingGrade;
  int: ScalingGrade;
  fai: ScalingGrade;
  arc: ScalingGrade;
}

export interface DamageStats {
  physical: number;
  magic: number;
  fire: number;
  lightning: number;
  holy: number;
}

export interface PassiveEffect {
  type: 'blood' | 'frost' | 'poison' | 'rot' | 'death' | 'sleep' | 'madness';
  buildup: number;
}

export interface Defense {
  physical:  number;
  strike:    number;
  slash:     number;
  pierce:    number;
  magic:     number;
  fire:      number;
  lightning: number;
  holy:      number;
}

export interface GuardNegation {
  physical:  number;
  magic:     number;
  fire:      number;
  lightning: number;
  holy:      number;
  boost?:    number;  // Guard Boost (weapons); shields use stability separately
}

export interface Weapon {
  /** ID interno del juego (para match con .sl2) */
  id: number;
  name: string;
  type: WeaponType;
  weight: number;
  requirements: StatRequirements;
  /** Escalado con el arma en su nivel máximo de mejora */
  scaling: WeaponScaling;
  /** Daño base (arma sin mejorar, +0) */
  damage: DamageStats;
  /** Critical hit multiplier (default 100, daggers higher) */
  critical?: number;
  /** Physical damage types (Standard, Strike, Slash, Pierce) */
  damageTypes?: string[];
  /** Guarded Damage Negation (blocking stats) */
  guardNegation?: GuardNegation;
  passives: PassiveEffect[];
  image?: string;
}

export interface Armor {
  id: number;
  name: string;
  type: ArmorType;
  weight: number;
  /** Poise (resistencia a interrupciones). 0 si no disponible. */
  poise: number;
  immunity?:   number;
  robustness?: number;
  focus?:      number;
  vitality?:   number;
  defense: Defense;
  image?: string;
}

export interface Talisman {
  id: number;
  name: string;
  effect: string;
  /** Weight of the talisman */
  weight?: number;
  image?: string;
}

export interface Spell {
  id: number;
  name: string;
  type: 'sorcery' | 'incantation';
  requirements: StatRequirements;
  /** FP cost to cast */
  cost?: number;
  /** Memory slots required */
  slots?: number;
  /** In-game description */
  description?: string;
  image?: string;
}

export interface Shield {
  /** ID de fanapis (string, no hay ID numérico de juego disponible) */
  id: string;
  name: string;
  category: 'Small Shield' | 'Medium Shield' | 'Greatshield';
  weight: number;
  /** Daño de ataque físico base */
  physicalAttack: number;
  /** Daño base (5 tipos elementales) */
  damage?: DamageStats;
  /** Escalado del escudo */
  scaling?: WeaponScaling;
  /** Requisitos de stats para equipar */
  requirements?: StatRequirements;
  /** Critical hit multiplier (default 100) */
  critical?: number;
  /** Physical damage types (Standard, Strike, Slash, Pierce) */
  damageTypes?: string[];
  /** Reducción física (Guard Boost) */
  stability: number;
  /** Guarded Damage Negation (5 elemental types) */
  guardNegation?: GuardNegation;
  /** Passive effects (e.g. Shield of the Guilty = blood loss) */
  passives?: PassiveEffect[];
  image?: string;
}

export interface Ash {
  /** ID de fanapis */
  id: string;
  name: string;
  affinity: string;
  skill: string;
  /** FP cost [tap] or [tap, hold] */
  fpCost?: number[];
  image?: string;
}

export interface Spirit {
  /** ID de fanapis */
  id: string;
  name: string;
  fpCost: number;
  hpCost: number;
  effect: string;
  image?: string;
}

export interface Consumable {
  /** ID de fanapis */
  id: string;
  name: string;
  type: string;
  effect: string;
  image?: string;
}

// ── Filtros para consultas ───────────────────────────────────

export interface WeaponFilter {
  type?: WeaponType;
  /** Si true, solo devuelve armas que el personaje puede equipar */
  canUse?: boolean;
  stats?: CharacterStatsForFilter;
}

export interface CharacterStatsForFilter {
  vigor?: number;
  mind?: number;
  endurance?: number;
  strength: number;
  dexterity: number;
  intelligence: number;
  faith: number;
  arcane: number;
}
