/**
 * Efectos de talismanes sobre las estadísticas del personaje.
 *
 * IDs = EquipParamAccessory (fuente: ClayAmore/ER-Save-Editor accessory_name.rs)
 * Valores = reverse-engineered por la comunidad (wiki + datamine de SpEffectParam)
 *
 * Los bonuses de atributos (vigor, mind, etc.) se suman a los stats base
 * antes de calcular HP/FP/Stamina/Load.
 *
 * Los bonuses de stat derivado (hpBonus, etc.) se aplican MULTIPLICATIVAMENTE
 * al valor calculado: finalHP = calcHP(effectiveVig) * (1 + sum_of_hpBonuses).
 * En Elden Ring, los bonuses de este tipo son aditivos entre sí.
 */

import type { CharacterStats, EquippedWeapon } from '../types';

interface TalismanFlatEffects {
  vigor?:        number;
  mind?:         number;
  endurance?:    number;
  strength?:     number;
  dexterity?:    number;
  intelligence?: number;
  faith?:        number;
  arcane?:       number;

  hpBonus?:        number;  // fracción, e.g. 0.06 = +6%
  fpBonus?:        number;
  staminaBonus?:   number;
  equipLoadBonus?: number;

  // Discovery (flat addition to base 100 + arcane component)
  discoveryBonus?: number;

  // Poise multiplier bonus (fracción, e.g. 0.33 = +33%)
  poiseBonus?: number;

  // Flat resistance bonuses
  immunityBonus?:   number;
  robustnessBonus?: number;
  focusBonus?:      number;
  vitalityBonus?:   number;

  // Elemental damage bonuses (fracción)
  magicDmgBonus?:     number;
  fireDmgBonus?:      number;
  lightningDmgBonus?: number;
  holyDmgBonus?:      number;

  // Defense absorption bonuses (fracción, puede ser negativo)
  physicalDefBonus?:  number;
  magicDefBonus?:     number;
  fireDefBonus?:      number;
  lightningDefBonus?: number;
  holyDefBonus?:      number;

  // Skill / spell power bonuses (fracción)
  skillDmgBonus?:     number;
  sorceryPowerBonus?: number;
  incantPowerBonus?:  number;

  // FP cost reduction (fracción, 0.25 = −25%)
  skillFpCostReduction?: number;
  spellFpCostReduction?: number;

  // Guard Boost bonus (fracción, e.g. 0.10 = +10%)
  guardBoostBonus?: number;

  // Descriptive label for conditional/utility talismans
  noteLabel?: string;
}

