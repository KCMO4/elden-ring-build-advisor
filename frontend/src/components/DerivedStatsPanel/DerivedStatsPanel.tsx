import { useState, useMemo } from 'react';
import type { CharacterStats, EquippedItems, EquippedWeapon, DamageStats, DefenseStats } from '../../types';
import { useMountAnimation } from '../../hooks/useMountAnimation';
import { computeTalismanBonuses } from '../../utils/talismanEffects';
import { getGreatRuneEffect } from '../../utils/greatRuneEffects';
import { computePhysickBonuses } from '../../utils/crystalTearEffects';
import { BUFF_LIST, computeBuffTotals } from '../../utils/buffEffects';
import { estimateEquippedAR, stackNegation, estimateSpellScaling, meetsRequirements, estimatePassiveBuildup } from '../../utils/arCalc';
import styles from './DerivedStatsPanel.module.css';

interface Props {
  stats:    CharacterStats;
  equipped: EquippedItems;
  level:    number;
  heldRunes?: number;
}

// ── Fórmulas exactas de Elden Ring ────────────────────────────

function calcHP(vig: number): number {
  const v = Math.min(99, Math.max(1, vig));
  let hp: number;
  if      (v <= 25) hp = 300  + 500 * Math.pow((v - 1)  / 24, 1.5);
  else if (v <= 40) hp = 800  + 650 * Math.pow((v - 25) / 15, 1.1);
  else if (v <= 60) hp = 1450 + 450 * (1 - Math.pow(1 - (v - 40) / 20, 1.2));
  else              hp = 1900 + 200 * (1 - Math.pow(1 - (v - 60) / 39, 1.2));
  return Math.floor(hp);
}

function calcFP(mnd: number): number {
  const m = Math.min(99, Math.max(1, mnd));
  let fp: number;
  if      (m <= 15) fp = 50  + 45  * ((m - 1)  / 14);
  else if (m <= 35) fp = 95  + 105 * ((m - 15) / 20);
  else if (m <= 60) fp = 200 + 150 * (1 - Math.pow(1 - (m - 35) / 25, 1.2));
  else              fp = 350 + 100 * ((m - 60) / 39);
  return Math.floor(fp);
}

function calcStamina(end: number): number {
  const e = Math.min(99, Math.max(1, end));
  let sta: number;
  if      (e <= 15) sta = 80  + 25 * ((e - 1)  / 14);
  else if (e <= 30) sta = 105 + 25 * ((e - 15) / 15);
  else if (e <= 50) sta = 130 + 25 * ((e - 30) / 20);
  else              sta = 155 + 15 * ((e - 50) / 49);
  return Math.floor(sta);
}

function calcMaxEquipLoad(end: number): number {
  const e = Math.min(99, Math.max(1, end));
  let load: number;
  if      (e <= 8)  load = 25  + 20 * ((e - 1)  / 7);
  else if (e <= 25) load = 45  + 27 * ((e - 8)  / 17);
  else if (e <= 60) load = 72  + 48 * Math.pow((e - 25) / 35, 1.1);
  else              load = 120 + 40 * ((e - 60) / 39);
  return Math.round(load * 10) / 10;
}

// ── Rune Level Cost (exact formula from regulation.bin) ──────────────
// cost = floor( (max(0, (L-11)*0.02) + 0.1) * (L+81)^2 + 1 )
// where L = current level (targetLevel - 1).
// +1e-6 epsilon avoids IEEE 754 floor errors at ~17 specific levels
// where the true value is exactly an integer.
function runeCostForLevel(targetLevel: number): number {
  if (targetLevel <= 1) return 0;
  const L = targetLevel - 1;
  const x = Math.max(0, (L - 11) * 0.02);
  return Math.floor((x + 0.1) * (L + 81) ** 2 + 1 + 1e-6);
}

// ── Helpers ──────────────────────────────────────────────────

function equipWeight(eq: EquippedItems): number {
  const all = [...eq.rightHand, ...eq.leftHand, eq.head, eq.chest, eq.hands, eq.legs];
  const total = all.reduce((s, item) => s + (item.weight ?? 0), 0);
  return Math.round(total * 10) / 10;
}

function totalPoise(eq: EquippedItems): number {
  return [eq.head, eq.chest, eq.hands, eq.legs]
    .reduce((sum, p) => sum + (p.poise ?? 0), 0);
}

// ── Fórmulas exactas de resistencias de Elden Ring ──────────────

function resistLevelComponent(runeLevel: number): number {
  const lvl = runeLevel + 79;
  if (lvl <= 149) return 75 + 30 * ((lvl - 1) / 148);
  if (lvl <= 190) return 105 + 40 * ((lvl - 150) / 40);
  if (lvl <= 240) return 145 + 15 * ((lvl - 190) / 50);
  return 160 + 20 * ((lvl - 240) / 552);
}

function resistAttrComponent(stat: number): number {
  if (stat <= 30) return 0;
  if (stat <= 40) return 30 * ((stat - 30) / 10);
  if (stat <= 60) return 30 + 10 * ((stat - 40) / 20);
  return 40 + 10 * ((stat - 60) / 39);
}

function resistArcaneComponent(arc: number): number {
  if (arc <= 15) return arc;
  if (arc <= 40) return 15 + 15 * ((arc - 15) / 25);
  if (arc <= 60) return 30 + 10 * ((arc - 40) / 20);
  return 40 + 10 * ((arc - 60) / 39);
}

function calcDiscovery(arc: number): number {
  return 100 + Math.floor(resistArcaneComponent(Math.min(99, Math.max(1, arc))));
}

interface ResistanceTotals {
  immunity: number;
  robustness: number;
  focus: number;
  vitality: number;
}

