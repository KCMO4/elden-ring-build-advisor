/**
 * Common buff effects for the damage calculator.
 *
 * These are user-selectable (not from the save file) — the player activates
 * them in-game via incantations, consumables, or weapon skills.
 *
 * Buffs in the same stackGroup do NOT stack (only the strongest applies).
 * Buffs in different groups stack multiplicatively.
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
    physNegPenalty: 0.40,
    duration: '60s',
    stackGroup: 'aromatic',
  },

  // ── Defense Incantations ──
  {
    id: 'black-flames-protection',
    name: "Black Flame's Protection",
    category: 'incantation',
    allNegBonus: 0.35,
    duration: '70s',
    stackGroup: 'body-buff',
  },
  {
    id: 'barrier-of-gold',
    name: 'Barrier of Gold',
    category: 'incantation',
    magicDmgBonus: 0,  // not a damage buff
    allNegBonus: 0.60,
    duration: '70s',
    stackGroup: 'body-buff',
  },
  {
    id: 'lords-divine-fortification',
    name: "Lord's Divine Fortification",
    category: 'incantation',
    allNegBonus: 0.60,
    duration: '70s',
    stackGroup: 'body-buff',
  },

  // ── Additional Consumables ──
  {
    id: 'boiled-crab',
    name: 'Boiled Crab',
    category: 'consumable',
    allNegBonus: 0.20,
    duration: '60s',
    stackGroup: 'boiled',
  },
  {
    id: 'boiled-prawn',
    name: 'Boiled Prawn',
    category: 'consumable',
    allNegBonus: 0.15,
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

  // ── Defense / Buff Incantations ──
  {
    id: 'blessing-of-erdtree',
    name: 'Blessing of the Erdtree',
    category: 'incantation',
    allNegBonus: 0,
    duration: '90s',
    stackGroup: 'regen',
  },
  {
    id: 'magic-fortification',
    name: 'Magic Fortification',
    category: 'incantation',
    allNegBonus: 0.35,
    duration: '60s',
    stackGroup: 'fortification',
  },
  {
    id: 'lightning-fortification',
    name: 'Lightning Fortification',
    category: 'incantation',
    allNegBonus: 0.35,
    duration: '60s',
    stackGroup: 'fortification',
  },
  {
    id: 'divine-fortification',
    name: 'Divine Fortification',
    category: 'incantation',
    allNegBonus: 0.35,
    duration: '60s',
    stackGroup: 'fortification',
  },
  {
    id: 'fire-deadly-sin',
    name: 'Fire, Deadly Sin',
    category: 'incantation',
    fireDmgBonus: 0,
    duration: '30s',
    stackGroup: 'deadly-sin',
  },

  // ── More Consumables ──
  {
    id: 'pickled-turtle-neck',
    name: 'Pickled Turtle Neck',
    category: 'consumable',
    allNegBonus: 0,
    duration: '60s',
    stackGroup: 'turtle',
  },
];

/**
 * Computes the combined damage multipliers from a set of active buffs.
 * Buffs in the same stackGroup: only the strongest is used.
 * Buffs in different groups: multiply together.
 */
export interface BuffTotals {
  physMult: number;
  magicMult: number;
  fireMult: number;
  lightningMult: number;
  holyMult: number;
  negBonus: number;
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

  // From each group, pick the buff with the highest allDmgBonus (or physDmgBonus)
  let physMult = 1;
  let magicMult = 1;
  let fireMult = 1;
  let lightningMult = 1;
  let holyMult = 1;
  let negBonus = 0;

  for (const buffs of groups.values()) {
    // Pick strongest buff in the group
    const best = buffs.reduce((a, b) => {
      const aVal = (a.allDmgBonus ?? 0) + (a.physDmgBonus ?? 0);
      const bVal = (b.allDmgBonus ?? 0) + (b.physDmgBonus ?? 0);
      return bVal > aVal ? b : a;
    });

    const allDmg = best.allDmgBonus ?? 0;
    physMult      *= (1 + allDmg + (best.physDmgBonus ?? 0));
    magicMult     *= (1 + allDmg + (best.magicDmgBonus ?? 0));
    fireMult      *= (1 + allDmg + (best.fireDmgBonus ?? 0));
    lightningMult *= (1 + allDmg + (best.lightningDmgBonus ?? 0));
    holyMult      *= (1 + allDmg + (best.holyDmgBonus ?? 0));
    negBonus      += (best.allNegBonus ?? 0);
  }

  return { physMult, magicMult, fireMult, lightningMult, holyMult, negBonus };
}
