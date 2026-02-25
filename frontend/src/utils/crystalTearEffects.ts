/**
 * Crystal Tear effects for the Flask of Wondrous Physick.
 *
 * IDs = EquipParamGoods baseId (from save parser equipped.physickTears[].baseId).
 * Effects last 3 minutes unless noted otherwise.
 *
 * Stat bonuses are added to effective stats (same as talismans/Great Rune).
 * Multiplicative bonuses (hpBonus, fpBonus, etc.) stack additively with other sources.
 */

export interface CrystalTearEffect {
  strength?: number;
  dexterity?: number;
  intelligence?: number;
  faith?: number;

  hpBonus?: number;
  fpBonus?: number;
  staminaBonus?: number;

  magicDmgBonus?: number;
  fireDmgBonus?: number;
  lightningDmgBonus?: number;
  holyDmgBonus?: number;

  physicalNegBonus?: number;
  poiseFlat?: number;

  noteLabel?: string;
  description: string;
}

const CRYSTAL_TEAR_EFFECTS: Record<number, CrystalTearEffect> = {
  // ── Stat-boosting Tears ──

  // Strength-knot Crystal Tear
  11000: { strength: 10, description: 'Temporarily boosts strength' },

  // Dexterity-knot Crystal Tear
  11010: { dexterity: 10, description: 'Temporarily boosts dexterity' },

  // Intelligence-knot Crystal Tear
  11020: { intelligence: 10, description: 'Temporarily boosts intelligence' },

  // Faith-knot Crystal Tear
  11030: { faith: 10, description: 'Temporarily boosts faith' },

  // ── HP/FP/Stamina Tears ──

  // Crimson Crystal Tear — instant 50% HP recovery
  11100: { noteLabel: 'Instant +50% HP', description: 'Instantly restores 50% of maximum HP on use' },

  // Crimsonburst Crystal Tear — HP regen 7 HP/s for ~120s
  11110: { noteLabel: 'HP Regen 7/s (120s)', description: 'Regenerates ~7 HP per second for 120 seconds' },

  // Crimson Bubbletear — absorb one lethal hit, then heal ~30% HP
  11120: { noteLabel: 'Negate 1 lethal hit', description: 'Negates a single fatal hit and restores ~30% HP' },

  // Cerulean Crystal Tear — instant 50% FP recovery
  11200: { noteLabel: 'Instant +50% FP', description: 'Instantly restores 50% of maximum FP on use' },

  // Cerulean Hidden Tear — eliminates FP cost for 15s
  11210: { noteLabel: 'No FP cost 15s', description: 'Eliminates all FP consumption for 15 seconds' },

  // Greenspill Crystal Tear — +15% max stamina
  11300: { staminaBonus: 0.15, description: 'Temporarily boosts maximum stamina by 15%' },

  // Greenburst Crystal Tear — stamina regen +20% for 3 min
  11310: { noteLabel: 'STA Regen +20%', description: 'Boosts stamina recovery speed by ~20% for 3 minutes' },

  // ── Defense Tears ──

  // Opaline Hardtear — +15% physical damage negation
  11400: { physicalNegBonus: 0.15, description: 'Temporarily boosts physical damage negation by 15%' },

  // Opaline Bubbletear — absorb one hit (non-physical)
  11410: { noteLabel: 'Absorb 1 hit (Bubble)', description: 'Generates a protective bubble that negates damage from one hit' },

  // Leaden Hardtear — +100 poise
  11500: { poiseFlat: 100, description: 'Temporarily boosts poise by 100' },

  // ── Damage Tears ──

  // Spiked Cracked Tear — +15% charged attack damage
  11600: { noteLabel: '+Charge ATK 15%', description: 'Boosts charged attack damage by 15% for 3 minutes' },

  // Thorny Cracked Tear — successive hits +dmg (4/6/10%)
  11610: { noteLabel: 'Chain hits +4/6/10%', description: 'Raises attack power by 4/6/10% with successive hits for 3 minutes' },

  // Stonebarb Cracked Tear — +30% poise damage dealt
  11620: { noteLabel: '+Poise DMG 30%', description: 'Boosts poise damage dealt by 30% for 3 minutes' },

  // Ruptured Crystal Tear — explosion on hit (~150 fire dmg)
  11700: { noteLabel: 'AoE explosion ~150', description: 'Causes a fire explosion near enemies for ~150 damage' },

  // ── Elemental Tears (each provides +20% elemental damage for 3 min) ──

  // Magic-Shrouding Cracked Tear
  11800: { magicDmgBonus: 0.20, description: 'Temporarily boosts magic attack by 20%' },

  // Fire-Shrouding Cracked Tear
  11810: { fireDmgBonus: 0.20, description: 'Temporarily boosts fire attack by 20%' },

  // Lightning-Shrouding Cracked Tear
  11820: { lightningDmgBonus: 0.20, description: 'Temporarily boosts lightning attack by 20%' },

  // Holy-Shrouding Cracked Tear
  11830: { holyDmgBonus: 0.20, description: 'Temporarily boosts holy attack by 20%' },

  // ── Utility Tears ──

  // Winged Crystal Tear — eliminate equip load
  11900: { noteLabel: 'Eliminate equip load', description: 'Temporarily eliminates equip load' },

  // Windy Crystal Tear — dodge roll becomes quickstep
  11910: { noteLabel: 'Quickstep dodge', description: 'Replaces dodge roll with a quickstep' },

  // Twiggy Cracked Tear — keep runes on death
  11920: { noteLabel: 'Keep runes on death', description: 'Prevents rune loss upon death' },

  // Purifying Crystal Tear — negates Mohg debuff
  11930: { noteLabel: 'Mohg debuff immune', description: 'Purifies the curse of the blood flame' },

  // Bloodsucking Cracked Tear — +20% ATK, drains 1% HP/s
  11940: { noteLabel: '+ATK 20%, HP drain', description: 'Raises attack power by 20% but drains 1% HP per second' },

  // Deflecting Hardtear — auto-parry while guarding
  11950: { noteLabel: 'Auto-deflect guard', description: 'Boosts ability to deflect attacks while guarding' },
};