function calcResistances(
  level: number,
  stats: CharacterStats,
  eq: EquippedItems,
): ResistanceTotals {
  const pieces = [eq.head, eq.chest, eq.hands, eq.legs];
  const armorSum = (key: 'immunity' | 'robustness' | 'focus' | 'vitality') =>
    pieces.reduce((s, p) => s + (p[key] ?? 0), 0);

  const lvlComp = resistLevelComponent(level);
  return {
    immunity:   Math.floor(lvlComp + resistAttrComponent(stats.vigor))      + armorSum('immunity'),
    robustness: Math.floor(lvlComp + resistAttrComponent(stats.endurance))  + armorSum('robustness'),
    focus:      Math.floor(lvlComp + resistAttrComponent(stats.mind))       + armorSum('focus'),
    vitality:   Math.floor(lvlComp + resistArcaneComponent(stats.arcane))   + armorSum('vitality'),
  };
}

function totalNegation(eq: EquippedItems): DefenseStats {
  const pieces = [eq.head, eq.chest, eq.hands, eq.legs];
  const collect = (key: keyof DefenseStats): number[] =>
    pieces.filter(p => p.defense != null).map(p => p.defense![key] ?? 0);

  return {
    physical:  stackNegation(collect('physical')),
    strike:    stackNegation(collect('strike')),
    slash:     stackNegation(collect('slash')),
    pierce:    stackNegation(collect('pierce')),
    magic:     stackNegation(collect('magic')),
    fire:      stackNegation(collect('fire')),
    lightning: stackNegation(collect('lightning')),
    holy:      stackNegation(collect('holy')),
  };
}

// ── Tipos de daño (para Attack) ───────────────────────────────
const DMG_TYPES: { key: keyof DamageStats; label: string; color: string; tooltip: string }[] = [
  { key: 'physical',  label: 'Physical',  color: '#c8bfa0', tooltip: 'Physical damage. Scales with STR and/or DEX depending on weapon and infusion.' },
  { key: 'magic',     label: 'Magic',     color: '#6a9cd4', tooltip: 'Magic damage. Scales primarily with INT. Effective against heavily armored enemies.' },
  { key: 'fire',      label: 'Fire',      color: '#d4703c', tooltip: 'Fire damage. Scales with STR, FAI, or both depending on infusion. Effective vs nature enemies.' },
  { key: 'lightning', label: 'Lightning', color: '#d4c03c', tooltip: 'Lightning damage. Scales primarily with DEX. Effective vs dragons and armored foes.' },
  { key: 'holy',      label: 'Holy',      color: '#c4a84c', tooltip: 'Holy damage. Scales primarily with FAI. Effective vs undead and Those Who Live in Death.' },
];

const DEF_TYPES: { key: keyof DefenseStats; label: string; color: string; indent?: boolean; tooltip: string }[] = [
  { key: 'physical',  label: 'Physical',  color: '#c8bfa0', tooltip: 'Percentage of physical damage negated by armor. Stacks multiplicatively across armor pieces.' },
  { key: 'strike',    label: 'VS Strike', color: '#a8a090', indent: true, tooltip: 'Negation vs strike damage (hammers, flails, fists). Physical subtype.' },
  { key: 'slash',     label: 'VS Slash',  color: '#a8a090', indent: true, tooltip: 'Negation vs slash damage (swords, axes, claws). Physical subtype.' },
  { key: 'pierce',    label: 'VS Pierce', color: '#a8a090', indent: true, tooltip: 'Negation vs pierce damage (spears, rapiers, arrows). Physical subtype.' },
  { key: 'magic',     label: 'Magic',     color: '#6a9cd4', tooltip: 'Percentage of magic damage negated. Improved by INT and certain armor sets.' },
  { key: 'fire',      label: 'Fire',      color: '#d4703c', tooltip: 'Percentage of fire damage negated. Fire-resistant armor helps significantly.' },
  { key: 'lightning', label: 'Lightning', color: '#d4c03c', tooltip: 'Percentage of lightning damage negated. Metallic armors tend to have lower lightning negation.' },
  { key: 'holy',      label: 'Holy',      color: '#c4a84c', tooltip: 'Percentage of holy damage negated. Erdtree-related armors have higher holy negation.' },
];

// ── Subcomponentes ───────────────────────────────────────────

interface NegRowProps {
  label: string;
  negation: number;
  color: string;
  maxNeg?: number;
  ready: boolean;
  delay: number;
  indent?: boolean;
  isFlat?: boolean;
  tooltip?: string;
}

function NegRow({ label, negation, color, maxNeg = 60, ready, delay, indent, isFlat, tooltip }: NegRowProps) {
  const pct = Math.min((negation / maxNeg) * 100, 100);
  const displayVal = negation > 0
    ? isFlat
      ? String(Math.round(negation))
      : (Number.isInteger(negation) ? negation : negation.toFixed(1)) + '%'
    : '—';
  return (
    <div className={`${styles.negRow} ${indent ? styles.negRowIndent : ''}`}>
      <span className={styles.negLabel} style={indent ? { color: '#7a7060' } : undefined}>
        {tooltip && <span className={styles.infoIcon} data-tooltip={tooltip}>?</span>}
        {label}
      </span>
      <div className={styles.negBar}>
        <div
          className={styles.negFill}
          style={{
            width: ready ? `${pct}%` : '0%',
            background: color,
            transitionDelay: `${delay}ms`,
            opacity: indent ? 0.65 : 0.85,
          }}
        />
      </div>
      <span className={styles.negValue} style={{ color: indent ? '#9a9080' : color }}>
        {displayVal}
      </span>
    </div>
  );
}

interface BodyRowProps { label: string; value: number; max: number; colorClass: string; ready: boolean; delay: number; tooltip?: string }

function BodyRow({ label, value, max, colorClass, ready, delay, tooltip }: BodyRowProps) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>
        {tooltip && <span className={styles.infoIcon} data-tooltip={tooltip}>?</span>}
        {label}
      </span>
      <div className={`${styles.barTrack} ${colorClass}`}>
        <div
          className={styles.barFill}
          style={{
            width: ready ? `${Math.min((value / max) * 100, 100)}%` : '0%',
            transitionDelay: `${delay}ms`,
          }}
        />
      </div>
      <span className={styles.rowValue}>{value}</span>
    </div>
  );
}