// EquipParamAccessory ID → efectos sobre stats
const TALISMAN_EFFECTS: Record<number, TalismanFlatEffects> = {

  // ── Crimson Amber Medallion (HP) ──────────────────────────────
  1000: { hpBonus: 0.06  },
  1001: { hpBonus: 0.07  },
  1002: { hpBonus: 0.08  },

  // ── Cerulean Amber Medallion (FP) ─────────────────────────────
  1010: { fpBonus: 0.07  },
  1011: { fpBonus: 0.09  },
  1012: { fpBonus: 0.11  },

  // ── Viridian Amber Medallion (Stamina) ────────────────────────
  1020: { staminaBonus: 0.11 },
  1021: { staminaBonus: 0.13 },
  1022: { staminaBonus: 0.15 },

  // ── Arsenal Charm (Equip Load) ────────────────────────────────
  1030: { equipLoadBonus: 0.15 },
  1031: { equipLoadBonus: 0.17 },
  1032: { equipLoadBonus: 0.19 },   // Great-Jar's Arsenal

  // ── Erdtree's Favor (HP + Stamina + Equip Load) ───────────────
  1040: { hpBonus: 0.03,   staminaBonus: 0.0675, equipLoadBonus: 0.05  },
  1041: { hpBonus: 0.035,  staminaBonus: 0.0825, equipLoadBonus: 0.065 },
  1042: { hpBonus: 0.04,   staminaBonus: 0.096,  equipLoadBonus: 0.08  },

  // ── Radagon's Scarseal / Soreseal (VIG+END+STR+DEX, −neg) ────
  1050: { vigor: 3, endurance: 3, strength: 3, dexterity: 3,
          physicalDefBonus: -0.10, magicDefBonus: -0.10, fireDefBonus: -0.10,
          lightningDefBonus: -0.10, holyDefBonus: -0.10 },
  1051: { vigor: 5, endurance: 5, strength: 5, dexterity: 5,
          physicalDefBonus: -0.15, magicDefBonus: -0.15, fireDefBonus: -0.15,
          lightningDefBonus: -0.15, holyDefBonus: -0.15 },

  // ── Starscourge Heirloom (STR+5) ─────────────────────────────
  1060: { strength: 5 },

  // ── Prosthesis-Wearer Heirloom (DEX+5) ───────────────────────
  1070: { dexterity: 5 },

  // ── Stargazer Heirloom (INT+5) ────────────────────────────────
  1080: { intelligence: 5 },

  // ── Two Fingers Heirloom (FAI+5) ─────────────────────────────
  1090: { faith: 5 },

  // ── Marika's Scarseal / Soreseal (MND+INT+FAI+ARC, −neg) ─────
  1220: { mind: 3, intelligence: 3, faith: 3, arcane: 3,
          physicalDefBonus: -0.10, magicDefBonus: -0.10, fireDefBonus: -0.10,
          lightningDefBonus: -0.10, holyDefBonus: -0.10 },
  1221: { mind: 5, intelligence: 5, faith: 5, arcane: 5,
          physicalDefBonus: -0.15, magicDefBonus: -0.15, fireDefBonus: -0.15,
          lightningDefBonus: -0.15, holyDefBonus: -0.15 },

  // ── Silver Scarab (+75 Discovery) ─────────────────────────────
  1100: { discoveryBonus: 75 },

  // ── Stalwart Horn Charm (Robustness) ────────────────────────
  1160: { robustnessBonus: 90  },
  1161: { robustnessBonus: 140 },

  // ── Immunizing Horn Charm (Immunity) ────────────────────────
  1170: { immunityBonus: 90  },
  1171: { immunityBonus: 140 },

  // ── Clarifying Horn Charm (Focus) ───────────────────────────
  1180: { focusBonus: 90  },
  1181: { focusBonus: 140 },

  // ── Prince of Death's Pustule / Cyst (Vitality) ─────────────
  1190: { vitalityBonus: 90  },
  1191: { vitalityBonus: 140 },

  // ── Mottled Necklace (all four resistances) ─────────────────
  1200: { immunityBonus: 40, robustnessBonus: 40, focusBonus: 40, vitalityBonus: 40 },
  1201: { immunityBonus: 60, robustnessBonus: 60, focusBonus: 60, vitalityBonus: 60 },

  // ── Bull-Goat's Talisman (+33% Poise) ──────────────────────
  1210: { poiseBonus: 0.33 },

  // ── Warrior Jar Shard (+10% Skill damage) ────────────────────
  1230: { skillDmgBonus: 0.10 },

  // ── Shard of Alexander (+15% Skill damage) ──────────────────
  1231: { skillDmgBonus: 0.15 },

  // ── Millicent's Prosthesis (DEX+5) ───────────────────────────
  1250: { dexterity: 5 },

  // ── Gold Scarab (+20% Rune acquisition — no stat effect, display only) ──
  1110: { noteLabel: 'Rune gain +20%' },

  // ── Scorpion Charms (+12% elemental dmg, −10% phys absorption) ─
  2000: { magicDmgBonus: 0.12, physicalDefBonus: -0.10 },     // Magic Scorpion
  2010: { lightningDmgBonus: 0.12, physicalDefBonus: -0.10 }, // Lightning Scorpion
  2020: { fireDmgBonus: 0.12, physicalDefBonus: -0.10 },      // Fire Scorpion
  2030: { holyDmgBonus: 0.12, physicalDefBonus: -0.10 },      // Sacred Scorpion

  // ── Graven Talismans (Sorcery power) ─────────────────────────
  3000: { sorceryPowerBonus: 0.04 },  // Graven-School
  3001: { sorceryPowerBonus: 0.08 },  // Graven-Mass

  // ── Canvas Talismans (Incantation power) ─────────────────────
  3040: { incantPowerBonus: 0.04 },   // Faithful's Canvas
  3050: { incantPowerBonus: 0.08 },   // Flock's Canvas

  // ── Godfrey Icon (+15% charged/held attacks ≈ skill bonus) ──
  3090: { skillDmgBonus: 0.15 },

  // ── Dragoncrest (physical defense absorption) ────────────────
  4000: { physicalDefBonus: 0.10 },   // Dragoncrest Shield
  4001: { physicalDefBonus: 0.13 },   // Dragoncrest Shield +1
  4002: { physicalDefBonus: 0.17 },   // Dragoncrest Shield +2
  4003: { physicalDefBonus: 0.20 },   // Dragoncrest Greatshield

  // ── Spelldrake (Magic negation) ─────────────────────────────
  4010: { magicDefBonus: 0.12 },      // Spelldrake
  4011: { magicDefBonus: 0.17 },      // Spelldrake +1
  4012: { magicDefBonus: 0.20 },      // Spelldrake +2

  // ── Flamedrake (Fire negation) ──────────────────────────────
  4020: { fireDefBonus: 0.13 },       // Flamedrake
  4021: { fireDefBonus: 0.17 },       // Flamedrake +1
  4022: { fireDefBonus: 0.20 },       // Flamedrake +2

  // ── Boltdrake (Lightning negation) ──────────────────────────
  4030: { lightningDefBonus: 0.13 },  // Boltdrake
  4031: { lightningDefBonus: 0.17 },  // Boltdrake +1
  4032: { lightningDefBonus: 0.20 },  // Boltdrake +2

  // ── Haligdrake (Holy negation) ──────────────────────────────
  4040: { holyDefBonus: 0.13 },       // Haligdrake
  4041: { holyDefBonus: 0.17 },       // Haligdrake +1
  4042: { holyDefBonus: 0.20 },       // Haligdrake +2

  // ── Pearldrake (all non-physical negation) ──────────────────
  4050: { magicDefBonus: 0.05, fireDefBonus: 0.05, lightningDefBonus: 0.05, holyDefBonus: 0.05 },
  4051: { magicDefBonus: 0.07, fireDefBonus: 0.07, lightningDefBonus: 0.07, holyDefBonus: 0.07 },
  4052: { magicDefBonus: 0.09, fireDefBonus: 0.09, lightningDefBonus: 0.09, holyDefBonus: 0.09 },

  // ── FP cost reduction ───────────────────────────────────────
  6020: { skillFpCostReduction: 0.25 },                  // Carian Filigreed Crest
  3080: { spellFpCostReduction: 0.25, hpBonus: -0.15 },  // Primal Glintstone Blade

  // ── Crepus's Vial (eliminates casting noise) ──────────────
  6000: { noteLabel: 'Silent casting' },

  // ── Concealing Veil (crouch = invisible at distance) ──────
  6010: { noteLabel: 'Crouch: stealth' },

  // ── Longtail Cat Talisman (negate fall damage) ────────────
  6040: { noteLabel: 'Negate fall DMG' },

  // ── Shabriri's Woe (attract enemy aggro) ──────────────────
  6050: { noteLabel: 'Attract aggro' },

  // ── Daedicar's Woe (take +100% damage) ────────────────────
  6060: { physicalDefBonus: -1.0, magicDefBonus: -1.0, fireDefBonus: -1.0, lightningDefBonus: -1.0, holyDefBonus: -1.0 },

  // ── Sacrificial Twig (keep runes on death) ────────────────
  6070: { noteLabel: 'Keep runes on death' },

  // ── Crucible Knot Talisman (+40 poise while getting up) ───
  4110: { noteLabel: 'Knockdown Poise +40' },

  // ── Crucible Feather Talisman (extended dodge i-frames) ───
  4070: { noteLabel: 'Extended i-frames' },

  // ── Blue-Feathered Branchsword (low HP: DEF up) ──────────
  4080: { noteLabel: 'Low HP: DEF +20%' },

  // ── Perfumer's Talisman (+20% consumable potency) ────────
  2220: { noteLabel: 'Item potency +20%' },

  // ── Godskin Swaddling Cloth (successive hits: recover HP) ─
  5040: { noteLabel: 'Chain hits: regen HP' },

  // ── Multiplayer talismans ──────────────────────────────────
  6080: { noteLabel: 'Appear as host' },         // Furled Finger's Trick-Mirror
  6090: { noteLabel: 'Appear as phantom' },      // Host's Trick-Mirror
  6100: { noteLabel: 'Attract spirits' },        // Entwining Umbilical Cord

  // ── Utility talismans (noteLabel only) ──────────────────────
  1140: { noteLabel: 'Memory Slots +2' },
  1150: { noteLabel: 'Stamina Regen +17.8%' },
  2040: { noteLabel: 'Low HP: ATK +20%' },
  2050: { noteLabel: 'Full HP: ATK +10%' },
  2060: { noteLabel: 'Counter DMG +15%' },
  2070: { noteLabel: 'Guard Poise DMG up' },
  2080: { noteLabel: 'Successive ATK +3/5/10%' },
  2081: { noteLabel: 'Successive ATK +6/8/13%' },
  2090: { noteLabel: 'Critical DMG +17%' },
  2100: { noteLabel: 'Arrow Reach +60m' },
  2110: { noteLabel: 'ATK up when light load' },
  2120: { noteLabel: 'Final hit in chain +5-15%' },
  2130: { noteLabel: 'Charge ATK +10%' },
  2140: { noteLabel: 'Mounted DMG +15%' },
  2150: { noteLabel: 'Arrow DMG +10%' },
  2160: { noteLabel: 'ATK +20% on Blood Loss' },
  2170: { noteLabel: 'ATK +20% on Poison/Rot' },
  2180: { noteLabel: 'Jump ATK +15%' },
  2190: { noteLabel: 'Roar/Breath +15%' },
  2200: { noteLabel: 'Guard Counter +20%' },
  2210: { noteLabel: 'Pot DMG +20%' },
  3060: { noteLabel: 'Buff Duration +30%' },
  3070: { noteLabel: 'Cast Speed +30' },
  4060: { noteLabel: 'Roll Phys Neg +12%' },
  4090: { noteLabel: 'Full HP: Neg +30%' },
  4100: { guardBoostBonus: 0.10, noteLabel: 'Guard Boost +10%' },
  5000: { noteLabel: 'Flask HP +10%' },
  5010: { noteLabel: 'Flask FP +10%' },
  5020: { noteLabel: 'HP Regen +2/s' },
  5030: { noteLabel: 'Kill: recover HP 3%+30' },
  5050: { noteLabel: 'Crit: recover 85 HP' },
  5060: { noteLabel: 'Crit: recover 15 FP' },
  6110: { noteLabel: 'Kill: recover 3 FP' },
};

