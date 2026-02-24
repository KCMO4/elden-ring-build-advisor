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
  1040: { hpBonus: 0.03,   staminaBonus: 0.07,  equipLoadBonus: 0.05  },
  1041: { hpBonus: 0.035,  staminaBonus: 0.085, equipLoadBonus: 0.065 },
  1042: { hpBonus: 0.04,   staminaBonus: 0.10,  equipLoadBonus: 0.08  },

  // ── Radagon's Scarseal / Soreseal (VIG+END+STR+DEX) ──────────
  1050: { vigor: 3, endurance: 3, strength: 3, dexterity: 3 },
  1051: { vigor: 5, endurance: 5, strength: 5, dexterity: 5 },

  // ── Starscourge Heirloom (STR+5) ─────────────────────────────
  1060: { strength: 5 },

  // ── Prosthesis-Wearer Heirloom (DEX+5) ───────────────────────
  1070: { dexterity: 5 },

  // ── Stargazer Heirloom (INT+5) ────────────────────────────────
  1080: { intelligence: 5 },

  // ── Two Fingers Heirloom (FAI+5) ─────────────────────────────
  1090: { faith: 5 },

  // ── Marika's Scarseal / Soreseal (MND+INT+FAI+ARC) ───────────
  1220: { mind: 3, intelligence: 3, faith: 3, arcane: 3 },
  1221: { mind: 5, intelligence: 5, faith: 5, arcane: 5 },

  // ── Warrior Jar Shard (STR+2) ─────────────────────────────────
  1230: { strength: 2 },

  // ── Millicent's Prosthesis (DEX+5) ───────────────────────────
  1250: { dexterity: 5 },
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
    ['vigor', 'Vigor'], ['mind', 'Mente'], ['endurance', 'Resistencia'],
    ['strength', 'Fuerza'], ['dexterity', 'Destreza'], ['intelligence', 'Inteligencia'],
    ['faith', 'Fe'], ['arcane', 'Arcano'],
  ];
  for (const [k, label] of ATTR_LABELS) {
    const val = eff[k] as number | undefined;
    if (val) lines.push({ label, value: `+${val}` });
  }

  if (eff.hpBonus)        lines.push({ label: 'HP',         value: `+${Math.round(eff.hpBonus * 100)}%` });
  if (eff.fpBonus)        lines.push({ label: 'FP',         value: `+${Math.round(eff.fpBonus * 100)}%` });
  if (eff.staminaBonus)   lines.push({ label: 'Stamina',    value: `+${Math.round(eff.staminaBonus * 100)}%` });
  if (eff.equipLoadBonus) lines.push({ label: 'Equip Load', value: `+${Math.round(eff.equipLoadBonus * 100)}%` });

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

  if (pctItems.length === 1) {
    // Un solo bonus: "+HP 6%"
    parts.push(`+${pctItems[0][0]} ${Math.round(pctItems[0][1] * 100)}%`);
  } else if (pctItems.length > 1) {
    // Múltiples bonuses porcentuales: condensar en "+HP·STA·LOAD"
    parts.push(`+${pctItems.map(p => p[0]).join('·')}`);
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
  }

  return { attrs, hpBonus, fpBonus, staminaBonus, equipLoadBonus, hasAny };
}