// ── Tipos de resistencia ──────────────────────────────────────
const RESIST_TYPES: { key: keyof ResistanceTotals; label: string; color: string; tooltip: string }[] = [
  { key: 'immunity',   label: 'Immunity',   color: '#8bc34a', tooltip: 'Resistance to Poison and Scarlet Rot buildup. Scales with Vigor + armor.' },
  { key: 'robustness', label: 'Robustness', color: '#e57373', tooltip: 'Resistance to Hemorrhage (bleed) and Frostbite buildup. Scales with Endurance + armor.' },
  { key: 'focus',      label: 'Focus',      color: '#ba68c8', tooltip: 'Resistance to Madness and Sleep buildup. Scales with Mind + armor.' },
  { key: 'vitality',   label: 'Vitality',   color: '#78909c', tooltip: 'Resistance to Death Blight buildup. Scales with Arcane + armor.' },
];

// ── Passive effect colors ────────────────────────────────────
const PASSIVE_COLORS: Record<string, string> = {
  blood: '#d4483c', frost: '#8ecfef', poison: '#8bc34a', rot: '#c87038',
  death: '#a0a0a0', sleep: '#ba68c8', madness: '#e0c040',
};

/** Slot identifiers for 2H selection */
type WeaponSlot = 'RH1' | 'RH2' | 'RH3' | 'LH1' | 'LH2' | 'LH3';

function getWeaponFromSlot(eq: EquippedItems, slot: WeaponSlot): EquippedWeapon | null {
  const map: Record<WeaponSlot, EquippedWeapon> = {
    RH1: eq.rightHand[0], RH2: eq.rightHand[1], RH3: eq.rightHand[2],
    LH1: eq.leftHand[0],  LH2: eq.leftHand[1],  LH3: eq.leftHand[2],
  };
  const w = map[slot];
  return w?.name && w?.damage ? w : null;
}

// ── Componente principal ──────────────────────────────────────

type DerivedTab = 'body' | 'attack' | 'defense';