// ─────────────────────────────────────────────────────────────────

export interface TalismanBonuses {
  /** Bonuses de atributo sumados (e.g. { vigor: 5, endurance: 5 }) */
  attrs: Partial<CharacterStats>;
  /** Bonus aditivo de HP (fracción, e.g. 0.09 = +9%) */
  hpBonus:        number;
  fpBonus:        number;
  staminaBonus:   number;
  equipLoadBonus: number;
  /** Flat discovery bonus (e.g. 75 from Silver Scarab) */
  discoveryBonus: number;
  /** Poise multiplier bonus (fracción, e.g. 0.33 = +33%) */
  poiseBonus:     number;
  /** Flat resistance bonuses */
  immunityBonus:   number;
  robustnessBonus: number;
  focusBonus:      number;
  vitalityBonus:   number;
  /** Elemental damage bonuses (fracción) */
  magicDmgBonus:     number;
  fireDmgBonus:      number;
  lightningDmgBonus: number;
  holyDmgBonus:      number;
  /** Defense absorption bonuses (fracción, can be negative) */
  physicalDefBonus:   number;
  magicDefBonus:      number;
  fireDefBonus:       number;
  lightningDefBonus:  number;
  holyDefBonus:       number;
  /** Skill/spell power bonuses */
  skillDmgBonus:     number;
  sorceryPowerBonus: number;
  incantPowerBonus:  number;
  /** FP cost reduction (fracción) */
  skillFpCostReduction: number;
  spellFpCostReduction: number;
  /** Guard Boost bonus (fracción) */
  guardBoostBonus: number;
  /** true si al menos un talismán activo tiene algún efecto */
  hasAny: boolean;
}

