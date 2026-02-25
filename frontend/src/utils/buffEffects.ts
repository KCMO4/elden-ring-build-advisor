/**
 * Common buff effects for the damage calculator.
 *
 * These are user-selectable (not from the save file) — the player activates
 * them in-game via incantations, consumables, or weapon skills.
 *
 * Buffs in the same stackGroup do NOT stack (only the strongest applies).
 * Buffs in different groups stack multiplicatively.
 *
 * Stack groups mirror the actual game:
 *   body-buff: Golden Vow, Howl of Shabriri, Exalted Flesh (aura/body buffs)
 *   protection: Black Flame's Protection (phys), Barrier of Gold (magic),
 *               Lord's Divine Fortification (holy) — these DON'T conflict with body-buff
 *   fortification: Magic/Lightning/Divine Fortification (element-specific, lower tier)
 */

export interface BuffEffect {
  id: string;
  name: string;
  category: 'incantation' | 'consumable' | 'skill';
  allDmgBonus?: number;
  physDmgBonus?: number;
  fireDmgBonus?: number;
  magicDmgBonus?: number;
  lightningDmgBonus?: number;
  holyDmgBonus?: number;
  /** Element-specific negation bonuses (fractions, e.g. 0.35 = +35%) */
  physNegBonus?: number;
  magicNegBonus?: number;
  fireNegBonus?: number;
  lightningNegBonus?: number;
  holyNegBonus?: number;
  /** All negation bonus (only for buffs that truly affect ALL types) */
  allNegBonus?: number;
  physNegPenalty?: number;
  duration: string;
  stackGroup?: string;
}

export const BUFF_LIST: BuffEffect[] = [
  // ── Incantations ──
  {
    id: 'golden-vow',
    name: 'Golden Vow',
    category: 'incantation',
    allDmgBonus: 0.15,
    allNegBonus: 0.10,
    duration: '80s',
    stackGroup: 'body-buff',
  },
  {
    id: 'flame-grant-me-strength',
    name: 'Flame, Grant Me Strength',
    category: 'incantation',
    physDmgBonus: 0.20,
    fireDmgBonus: 0.20,
    duration: '30s',
    stackGroup: 'fgms',
  },
  {
    id: 'howl-of-shabriri',
    name: 'Howl of Shabriri',
    category: 'incantation',
    allDmgBonus: 0.25,
    allNegBonus: -0.10,
    duration: '40s',
    stackGroup: 'body-buff',
  },

  // ── Skills / Weapon Arts ──
  {
    id: 'commanders-standard',
    name: "Commander's Standard",
    category: 'skill',
    allDmgBonus: 0.20,
    duration: '30s',
    stackGroup: 'rally',
  },
  {
    id: 'rallying-standard',
    name: 'Rallying Standard',
    category: 'skill',
    allDmgBonus: 0.20,
    allNegBonus: 0.20,
    duration: '30s',
    stackGroup: 'rally',
  },
  {
    id: 'contagious-fury',
    name: 'Contagious Fury',
    category: 'skill',
    allDmgBonus: 0.20,
    duration: '30s',
    stackGroup: 'contagious',
  },

  // ── Consumables ──
  {
    id: 'exalted-flesh',
    name: 'Exalted Flesh',
    category: 'consumable',
    physDmgBonus: 0.20,
    duration: '60s',
    stackGroup: 'body-buff',
  },
  {
    id: 'bloodboil-aromatic',
    name: 'Bloodboil Aromatic',
    category: 'consumable',
    physDmgBonus: 0.30,
    physNegPenalty: -0.30,
    duration: '60s',
    stackGroup: 'aromatic',
  },
  {
    id: 'uplifting-aromatic',
    name: 'Uplifting Aromatic',
    category: 'consumable',
    allDmgBonus: 0.10,
    duration: '60s',
    stackGroup: 'aromatic',
  },
  {
    id: 'ironjar-aromatic',
    name: 'Ironjar Aromatic',
    category: 'consumable',
    physNegBonus: 0.40,
    duration: '60s',
    stackGroup: 'aromatic',
  },

  // ── Protection Incantations (element-specific, separate from body-buff) ──
  {
    id: 'black-flames-protection',
    name: "Black Flame's Protection",
    category: 'incantation',
    physNegBonus: 0.35,
    duration: '70s',
    stackGroup: 'protection',
  },
  {
    id: 'barrier-of-gold',
    name: 'Barrier of Gold',
    category: 'incantation',
    magicNegBonus: 0.60,
    duration: '70s',
    stackGroup: 'protection',
  },
  {
    id: 'lords-divine-fortification',
    name: "Lord's Divine Fortification",
    category: 'incantation',
    holyNegBonus: 0.60,
    duration: '70s',
    stackGroup: 'protection',
  },

  // ── Physical Defense Consumables ──
  {
    id: 'boiled-crab',
    name: 'Boiled Crab',
    category: 'consumable',
    physNegBonus: 0.20,
    duration: '60s',
    stackGroup: 'boiled',
  },
  {
    id: 'boiled-prawn',
    name: 'Boiled Prawn',
    category: 'consumable',
    physNegBonus: 0.15,
    duration: '60s',
    stackGroup: 'boiled',
  },

  // ── Additional Skills ──
  {
    id: 'seppuku',
    name: 'Seppuku',
    category: 'skill',
    physDmgBonus: 0.054,
    duration: '60s',
    stackGroup: 'seppuku',
  },
  {
    id: 'determination',
    name: 'Determination',
    category: 'skill',
    allDmgBonus: 0.60,
    duration: '1 hit',
    stackGroup: 'determination',
  },
  {
    id: 'royal-knights-resolve',
    name: "Royal Knight's Resolve",
    category: 'skill',
    allDmgBonus: 0.80,
    duration: '1 hit',
    stackGroup: 'determination',
  },

  // ── Fortification Incantations (element-specific, lower tier) ──
  {
    id: 'magic-fortification',
    name: 'Magic Fortification',
    category: 'incantation',
    magicNegBonus: 0.35,
    duration: '60s',
    stackGroup: 'fortification',
  },
  {
    id: 'lightning-fortification',
    name: 'Lightning Fortification',
    category: 'incantation',
    lightningNegBonus: 0.35,
    duration: '60s',
    stackGroup: 'fortification',
  },
  {
    id: 'divine-fortification',
    name: 'Divine Fortification',
    category: 'incantation',
    holyNegBonus: 0.35,
    duration: '60s',
    stackGroup: 'fortification',
  },
  {
    id: 'flame-fortification',
    name: 'Flame Fortification',
    category: 'incantation',
    fireNegBonus: 0.35,
    duration: '60s',
    stackGroup: 'fortification',
  },
];