/**
 * Returns the Crystal Tear effect for a given baseId, or null if unknown.
 */
export function getCrystalTearEffect(baseId: number): CrystalTearEffect | null {
  return CRYSTAL_TEAR_EFFECTS[baseId] ?? null;
}

/**
 * Returns a compact effect label for display under a Crystal Tear slot.
 */
export function getCrystalTearEffectLabel(baseId: number): string | null {
  const eff = CRYSTAL_TEAR_EFFECTS[baseId];
  if (!eff) return null;

  if (eff.noteLabel) return eff.noteLabel;

  const parts: string[] = [];
  if (eff.strength) parts.push(`STR +${eff.strength}`);
  if (eff.dexterity) parts.push(`DEX +${eff.dexterity}`);
  if (eff.intelligence) parts.push(`INT +${eff.intelligence}`);
  if (eff.faith) parts.push(`FAI +${eff.faith}`);
  if (eff.hpBonus) parts.push(`HP +${Math.round(eff.hpBonus * 100)}%`);
  if (eff.fpBonus) parts.push(`FP +${Math.round(eff.fpBonus * 100)}%`);
  if (eff.staminaBonus) parts.push(`STA +${Math.round(eff.staminaBonus * 100)}%`);
  if (eff.magicDmgBonus) parts.push(`+Magic ${Math.round(eff.magicDmgBonus * 100)}%`);
  if (eff.fireDmgBonus) parts.push(`+Fire ${Math.round(eff.fireDmgBonus * 100)}%`);
  if (eff.lightningDmgBonus) parts.push(`+Ltn ${Math.round(eff.lightningDmgBonus * 100)}%`);
  if (eff.holyDmgBonus) parts.push(`+Holy ${Math.round(eff.holyDmgBonus * 100)}%`);
  if (eff.physicalNegBonus) parts.push(`+Phys Neg ${Math.round(eff.physicalNegBonus * 100)}%`);
  if (eff.poiseFlat) parts.push(`+Poise ${eff.poiseFlat}`);

  return parts.length > 0 ? parts.join(', ') : eff.description;
}

/**
 * Computes combined Physick bonuses from both equipped Crystal Tears.
 */
export interface PhysickBonuses {
  strength: number;
  dexterity: number;
  intelligence: number;
  faith: number;
  hpBonus: number;
  fpBonus: number;
  staminaBonus: number;
  magicDmgBonus: number;
  fireDmgBonus: number;
  lightningDmgBonus: number;
  holyDmgBonus: number;
  physicalNegBonus: number;
  poiseFlat: number;
  hasAny: boolean;
}

export function computePhysickBonuses(
  tears: readonly { baseId: number }[],
): PhysickBonuses {
  let strength = 0, dexterity = 0, intelligence = 0, faith = 0;
  let hpBonus = 0, fpBonus = 0, staminaBonus = 0;
  let magicDmgBonus = 0, fireDmgBonus = 0, lightningDmgBonus = 0, holyDmgBonus = 0;
  let physicalNegBonus = 0, poiseFlat = 0;
  let hasAny = false;

  for (const t of tears) {
    const eff = CRYSTAL_TEAR_EFFECTS[t.baseId];
    if (!eff) continue;

    hasAny = true;
    if (eff.strength) strength += eff.strength;
    if (eff.dexterity) dexterity += eff.dexterity;
    if (eff.intelligence) intelligence += eff.intelligence;
    if (eff.faith) faith += eff.faith;
    if (eff.hpBonus) hpBonus += eff.hpBonus;
    if (eff.fpBonus) fpBonus += eff.fpBonus;
    if (eff.staminaBonus) staminaBonus += eff.staminaBonus;
    if (eff.magicDmgBonus) magicDmgBonus += eff.magicDmgBonus;
    if (eff.fireDmgBonus) fireDmgBonus += eff.fireDmgBonus;
    if (eff.lightningDmgBonus) lightningDmgBonus += eff.lightningDmgBonus;
    if (eff.holyDmgBonus) holyDmgBonus += eff.holyDmgBonus;
    if (eff.physicalNegBonus) physicalNegBonus += eff.physicalNegBonus;
    if (eff.poiseFlat) poiseFlat += eff.poiseFlat;
  }

  return {
    strength, dexterity, intelligence, faith,
    hpBonus, fpBonus, staminaBonus,
    magicDmgBonus, fireDmgBonus, lightningDmgBonus, holyDmgBonus,
    physicalNegBonus, poiseFlat,
    hasAny,
  };
}