/**
 * Genera líneas de efecto detalladas para el tooltip de un talismán.
 * Retorna array de { label, value } o null si el baseId no tiene efectos.
 */
export function getTalismanEffectLines(
  baseId: number,
): { label: string; value: string }[] | null {
  const eff = TALISMAN_EFFECTS[baseId];
  if (!eff) return null;

  const lines: { label: string; value: string }[] = [];

  const ATTR_LABELS: [keyof TalismanFlatEffects, string][] = [
    ['vigor', 'Vigor'], ['mind', 'Mind'], ['endurance', 'Endurance'],
    ['strength', 'Strength'], ['dexterity', 'Dexterity'], ['intelligence', 'Intelligence'],
    ['faith', 'Faith'], ['arcane', 'Arcane'],
  ];
  for (const [k, label] of ATTR_LABELS) {
    const val = eff[k] as number | undefined;
    if (val) lines.push({ label, value: `+${val}` });
  }

  if (eff.hpBonus)        lines.push({ label: 'HP',         value: `+${Math.round(eff.hpBonus * 100)}%` });
  if (eff.fpBonus)        lines.push({ label: 'FP',         value: `+${Math.round(eff.fpBonus * 100)}%` });
  if (eff.staminaBonus)   lines.push({ label: 'Stamina',    value: `+${Math.round(eff.staminaBonus * 100)}%` });
  if (eff.equipLoadBonus) lines.push({ label: 'Equip Load', value: `+${Math.round(eff.equipLoadBonus * 100)}%` });
  if (eff.discoveryBonus) lines.push({ label: 'Discovery',  value: `+${eff.discoveryBonus}` });
  if (eff.poiseBonus)     lines.push({ label: 'Poise',      value: `+${Math.round(eff.poiseBonus * 100)}%` });
  if (eff.immunityBonus)   lines.push({ label: 'Immunity',   value: `+${eff.immunityBonus}` });
  if (eff.robustnessBonus) lines.push({ label: 'Robustness', value: `+${eff.robustnessBonus}` });
  if (eff.focusBonus)      lines.push({ label: 'Focus',      value: `+${eff.focusBonus}` });
  if (eff.vitalityBonus)   lines.push({ label: 'Vitality',   value: `+${eff.vitalityBonus}` });

  // Elemental damage bonuses
  if (eff.magicDmgBonus)     lines.push({ label: 'Magic Dmg',     value: `+${Math.round(eff.magicDmgBonus * 100)}%` });
  if (eff.fireDmgBonus)      lines.push({ label: 'Fire Dmg',      value: `+${Math.round(eff.fireDmgBonus * 100)}%` });
  if (eff.lightningDmgBonus) lines.push({ label: 'Lightning Dmg', value: `+${Math.round(eff.lightningDmgBonus * 100)}%` });
  if (eff.holyDmgBonus)      lines.push({ label: 'Holy Dmg',      value: `+${Math.round(eff.holyDmgBonus * 100)}%` });

  // Defense absorption bonuses
  const defBonuses: [string, number | undefined][] = [
    ['Phys Absorb', eff.physicalDefBonus], ['Magic Absorb', eff.magicDefBonus],
    ['Fire Absorb', eff.fireDefBonus], ['Lightning Absorb', eff.lightningDefBonus],
    ['Holy Absorb', eff.holyDefBonus],
  ];
  for (const [lbl, val] of defBonuses) {
    if (val) lines.push({ label: lbl, value: `${val > 0 ? '+' : ''}${Math.round(val * 100)}%` });
  }

  // Skill / spell power
  if (eff.skillDmgBonus)     lines.push({ label: 'Skill Dmg',      value: `+${Math.round(eff.skillDmgBonus * 100)}%` });
  if (eff.sorceryPowerBonus) lines.push({ label: 'Sorcery Power',  value: `+${Math.round(eff.sorceryPowerBonus * 100)}%` });
  if (eff.incantPowerBonus)  lines.push({ label: 'Incant. Power',  value: `+${Math.round(eff.incantPowerBonus * 100)}%` });

  // FP cost reduction
  if (eff.skillFpCostReduction) lines.push({ label: 'Skill FP', value: `−${Math.round(eff.skillFpCostReduction * 100)}%` });
  if (eff.spellFpCostReduction) lines.push({ label: 'Spell FP', value: `−${Math.round(eff.spellFpCostReduction * 100)}%` });

  // Guard Boost
  if (eff.guardBoostBonus) lines.push({ label: 'Guard Boost', value: `+${Math.round(eff.guardBoostBonus * 100)}%` });

  // Descriptive note (conditional/utility talismans)
  if (eff.noteLabel) lines.push({ label: 'Effect', value: eff.noteLabel });

  return lines.length > 0 ? lines : null;
}