export default function DerivedStatsPanel({ stats, equipped, level, heldRunes }: Props) {
  const ready = useMountAnimation();
  const [derivedTab, setDerivedTab] = useState<DerivedTab>('body');
  const [twoHandedSlot, setTwoHandedSlot] = useState<WeaponSlot | null>(null);
  const [greatRuneActive, setGreatRuneActive] = useState(false);
  const [physickActive, setPhysickActive] = useState(false);
  const [activeBuffIds, setActiveBuffIds] = useState<string[]>([]);
  const [buffsOpen, setBuffsOpen] = useState(false);

  // ── Talisman bonuses ──
  const talBonus = useMemo(
    () => computeTalismanBonuses(equipped.talismans),
    [equipped.talismans],
  );

  // ── Great Rune effect ──
  const grEffect = useMemo(
    () => equipped.greatRune?.baseId ? getGreatRuneEffect(equipped.greatRune.baseId) : null,
    [equipped.greatRune],
  );

  // ── Physick bonuses ──
  const physickBonus = useMemo(
    () => computePhysickBonuses(equipped.physickTears ?? []),
    [equipped.physickTears],
  );

  // ── Buff totals ──
  const buffTotals = useMemo(
    () => computeBuffTotals(activeBuffIds),
    [activeBuffIds],
  );

  // ── Effective stats (base + talisman attrs + Great Rune + Physick) ──
  const effVig = Math.min(99, stats.vigor
    + (talBonus.attrs.vigor ?? 0)
    + (greatRuneActive && grEffect?.vigor ? grEffect.vigor : 0));
  const effMnd = Math.min(99, stats.mind
    + (talBonus.attrs.mind ?? 0)
    + (greatRuneActive && grEffect?.mind ? grEffect.mind : 0));
  const effEnd = Math.min(99, stats.endurance
    + (talBonus.attrs.endurance ?? 0)
    + (greatRuneActive && grEffect?.endurance ? grEffect.endurance : 0));
  const effStr = Math.min(99, stats.strength
    + (talBonus.attrs.strength ?? 0)
    + (greatRuneActive && grEffect?.strength ? grEffect.strength : 0)
    + (physickActive ? physickBonus.strength : 0));
  const effDex = Math.min(99, stats.dexterity
    + (talBonus.attrs.dexterity ?? 0)
    + (greatRuneActive && grEffect?.dexterity ? grEffect.dexterity : 0)
    + (physickActive ? physickBonus.dexterity : 0));
  const effInt = Math.min(99, stats.intelligence
    + (talBonus.attrs.intelligence ?? 0)
    + (greatRuneActive && grEffect?.intelligence ? grEffect.intelligence : 0)
    + (physickActive ? physickBonus.intelligence : 0));
  const effFai = Math.min(99, stats.faith
    + (talBonus.attrs.faith ?? 0)
    + (greatRuneActive && grEffect?.faith ? grEffect.faith : 0)
    + (physickActive ? physickBonus.faith : 0));

  // Combined HP/FP/Stamina multipliers
  const hpMult = 1 + talBonus.hpBonus
    + (greatRuneActive && grEffect?.hpBonus ? grEffect.hpBonus : 0)
    + (physickActive ? physickBonus.hpBonus : 0);
  const fpMult = 1 + talBonus.fpBonus
    + (greatRuneActive && grEffect?.fpBonus ? grEffect.fpBonus : 0)
    + (physickActive ? physickBonus.fpBonus : 0);
  const staMult = 1 + talBonus.staminaBonus
    + (greatRuneActive && grEffect?.staminaBonus ? grEffect.staminaBonus : 0)
    + (physickActive ? physickBonus.staminaBonus : 0);

  const hp      = Math.floor(calcHP(effVig) * hpMult);
  const fp      = Math.floor(calcFP(effMnd) * fpMult);
  const stamina = Math.floor(calcStamina(effEnd) * staMult);
  const maxLoad = Math.round(calcMaxEquipLoad(effEnd) * (1 + talBonus.equipLoadBonus) * 10) / 10;

  const currLoad = equipWeight(equipped);
  const loadPct  = maxLoad > 0 ? (currLoad / maxLoad) * 100 : 0;
  const loadTag  = loadPct < 30 ? 'Light' : loadPct < 70 ? 'Medium' : loadPct < 100 ? 'Heavy' : 'Overloaded!';

  const neg      = useMemo(() => totalNegation(equipped), [equipped]);
  const hasArmor = Object.values(neg).some(v => v > 0);

  // Talisman + Physick + Buff defense bonuses stack MULTIPLICATIVELY with armor negation
  // Formula: 1 - (1 - armorNeg/100) * (1 - talismanBonus) * (1 - physickBonus) * (1 / buffNegMult)
  const physNegPhysick = physickActive ? physickBonus.physicalNegBonus : 0;
  const stackDefNeg = (armorPct: number, talDef: number, buffMult: number, physick: number = 0): number => {
    // buffMult is already a multiplier (e.g., 1.35 for +35% phys neg)
    // Convert to reduction: 1 - 1/buffMult would give the buff's contribution
    // Actually buff neg works as: remainingDmg = baseDmg * (1/buffMult)
    // Combined: remain = (1 - armorPct/100) * (1 - talDef) * (1 - physick) * (1 / buffMult)
    const remain = (1 - armorPct / 100) * (1 - talDef) * (1 - physick) / Math.max(0.01, buffMult);
    return Math.round(Math.max(0, Math.min(99.9, (1 - remain) * 100)) * 10) / 10;
  };
  const adjNeg = useMemo(() => ({
    physical:  stackDefNeg(neg.physical,  talBonus.physicalDefBonus,  buffTotals.physNegMult,      physNegPhysick),
    strike:    stackDefNeg(neg.strike,    talBonus.physicalDefBonus,  buffTotals.physNegMult,      physNegPhysick),
    slash:     stackDefNeg(neg.slash,     talBonus.physicalDefBonus,  buffTotals.physNegMult,      physNegPhysick),
    pierce:    stackDefNeg(neg.pierce,    talBonus.physicalDefBonus,  buffTotals.physNegMult,      physNegPhysick),
    magic:     stackDefNeg(neg.magic,     talBonus.magicDefBonus,     buffTotals.magicNegMult),
    fire:      stackDefNeg(neg.fire,      talBonus.fireDefBonus,      buffTotals.fireNegMult),
    lightning: stackDefNeg(neg.lightning,  talBonus.lightningDefBonus, buffTotals.lightningNegMult),
    holy:      stackDefNeg(neg.holy,      talBonus.holyDefBonus,      buffTotals.holyNegMult),
  }), [neg, talBonus, physNegPhysick, buffTotals]);

  const rawPoise = totalPoise(equipped);
  const physickPoise = physickActive ? physickBonus.poiseFlat : 0;
  const poise    = Math.round((rawPoise + physickPoise) * (1 + talBonus.poiseBonus) * 10) / 10;

  const baseResist = calcResistances(level, stats, equipped);
  const resist = {
    immunity:   baseResist.immunity   + talBonus.immunityBonus,
    robustness: baseResist.robustness + talBonus.robustnessBonus,
    focus:      baseResist.focus      + talBonus.focusBonus,
    vitality:   baseResist.vitality   + talBonus.vitalityBonus,
  };

  const effArc = Math.min(99, stats.arcane + (talBonus.attrs.arcane ?? 0)
    + (greatRuneActive && grEffect?.arcane ? grEffect.arcane : 0));
  const discovery = calcDiscovery(effArc) + talBonus.discoveryBonus;

  // ── 2H weapon selection ──
  const twoHanded = twoHandedSlot !== null;

  // Build effective stats for AR calculation
  const effectiveSTR2H = Math.min(99, Math.floor(effStr * 1.5));
  const effectiveStats: CharacterStats = useMemo(() => ({
    vigor: effVig, mind: effMnd, endurance: effEnd,
    strength: twoHanded ? effectiveSTR2H : effStr,
    dexterity: effDex, intelligence: effInt, faith: effFai,
    arcane: effArc,
  }), [effVig, effMnd, effEnd, effStr, effDex, effInt, effFai, effArc, twoHanded, effectiveSTR2H]);

  // Active weapon: 2H slot weapon or first RH with damage
  const activeWeapon = useMemo(() => {
    if (twoHandedSlot) return getWeaponFromSlot(equipped, twoHandedSlot);
    return equipped.rightHand.find(w => w.name && w.damage) ?? null;
  }, [twoHandedSlot, equipped]);

  // Available weapon slots for 2H buttons (exclude shields — they have stability but no meaningful scaling)
  const weaponSlots = useMemo(() => {
    const isShield = (w: EquippedWeapon) =>
      (w.stability != null && w.stability > 0) ||
      (w.itemType != null && /shield/i.test(w.itemType));
    const slots: { slot: WeaponSlot; weapon: EquippedWeapon }[] = [];
    equipped.rightHand.forEach((w, i) => {
      if (w.name && w.damage && !isShield(w)) slots.push({ slot: `RH${i + 1}` as WeaponSlot, weapon: w });
    });
    equipped.leftHand.forEach((w, i) => {
      if (w.name && w.damage && !isShield(w)) slots.push({ slot: `LH${i + 1}` as WeaponSlot, weapon: w });
    });
    return slots;
  }, [equipped]);

  // AR estimation — effectiveStats already has 2H STR boost, no need to pass twoHanded
  const rawAr = useMemo(
    () => activeWeapon?.damage ? estimateEquippedAR(activeWeapon, effectiveStats) : null,
    [activeWeapon, effectiveStats],
  );

  // Check if weapon requirements are met (for UI warning)
  // effectiveStats.strength already includes 2H ×1.5 when applicable
  const reqsMet = useMemo(
    () => activeWeapon ? meetsRequirements(activeWeapon, effectiveStats) : true,
    [activeWeapon, effectiveStats],
  );

  // Spell scaling — detect equipped staves/seals
  const spellCatalysts = useMemo(() => {
    const all = [...equipped.rightHand, ...equipped.leftHand];
    const catalysts: { weapon: EquippedWeapon; scaling: number; type: 'Sorcery' | 'Incant' }[] = [];
    for (const w of all) {
      if (!w.name || !w.itemType) continue;
      const sc = estimateSpellScaling(w, effectiveStats);
      if (sc != null) {
        catalysts.push({
          weapon: w,
          scaling: sc,
          type: w.itemType === 'Glintstone Staff' ? 'Sorcery' : 'Incant',
        });
      }
    }
    return catalysts;
  }, [equipped, effectiveStats]);

  // Apply talisman + physick elemental damage bonuses + buff multipliers
  const arEstimate = useMemo(() => {
    if (!rawAr) return null;
    const pMag = physickActive ? physickBonus.magicDmgBonus : 0;
    const pFire = physickActive ? physickBonus.fireDmgBonus : 0;
    const pLtn = physickActive ? physickBonus.lightningDmgBonus : 0;
    const pHoly = physickActive ? physickBonus.holyDmgBonus : 0;
    const phys = Math.round(rawAr.physical * buffTotals.physMult);
    const mag  = Math.round(rawAr.magic     * (1 + talBonus.magicDmgBonus + pMag) * buffTotals.magicMult);
    const fire = Math.round(rawAr.fire      * (1 + talBonus.fireDmgBonus + pFire) * buffTotals.fireMult);
    const ltn  = Math.round(rawAr.lightning * (1 + talBonus.lightningDmgBonus + pLtn) * buffTotals.lightningMult);
    const holy = Math.round(rawAr.holy      * (1 + talBonus.holyDmgBonus + pHoly) * buffTotals.holyMult);
    return { physical: phys, magic: mag, fire, lightning: ltn, holy, total: phys + mag + fire + ltn + holy };
  }, [rawAr, talBonus, buffTotals, physickActive, physickBonus]);

  // ── Off-hand weapon AR (LH weapon that isn't a shield) ──
  const offHandWeapon = useMemo(() => {
    const isShield = (w: EquippedWeapon) =>
      (w.stability != null && w.stability > 0) ||
      (w.itemType != null && /shield/i.test(w.itemType));
    // If activeWeapon is from RH, look for a LH weapon; if from LH (2H), skip
    if (twoHandedSlot) return null;
    return equipped.leftHand.find(w => w.name && w.damage && !isShield(w)) ?? null;
  }, [equipped, twoHandedSlot]);

  const offHandAr = useMemo(() => {
    if (!offHandWeapon?.damage) return null;
    const raw = estimateEquippedAR(offHandWeapon, effectiveStats);
    if (!raw) return null;
    const total = raw.physical + raw.magic + raw.fire + raw.lightning + raw.holy;
    return { ...raw, total };
  }, [offHandWeapon, effectiveStats]);

  // ── Guard Boost (shield in LH) ──
  const equippedShield = useMemo(() => {
    const all = [...equipped.leftHand, ...equipped.rightHand];
    return all.find(w => w.name && w.stability && w.stability > 0) ?? null;
  }, [equipped]);

  const guardBoost = useMemo(() => {
    if (!equippedShield?.stability) return null;
    return Math.floor(equippedShield.stability * (1 + talBonus.guardBoostBonus));
  }, [equippedShield, talBonus.guardBoostBonus]);

  // ── Buff tooltip helper ──
  const buffTooltip = (buff: typeof BUFF_LIST[number]): string => {
    const parts: string[] = [];
    if (buff.allDmgBonus)       parts.push(`All DMG ${buff.allDmgBonus > 0 ? '+' : ''}${Math.round(buff.allDmgBonus * 100)}%`);
    if (buff.physDmgBonus)      parts.push(`Phys DMG +${Math.round(buff.physDmgBonus * 100)}%`);
    if (buff.fireDmgBonus)      parts.push(`Fire DMG +${Math.round(buff.fireDmgBonus * 100)}%`);
    if (buff.magicDmgBonus)     parts.push(`Magic DMG +${Math.round(buff.magicDmgBonus * 100)}%`);
    if (buff.lightningDmgBonus) parts.push(`Lightning DMG +${Math.round(buff.lightningDmgBonus * 100)}%`);
    if (buff.holyDmgBonus)      parts.push(`Holy DMG +${Math.round(buff.holyDmgBonus * 100)}%`);
    if (buff.allNegBonus)       parts.push(`All DEF ${buff.allNegBonus > 0 ? '+' : ''}${Math.round(buff.allNegBonus * 100)}%`);
    if (buff.physNegBonus)      parts.push(`Phys DEF +${Math.round(buff.physNegBonus * 100)}%`);
    if (buff.magicNegBonus)     parts.push(`Magic DEF +${Math.round(buff.magicNegBonus * 100)}%`);
    if (buff.fireNegBonus)      parts.push(`Fire DEF +${Math.round(buff.fireNegBonus * 100)}%`);
    if (buff.lightningNegBonus) parts.push(`Ltn DEF +${Math.round(buff.lightningNegBonus * 100)}%`);
    if (buff.holyNegBonus)      parts.push(`Holy DEF +${Math.round(buff.holyNegBonus * 100)}%`);
    if (buff.physNegPenalty)     parts.push(`Phys DEF ${buff.physNegPenalty > 0 ? '+' : ''}${Math.round(buff.physNegPenalty * 100)}%`);
    return parts.join(', ') || buff.name;
  };

  // ── Toggle buff ──
  const toggleBuff = (id: string) => {
    setActiveBuffIds(prev =>
      prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id],
    );
  };

  return (
    <div className={styles.panel}>

      {/* ── Sub-tabs ── */}
      <div className={styles.subTabs}>
        {([
          { key: 'body' as DerivedTab, label: 'Body' },
          { key: 'attack' as DerivedTab, label: 'Attack' },
          { key: 'defense' as DerivedTab, label: 'Defense' },
        ]).map(t => (
          <button
            key={t.key}
            className={`${styles.subTab} ${derivedTab === t.key ? styles.subTabActive : ''}`}
            onClick={() => setDerivedTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════ TAB: Body ══════ */}
      {derivedTab === 'body' && (
        <>
          <div className={styles.section}>
            <span className={styles.sectionTitle}>
              Body
              {grEffect && (
                <button
                  className={`${styles.twoHandBtn} ${greatRuneActive ? styles.twoHandActive : ''}`}
                  onClick={() => setGreatRuneActive(v => !v)}
                  title={grEffect.description}
                >
                  Rune Arc
                </button>
              )}
              {physickBonus.hasAny && (
                <button
                  className={`${styles.twoHandBtn} ${physickActive ? styles.physickActive : ''}`}
                  onClick={() => setPhysickActive(v => !v)}
                  title="Flask of Wondrous Physick"
                >
                  Physick
                </button>
              )}
            </span>
            <BodyRow label="HP"      value={hp}     max={2100} colorClass={styles.barVig} ready={ready} delay={0} tooltip="Maximum health. Scales with Vigor. Softcaps at 40 VIG (1450 HP) and 60 VIG (1900 HP)." />
            <BodyRow label="FP"      value={fp}     max={450}  colorClass={styles.barMnd} ready={ready} delay={80} tooltip="Focus Points for weapon skills and spells. Scales with Mind. Softcaps at 35 MND and 60 MND." />
            <BodyRow label="Stamina" value={stamina} max={170}  colorClass={styles.barEnd} ready={ready} delay={160} tooltip="Used for attacking, dodging, blocking, and sprinting. Scales with Endurance. Softcaps at 30 and 50 END." />

            <div className={styles.loadRow}>
              <span className={styles.rowLabel}><span className={styles.infoIcon} data-tooltip="Total weight of equipped gear. Roll type: Light <30%, Medium <70%, Heavy <100%, Overloaded >100%. Scales with Endurance.">?</span> Equip Load</span>
              <div className={styles.loadBarWrap}>
                <div className={`${styles.barTrack} ${loadPct >= 100 ? styles.barOver : styles.barLoad}`}>
                  <div className={styles.barFill} style={{ width: ready ? `${Math.min(loadPct, 100)}%` : '0%', transitionDelay: '240ms' }} />
                </div>
                <div className={`${styles.loadTick} ${loadPct >= 30 ? styles.loadTickReached : ''}`} style={{ left: '30%' }} />
                <div className={`${styles.loadTick} ${loadPct >= 70 ? styles.loadTickReached : ''}`} style={{ left: '70%' }} />
              </div>
              <span className={styles.rowValue}>
                {currLoad > 0 ? `${currLoad} / ${maxLoad.toFixed(1)}` : `— / ${maxLoad.toFixed(1)}`}
              </span>
              <span className={`${styles.loadTag} ${loadPct >= 70 ? styles.loadTagWarn : ''}`}>{loadTag}</span>
            </div>
          </div>

          {heldRunes != null && (
            <div className={styles.section}>
              <span className={styles.sectionTitle}>Next Level</span>
              {(() => {
                const nextCost = runeCostForLevel(level + 1);
                const remaining = Math.max(0, nextCost - heldRunes);
                const pct = nextCost > 0 ? Math.min((heldRunes / nextCost) * 100, 100) : 0;
                return (
                  <>
                    <div className={styles.row}>
                      <span className={styles.rowLabel}><span className={styles.infoIcon} data-tooltip="Runes required to reach the next level. Cost increases exponentially with each level.">?</span> Cost</span>
                      <div className={`${styles.barTrack} ${styles.barRune}`}>
                        <div
                          className={styles.barFill}
                          style={{ width: ready ? `${pct}%` : '0%', transitionDelay: '1200ms' }}
                        />
                      </div>
                      <span className={styles.rowValue}>{nextCost.toLocaleString()}</span>
                    </div>
                    <div className={styles.runeDetail}>
                      <span>Held: {heldRunes.toLocaleString()}</span>
                      {remaining > 0
                        ? <span className={styles.runeNeed}>Need: {remaining.toLocaleString()}</span>
                        : <span className={styles.runeReady}>Ready to level up!</span>
                      }
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </>
      )}

      {/* ══════ TAB: Attack ══════ */}
      {derivedTab === 'attack' && (
        <>
          {activeWeapon && arEstimate && (
            <div className={styles.section}>
              <span className={styles.sectionTitle}>
                Attack
                <span className={styles.sectionNote}>
                  {activeWeapon.infusion && activeWeapon.infusion !== 'Standard'
                    ? `${activeWeapon.infusion} ${activeWeapon.name}`
                    : activeWeapon.name}
                </span>
              </span>

              <div className={styles.totalArRow}>
                <span className={styles.totalArLabel}><span className={styles.infoIcon} data-tooltip="Attack Rating — estimated total damage before enemy defenses. Sum of all damage types. Higher is better.">?</span> Total AR</span>
                <span className={styles.totalArValue} style={!reqsMet ? { color: '#e04040' } : undefined}>
                  ~{arEstimate.total}{!reqsMet ? ' !' : ''}
                </span>
              </div>
              {!reqsMet && (
                <div className={styles.fpNote} style={{ color: '#e04040' }}>
                  Requirements not met — damage reduced
                </div>
              )}

              {weaponSlots.length > 0 && (
                <div className={styles.twoHandRow}>
                  <span className={styles.twoHandLabel}>2H:</span>
                  {weaponSlots.map(({ slot }) => (
                    <button
                      key={slot}
                      className={`${styles.twoHandBtn} ${twoHandedSlot === slot ? styles.twoHandActive : ''}`}
                      onClick={() => setTwoHandedSlot(prev => prev === slot ? null : slot)}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              )}

              {twoHanded && (
                <div className={styles.twoHandNote}>
                  STR {effStr} → {effectiveSTR2H} (×1.5)
                </div>
              )}
              {DMG_TYPES.map(({ key, label, color, tooltip }, i) => {
                const v = arEstimate[key as keyof typeof arEstimate] as number;
                if (!v || v <= 0) return null;
                return (
                  <div key={key} className={styles.row}>
                    <span className={styles.rowLabel}><span className={styles.infoIcon} data-tooltip={tooltip}>?</span> {label}</span>
                    <div className={styles.barTrack}>
                      <div
                        className={styles.barFill}
                        style={{
                          width: ready ? `${Math.min((v / 650) * 100, 100)}%` : '0%',
                          background: color,
                          transitionDelay: `${320 + i * 60}ms`,
                        }}
                      />
                    </div>
                    <span className={styles.rowValue}>~{v}</span>
                  </div>
                );
              })}
              {activeWeapon.scaling && (
                <div className={styles.scalingRow}>
                  {(['str','dex','int','fai','arc'] as const).map(s => {
                    const grade = activeWeapon.scaling![s];
                    if (!grade || grade === '-') return null;
                    return (
                      <span key={s} className={styles.scalingBadge}>
                        <span className={styles.scalingStat}>{s.toUpperCase()}</span>
                        <span className={styles.scalingGrade}>{grade}</span>
                      </span>
                    );
                  })}
                </div>
              )}
              {activeWeapon.skill && (
                <div className={styles.skillRow}>
                  <span className={styles.skillName}>{activeWeapon.skill}</span>
                  {activeWeapon.skillFpCost && (
                    <span className={styles.skillFp}>
                      FP {activeWeapon.skillFpCost[0]}{activeWeapon.skillFpCost[1] != null ? ` (${activeWeapon.skillFpCost[1]})` : ''}
                    </span>
                  )}
                </div>
              )}
              {activeWeapon.passives && activeWeapon.passives.length > 0 && (
                <div className={styles.passiveRow}>
                  {activeWeapon.passives.map((p, i) => {
                    const arcGrade = activeWeapon.scaling?.arc ?? '-';
                    const arcScales = (p.type === 'blood' || p.type === 'poison') && arcGrade !== '-';
                    const scaledBuildup = arcScales
                      ? estimatePassiveBuildup(p.buildup, effectiveStats.arcane, arcGrade)
                      : p.buildup;
                    return (
                      <span key={i} className={styles.passiveBadge} style={{ borderColor: PASSIVE_COLORS[p.type] ?? '#888' }}>
                        <span className={styles.passiveType} style={{ color: PASSIVE_COLORS[p.type] ?? '#888' }}>
                          {p.type.charAt(0).toUpperCase() + p.type.slice(1)}
                        </span>
                        <span className={styles.passiveVal}>{arcScales ? `~${scaledBuildup}` : scaledBuildup}</span>
                      </span>
                    );
                  })}
                </div>
              )}
              {talBonus.skillFpCostReduction > 0 && (
                <div className={styles.fpNote}>Skill FP Cost −{Math.round(talBonus.skillFpCostReduction * 100)}%</div>
              )}
              {talBonus.spellFpCostReduction > 0 && (
                <div className={styles.fpNote}>Spell FP Cost −{Math.round(talBonus.spellFpCostReduction * 100)}%</div>
              )}
            </div>
          )}

          {offHandWeapon && offHandAr && (
            <div className={styles.section}>
              <span className={styles.sectionTitle}>
                Left Hand
                <span className={styles.sectionNote}>
                  {offHandWeapon.infusion && offHandWeapon.infusion !== 'Standard'
                    ? `${offHandWeapon.infusion} ${offHandWeapon.name}`
                    : offHandWeapon.name}
                </span>
              </span>
              <div className={styles.totalArRow}>
                <span className={styles.totalArLabel}>Total AR</span>
                <span className={styles.totalArValue}>~{offHandAr.total}</span>
              </div>
              {DMG_TYPES.map(({ key, label, color, tooltip }, i) => {
                const v = offHandAr[key as keyof typeof offHandAr] as number;
                if (!v || v <= 0) return null;
                return (
                  <div key={key} className={styles.row}>
                    <span className={styles.rowLabel}><span className={styles.infoIcon} data-tooltip={tooltip}>?</span> {label}</span>
                    <div className={styles.barTrack}>
                      <div
                        className={styles.barFill}
                        style={{
                          width: ready ? `${Math.min((v / 650) * 100, 100)}%` : '0%',
                          background: color,
                          transitionDelay: `${320 + i * 60}ms`,
                        }}
                      />
                    </div>
                    <span className={styles.rowValue}>~{v}</span>
                  </div>
                );
              })}
              {offHandWeapon.passives && offHandWeapon.passives.length > 0 && (
                <div className={styles.passiveRow}>
                  {offHandWeapon.passives.map((p, i) => {
                    const arcGrade = offHandWeapon.scaling?.arc ?? '-';
                    const arcScales = (p.type === 'blood' || p.type === 'poison') && arcGrade !== '-';
                    const scaledBuildup = arcScales
                      ? estimatePassiveBuildup(p.buildup, effectiveStats.arcane, arcGrade)
                      : p.buildup;
                    return (
                      <span key={i} className={styles.passiveBadge} style={{ borderColor: PASSIVE_COLORS[p.type] ?? '#888' }}>
                        <span className={styles.passiveType} style={{ color: PASSIVE_COLORS[p.type] ?? '#888' }}>
                          {p.type.charAt(0).toUpperCase() + p.type.slice(1)}
                        </span>
                        <span className={styles.passiveVal}>{arcScales ? `~${scaledBuildup}` : scaledBuildup}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {spellCatalysts.length > 0 && (
            <div className={styles.section}>
              <span className={styles.sectionTitle}>Spell Scaling</span>
              {spellCatalysts.map((cat, i) => (
                <div key={i} className={styles.row}>
                  <span className={styles.rowLabel} style={{ color: cat.type === 'Sorcery' ? '#6a9cd4' : '#c4a84c' }}>
                    {cat.type}
                  </span>
                  <div className={styles.barTrack}>
                    <div
                      className={styles.barFill}
                      style={{
                        width: ready ? `${Math.min((cat.scaling / 400) * 100, 100)}%` : '0%',
                        background: cat.type === 'Sorcery' ? '#6a9cd4' : '#c4a84c',
                        transitionDelay: `${300 + i * 60}ms`,
                      }}
                    />
                  </div>
                  <span className={styles.rowValue}>~{cat.scaling}</span>
                </div>
              ))}
              <div className={styles.fpNote}>
                {spellCatalysts.map(c => c.weapon.name).join(', ')}
              </div>
            </div>
          )}

          <div className={styles.section}>
            <span className={styles.sectionTitle}>
              <button
                className={styles.collapseBtn}
                onClick={() => setBuffsOpen(v => !v)}
              >
                {buffsOpen ? '▾' : '▸'} Buffs
              </button>
              {activeBuffIds.length > 0 && (
                <span className={styles.buffCount}>{activeBuffIds.length} active</span>
              )}
            </span>
            {buffsOpen && (
              <div className={styles.buffGrid}>
                {BUFF_LIST.map(buff => (
                  <label key={buff.id} className={styles.buffItem} title={buffTooltip(buff)}>
                    <input
                      type="checkbox"
                      checked={activeBuffIds.includes(buff.id)}
                      onChange={() => toggleBuff(buff.id)}
                      className={styles.buffCheck}
                    />
                    <span className={styles.buffName}>{buff.name}</span>
                    <span className={styles.buffEffect}>{buffTooltip(buff)}</span>
                    <span className={styles.buffDur}>{buff.duration}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {!activeWeapon && !offHandWeapon && spellCatalysts.length === 0 && (
            <div className={styles.section}>
              <span className={styles.fpNote}>No weapons equipped</span>
            </div>
          )}
        </>
      )}

      {/* ══════ TAB: Defense ══════ */}
      {derivedTab === 'defense' && (
        <>
          {hasArmor && (
            <div className={styles.section}>
              <span className={styles.sectionTitle}>Defense / Negation</span>
              {activeBuffIds.length > 0 && (
                <div
                  className={styles.activeBuffNote}
                  onClick={() => { setDerivedTab('attack'); setBuffsOpen(true); }}
                  title="Click to manage buffs"
                >
                  {activeBuffIds.length} buff{activeBuffIds.length > 1 ? 's' : ''} affecting values
                </div>
              )}
              {DEF_TYPES.map(({ key, label, color, indent, tooltip }, i) => (
                <NegRow
                  key={key}
                  label={label}
                  negation={adjNeg[key]}
                  color={color}
                  ready={ready}
                  delay={500 + i * 50}
                  indent={indent}
                  tooltip={tooltip}
                />
              ))}
            </div>
          )}

          {guardBoost != null && equippedShield && (
            <div className={styles.section}>
              <span className={styles.sectionTitle}>Guard</span>
              <div className={styles.row}>
                <span className={styles.rowLabel}><span className={styles.infoIcon} data-tooltip="Stamina efficiency when blocking. Higher = less stamina lost. At 100, blocking costs no stamina.">?</span> Guard Boost</span>
                <div className={`${styles.barTrack} ${styles.barPoise}`}>
                  <div
                    className={styles.barFill}
                    style={{
                      width: ready ? `${Math.min((guardBoost / 100) * 100, 100)}%` : '0%',
                      transitionDelay: '480ms',
                    }}
                  />
                </div>
                <span className={styles.rowValue}>{guardBoost}</span>
              </div>
              {equippedShield.guardNegation && (
                <>
                  {([
                    { key: 'physical',  label: 'Physical',  color: '#c8bfa0' },
                    { key: 'magic',     label: 'Magic',     color: '#6a9cd4' },
                    { key: 'fire',      label: 'Fire',      color: '#d4703c' },
                    { key: 'lightning', label: 'Lightning', color: '#d4c03c' },
                    { key: 'holy',      label: 'Holy',      color: '#c4a84c' },
                  ] as const).map(({ key, label, color }, i) => {
                    const v = equippedShield.guardNegation![key as keyof typeof equippedShield.guardNegation] as number;
                    if (v == null || v <= 0) return null;
                    return (
                      <NegRow
                        key={key}
                        label={label}
                        negation={v}
                        color={color}
                        maxNeg={100}
                        ready={ready}
                        delay={520 + i * 40}
                      />
                    );
                  })}
                </>
              )}
              <div className={styles.fpNote}>{equippedShield.name}</div>
            </div>
          )}

          <div className={styles.section}>
            <span className={styles.sectionTitle}>Poise & Discovery</span>
            {poise > 0 && (
              <div className={styles.row}>
                <span className={styles.rowLabel}><span className={styles.infoIcon} data-tooltip="Resistance to stagger. Higher poise = more hits absorbed without flinching. 51+ is good, 100+ is excellent.">?</span> Poise</span>
                <div className={`${styles.barTrack} ${styles.barPoise}`}>
                  <div
                    className={styles.barFill}
                    style={{
                      width: ready ? `${Math.min((poise / 100) * 100, 100)}%` : '0%',
                      transitionDelay: '900ms',
                    }}
                  />
                </div>
                <span
                  className={styles.rowValue}
                  style={{ color: poise >= 125 ? '#6a9cd4' : poise >= 100 ? '#4ab0e0' : poise >= 76 ? '#6dbf7e' : poise >= 51 ? '#e0a040' : poise >= 26 ? '#d08040' : '#e06060' }}
                >
                  {Math.round(poise * 10) / 10}
                </span>
              </div>
            )}
            <BodyRow label="Discovery" value={discovery} max={250} colorClass={styles.barDisc} ready={ready} delay={1160} tooltip="Affects item drop rates from enemies. Base 100 + Arcane scaling. Silver Scarab talisman adds 75." />
          </div>

          <div className={styles.section}>
            <span className={styles.sectionTitle}>Resistances</span>
            {RESIST_TYPES.map(({ key, label, color, tooltip }, i) => (
              <NegRow
                key={key}
                label={label}
                negation={resist[key]}
                color={color}
                maxNeg={300}
                ready={ready}
                delay={960 + i * 50}
                isFlat
                tooltip={tooltip}
              />
            ))}
          </div>
        </>
      )}

    </div>
  );
}
