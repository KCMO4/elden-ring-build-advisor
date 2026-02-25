/**
 * Great Rune effects on character stats.
 *
 * IDs = EquipParamGoods baseId (from save parser equipped.greatRune.baseId).
 * Effects = activated Great Rune bonuses (requires visiting a Divine Tower + using a Rune Arc).
 *
 * Stat bonuses (vigor, mind, etc.) are added to base stats before computing HP/FP/etc.
 * Multiplicative bonuses (hpBonus, etc.) apply like talisman bonuses:
 *   finalHP = calcHP(effectiveVig) * (1 + sum_of_hpBonuses)
 */

export interface GreatRuneEffect {
  vigor?: number;
  mind?: number;
  endurance?: number;
  strength?: number;
  dexterity?: number;
  intelligence?: number;
  faith?: number;
  arcane?: number;

  hpBonus?: number;
  fpBonus?: number;
  staminaBonus?: number;

  noteLabel?: string;
  description: string;
}

const GREAT_RUNE_EFFECTS: Record<number, GreatRuneEffect> = {
  // Godrick's Great Rune — +5 to all attributes
  191: {
    vigor: 5, mind: 5, endurance: 5,
    strength: 5, dexterity: 5, intelligence: 5,
    faith: 5, arcane: 5,
    description: 'Raises all attributes by +5',
  },

  // Radahn's Great Rune — +15% HP, +12.5% FP, +12.5% Stamina
  192: {
    hpBonus: 0.15, fpBonus: 0.125, staminaBonus: 0.125,
    description: 'Raises maximum HP, FP, and Stamina',
  },

  // Morgott's Great Rune — +25% HP
  193: {
    hpBonus: 0.25,
    description: 'Greatly raises maximum HP',
  },

  // Rykard's Great Rune — HP on kill
  194: {
    noteLabel: 'Restores HP on enemy defeat',
    description: 'Restores HP upon defeating enemies',
  },

  // Malenia's Great Rune — HP recovery on attacks after taking damage
  195: {
    noteLabel: 'HP recovery on hit after damage',
    description: 'Attacks restore HP after taking damage',
  },

  // Mohg's Great Rune — Phantom summon on kill
  196: {
    noteLabel: 'Phantom Great Rune on kill',
    description: 'Grants a blessing of blood to phantoms upon killing enemies',
  },

  // Great Rune of the Unborn — Respec at Rennala
  390: {
    noteLabel: 'Respec at Rennala',
    description: 'Used to be reborn at Rennala, Queen of the Full Moon',
  },

  // ── DLC Great Runes ──

  // Messmer's Great Rune (Shadow of the Erdtree) — +20% fire damage
  197: {
    noteLabel: '+Fire Dmg on Flask',
    description: 'Boosts fire damage after drinking flask',
  },

  // Romina's Great Rune (Shadow of the Erdtree) — extend buff durations
  198: {
    noteLabel: '+Buff Duration',
    description: 'Extends the duration of spells and item effects',
  },
};

/**
 * Returns the Great Rune effect for a given baseId, or null if unknown.
 */
export function getGreatRuneEffect(baseId: number): GreatRuneEffect | null {
  return GREAT_RUNE_EFFECTS[baseId] ?? null;
}

/**
 * Returns a compact effect label for display under the Great Rune slot.
 */
export function getGreatRuneEffectLabel(baseId: number): string | null {
  const eff = GREAT_RUNE_EFFECTS[baseId];
  if (!eff) return null;

  if (eff.noteLabel) return eff.noteLabel;

  const parts: string[] = [];

  // Attribute bonuses
  const attrCount = [eff.vigor, eff.mind, eff.endurance, eff.strength,
    eff.dexterity, eff.intelligence, eff.faith, eff.arcane].filter(Boolean).length;
  if (attrCount === 8) {
    parts.push(`All Attrs +${eff.vigor}`);
  } else if (attrCount > 0) {
    const val = eff.vigor ?? eff.strength ?? eff.dexterity ?? 0;
    parts.push(`+${val} to ${attrCount} attrs`);
  }

  // Percentage bonuses
  if (eff.hpBonus) parts.push(`HP +${Math.round(eff.hpBonus * 100)}%`);
  if (eff.fpBonus) parts.push(`FP +${Math.round(eff.fpBonus * 100)}%`);
  if (eff.staminaBonus) parts.push(`STA +${Math.round(eff.staminaBonus * 100)}%`);

  return parts.length > 0 ? parts.join(', ') : eff.description;
}

/**
 * Returns detailed effect lines for tooltip display (same format as talisman effects).
 */
export function getGreatRuneEffectLines(
  baseId: number,
): { label: string; value: string }[] | null {
  const eff = GREAT_RUNE_EFFECTS[baseId];
  if (!eff) return null;

  const lines: { label: string; value: string }[] = [];

  const ATTR_LABELS: [keyof GreatRuneEffect, string][] = [
    ['vigor', 'Vigor'], ['mind', 'Mind'], ['endurance', 'Endurance'],
    ['strength', 'Strength'], ['dexterity', 'Dexterity'], ['intelligence', 'Intelligence'],
    ['faith', 'Faith'], ['arcane', 'Arcane'],
  ];
  for (const [k, label] of ATTR_LABELS) {
    const val = eff[k] as number | undefined;
    if (val) lines.push({ label, value: `+${val}` });
  }

  if (eff.hpBonus) lines.push({ label: 'Max HP', value: `+${Math.round(eff.hpBonus * 100)}%` });
  if (eff.fpBonus) lines.push({ label: 'Max FP', value: `+${Math.round(eff.fpBonus * 100)}%` });
  if (eff.staminaBonus) lines.push({ label: 'Max Stamina', value: `+${Math.round(eff.staminaBonus * 100)}%` });

  if (eff.noteLabel) lines.push({ label: 'Effect', value: eff.noteLabel });

  return lines.length > 0 ? lines : null;
}