/**
 * Genera una etiqueta compacta de efecto para mostrar bajo el slot de un talismán.
 * Ejemplos: "+HP 6%", "+LOAD 15%", "+HP·STA·LOAD", "+STR+DEX 5"
 */
export function getTalismanEffectLabel(baseId: number): string | null {
  const eff = TALISMAN_EFFECTS[baseId];
  if (!eff) return null;

  const parts: string[] = [];

  // ── Bonuses de atributo plano ──────────────────────────────────
  const ABBR: [keyof TalismanFlatEffects, string][] = [
    ['vigor', 'VIG'], ['mind', 'MND'], ['endurance', 'END'], ['strength', 'STR'],
    ['dexterity', 'DEX'], ['intelligence', 'INT'], ['faith', 'FAI'], ['arcane', 'ARC'],
  ];
  const attrPairs: [string, number][] = [];
  for (const [k, abbr] of ABBR) {
    const val = eff[k] as number | undefined;
    if (val) attrPairs.push([abbr, val]);
  }
  if (attrPairs.length > 0) {
    // Agrupar por valor: "+STR+DEX 5" en vez de "+STR 5 +DEX 5"
    const byVal = new Map<number, string[]>();
    for (const [abbr, val] of attrPairs) {
      if (!byVal.has(val)) byVal.set(val, []);
      byVal.get(val)!.push(abbr);
    }
    for (const [val, abbrs] of byVal) {
      parts.push(`+${abbrs.join('+')} ${val}`);
    }
  }

  // ── Bonuses porcentuales ───────────────────────────────────────
  const pctItems: [string, number][] = [];
  if (eff.hpBonus)        pctItems.push(['HP',   eff.hpBonus]);
  if (eff.fpBonus)        pctItems.push(['FP',   eff.fpBonus]);
  if (eff.staminaBonus)   pctItems.push(['STA',  eff.staminaBonus]);
  if (eff.equipLoadBonus) pctItems.push(['LOAD', eff.equipLoadBonus]);
  if (eff.poiseBonus)     pctItems.push(['POISE', eff.poiseBonus]);

  if (pctItems.length === 1) {
    parts.push(`+${pctItems[0][0]} ${Math.round(pctItems[0][1] * 100)}%`);
  } else if (pctItems.length > 1) {
    parts.push(`+${pctItems.map(p => p[0]).join('·')}`);
  }

  // ── Elemental damage / defense / skill / spell bonuses ────────
  const dmgParts: string[] = [];
  if (eff.magicDmgBonus)     dmgParts.push('MAG');
  if (eff.fireDmgBonus)      dmgParts.push('FIRE');
  if (eff.lightningDmgBonus) dmgParts.push('LTN');
  if (eff.holyDmgBonus)      dmgParts.push('HOLY');
  if (dmgParts.length > 0) parts.push(`+${dmgParts.join('·')} DMG`);

  if (eff.physicalDefBonus && eff.physicalDefBonus > 0) parts.push(`+PHYS DEF ${Math.round(eff.physicalDefBonus * 100)}%`);
  if (eff.physicalDefBonus && eff.physicalDefBonus < 0) parts.push(`${Math.round(eff.physicalDefBonus * 100)}% PHYS`);

  // Elemental defense bonuses (drake talismans)
  const elemDefParts: string[] = [];
  if (eff.magicDefBonus && eff.magicDefBonus > 0) elemDefParts.push('MAG');
  if (eff.fireDefBonus && eff.fireDefBonus > 0) elemDefParts.push('FIRE');
  if (eff.lightningDefBonus && eff.lightningDefBonus > 0) elemDefParts.push('LTN');
  if (eff.holyDefBonus && eff.holyDefBonus > 0) elemDefParts.push('HOLY');
  if (elemDefParts.length > 0) {
    const val = eff.magicDefBonus ?? eff.fireDefBonus ?? eff.lightningDefBonus ?? eff.holyDefBonus ?? 0;
    if (elemDefParts.length === 1) {
      parts.push(`+${elemDefParts[0]} NEG ${Math.round(val * 100)}%`);
    } else {
      parts.push(`+${elemDefParts.join('·')} NEG`);
    }
  }
  // Negative elemental defense (from Soreseal)
  if (eff.magicDefBonus && eff.magicDefBonus < 0 && !eff.physicalDefBonus) {
    parts.push(`${Math.round(eff.magicDefBonus * 100)}% NEG`);
  }

  if (eff.skillDmgBonus)     parts.push(`+SKILL ${Math.round(eff.skillDmgBonus * 100)}%`);
  if (eff.sorceryPowerBonus) parts.push(`+SORC ${Math.round(eff.sorceryPowerBonus * 100)}%`);
  if (eff.incantPowerBonus)  parts.push(`+INCANT ${Math.round(eff.incantPowerBonus * 100)}%`);

  // FP cost reduction
  if (eff.skillFpCostReduction) parts.push(`-SKILL FP ${Math.round(eff.skillFpCostReduction * 100)}%`);
  if (eff.spellFpCostReduction) parts.push(`-SPELL FP ${Math.round(eff.spellFpCostReduction * 100)}%`);

  // Note label (utility)
  if (eff.noteLabel) parts.push(eff.noteLabel);

  // ── Bonuses planos (resistencias, discovery) ─────────────────
  if (eff.discoveryBonus) parts.push(`+DISC ${eff.discoveryBonus}`);

  const resItems: [string, number][] = [];
  if (eff.immunityBonus)   resItems.push(['IMM', eff.immunityBonus]);
  if (eff.robustnessBonus) resItems.push(['ROB', eff.robustnessBonus]);
  if (eff.focusBonus)      resItems.push(['FOC', eff.focusBonus]);
  if (eff.vitalityBonus)   resItems.push(['VIT', eff.vitalityBonus]);
  if (resItems.length > 0) {
    const byVal = new Map<number, string[]>();
    for (const [abbr, val] of resItems) {
      if (!byVal.has(val)) byVal.set(val, []);
      byVal.get(val)!.push(abbr);
    }
    for (const [val, abbrs] of byVal) {
      parts.push(`+${abbrs.join('·')} ${val}`);
    }
  }

  return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * Computa los bonuses acumulados de todos los talismanes equipados.
 * Ignora slots vacíos y talismanes sin efectos conocidos.
 */
export function computeTalismanBonuses(
  talismans: readonly EquippedWeapon[],
): TalismanBonuses {
  const attrs: Partial<CharacterStats> = {};
  let hpBonus = 0, fpBonus = 0, staminaBonus = 0, equipLoadBonus = 0;
  let discoveryBonus = 0, poiseBonus = 0;
  let immunityBonus = 0, robustnessBonus = 0, focusBonus = 0, vitalityBonus = 0;
  let magicDmgBonus = 0, fireDmgBonus = 0, lightningDmgBonus = 0, holyDmgBonus = 0;
  let physicalDefBonus = 0, magicDefBonus = 0, fireDefBonus = 0, lightningDefBonus = 0, holyDefBonus = 0;
  let skillDmgBonus = 0, sorceryPowerBonus = 0, incantPowerBonus = 0;
  let skillFpCostReduction = 0, spellFpCostReduction = 0;
  let guardBoostBonus = 0;
  let hasAny = false;

  for (const t of talismans) {
    if (!t.name || !t.baseId) continue;
    const eff = TALISMAN_EFFECTS[t.baseId];
    if (!eff) continue;

    hasAny = true;

    if (eff.vigor)        attrs.vigor        = (attrs.vigor        ?? 0) + eff.vigor;
    if (eff.mind)         attrs.mind         = (attrs.mind         ?? 0) + eff.mind;
    if (eff.endurance)    attrs.endurance    = (attrs.endurance    ?? 0) + eff.endurance;
    if (eff.strength)     attrs.strength     = (attrs.strength     ?? 0) + eff.strength;
    if (eff.dexterity)    attrs.dexterity    = (attrs.dexterity    ?? 0) + eff.dexterity;
    if (eff.intelligence) attrs.intelligence = (attrs.intelligence ?? 0) + eff.intelligence;
    if (eff.faith)        attrs.faith        = (attrs.faith        ?? 0) + eff.faith;
    if (eff.arcane)       attrs.arcane       = (attrs.arcane       ?? 0) + eff.arcane;

    if (eff.hpBonus)        hpBonus        += eff.hpBonus;
    if (eff.fpBonus)        fpBonus        += eff.fpBonus;
    if (eff.staminaBonus)   staminaBonus   += eff.staminaBonus;
    if (eff.equipLoadBonus) equipLoadBonus += eff.equipLoadBonus;

    if (eff.discoveryBonus)  discoveryBonus  += eff.discoveryBonus;
    if (eff.poiseBonus)      poiseBonus      += eff.poiseBonus;
    if (eff.immunityBonus)   immunityBonus   += eff.immunityBonus;
    if (eff.robustnessBonus) robustnessBonus += eff.robustnessBonus;
    if (eff.focusBonus)      focusBonus      += eff.focusBonus;
    if (eff.vitalityBonus)   vitalityBonus   += eff.vitalityBonus;

    if (eff.magicDmgBonus)     magicDmgBonus     += eff.magicDmgBonus;
    if (eff.fireDmgBonus)      fireDmgBonus      += eff.fireDmgBonus;
    if (eff.lightningDmgBonus) lightningDmgBonus += eff.lightningDmgBonus;
    if (eff.holyDmgBonus)      holyDmgBonus      += eff.holyDmgBonus;
    if (eff.physicalDefBonus)   physicalDefBonus   += eff.physicalDefBonus;
    if (eff.magicDefBonus)     magicDefBonus      += eff.magicDefBonus;
    if (eff.fireDefBonus)      fireDefBonus       += eff.fireDefBonus;
    if (eff.lightningDefBonus) lightningDefBonus  += eff.lightningDefBonus;
    if (eff.holyDefBonus)      holyDefBonus       += eff.holyDefBonus;
    if (eff.skillDmgBonus)     skillDmgBonus      += eff.skillDmgBonus;
    if (eff.sorceryPowerBonus) sorceryPowerBonus  += eff.sorceryPowerBonus;
    if (eff.incantPowerBonus)  incantPowerBonus   += eff.incantPowerBonus;
    if (eff.skillFpCostReduction) skillFpCostReduction += eff.skillFpCostReduction;
    if (eff.spellFpCostReduction) spellFpCostReduction += eff.spellFpCostReduction;
    if (eff.guardBoostBonus) guardBoostBonus += eff.guardBoostBonus;
  }

  return {
    attrs, hpBonus, fpBonus, staminaBonus, equipLoadBonus,
    discoveryBonus, poiseBonus,
    immunityBonus, robustnessBonus, focusBonus, vitalityBonus,
    magicDmgBonus, fireDmgBonus, lightningDmgBonus, holyDmgBonus,
    physicalDefBonus, magicDefBonus, fireDefBonus, lightningDefBonus, holyDefBonus,
    skillDmgBonus, sorceryPowerBonus, incantPowerBonus,
    skillFpCostReduction, spellFpCostReduction,
    guardBoostBonus,
    hasAny,
  };
}