/**
 * Computes the combined damage multipliers and defense bonuses from active buffs.
 * Buffs in the same stackGroup: only the strongest is used.
 * Buffs in different groups: damage multiplies, defense stacks multiplicatively.
 */
export interface BuffTotals {
  physMult: number;
  magicMult: number;
  fireMult: number;
  lightningMult: number;
  holyMult: number;
  /** Per-element negation bonuses (multiplicative with armor) */
  physNegMult: number;
  magicNegMult: number;
  fireNegMult: number;
  lightningNegMult: number;
  holyNegMult: number;
}

export function computeBuffTotals(activeBuffIds: string[]): BuffTotals {
  const activeBuffs = BUFF_LIST.filter(b => activeBuffIds.includes(b.id));

  // Group by stackGroup; buffs without stackGroup are each their own group
  const groups = new Map<string, BuffEffect[]>();
  let ungroupedIdx = 0;
  for (const buff of activeBuffs) {
    const key = buff.stackGroup ?? `__ungrouped_${ungroupedIdx++}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(buff);
  }

  // From each group, pick the buff with the highest combined damage bonus
  let physMult = 1;
  let magicMult = 1;
  let fireMult = 1;
  let lightningMult = 1;
  let holyMult = 1;
  // Defense: multiplicative stacking across groups
  let physNegMult = 1;
  let magicNegMult = 1;
  let fireNegMult = 1;
  let lightningNegMult = 1;
  let holyNegMult = 1;

  for (const buffs of groups.values()) {
    // Pick strongest buff in the group (by total offensive value)
    const best = buffs.reduce((a, b) => {
      const aVal = (a.allDmgBonus ?? 0) + (a.physDmgBonus ?? 0)
        + (a.physNegBonus ?? 0) + (a.magicNegBonus ?? 0) + (a.holyNegBonus ?? 0)
        + (a.allNegBonus ?? 0);
      const bVal = (b.allDmgBonus ?? 0) + (b.physDmgBonus ?? 0)
        + (b.physNegBonus ?? 0) + (b.magicNegBonus ?? 0) + (b.holyNegBonus ?? 0)
        + (b.allNegBonus ?? 0);
      return bVal > aVal ? b : a;
    });

    // Damage multipliers
    const allDmg = best.allDmgBonus ?? 0;
    physMult      *= (1 + allDmg + (best.physDmgBonus ?? 0));
    magicMult     *= (1 + allDmg + (best.magicDmgBonus ?? 0));
    fireMult      *= (1 + allDmg + (best.fireDmgBonus ?? 0));
    lightningMult *= (1 + allDmg + (best.lightningDmgBonus ?? 0));
    holyMult      *= (1 + allDmg + (best.holyDmgBonus ?? 0));

    // Defense: element-specific or all
    const allNeg = best.allNegBonus ?? 0;
    physNegMult      *= (1 + allNeg + (best.physNegBonus ?? 0));
    magicNegMult     *= (1 + allNeg + (best.magicNegBonus ?? 0));
    fireNegMult      *= (1 + allNeg + (best.fireNegBonus ?? 0));
    lightningNegMult *= (1 + allNeg + (best.lightningNegBonus ?? 0));
    holyNegMult      *= (1 + allNeg + (best.holyNegBonus ?? 0));
  }

  return {
    physMult, magicMult, fireMult, lightningMult, holyMult,
    physNegMult, magicNegMult, fireNegMult, lightningNegMult, holyNegMult,
  };
}
