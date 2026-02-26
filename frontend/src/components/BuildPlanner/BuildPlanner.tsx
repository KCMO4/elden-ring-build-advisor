import { useState, useMemo, useCallback, useEffect } from 'react';
import type { CharacterStats, EquippedItems, EquippedWeapon } from '../../types';
import { estimateEquippedAR } from '../../utils/arCalc';
import { computeTalismanBonuses } from '../../utils/talismanEffects';
import styles from './BuildPlanner.module.css';

interface Props {
  stats: CharacterStats;
  level: number;
  equipped: EquippedItems;
}

// ── Stat definitions ─────────────────────────────────────────

type StatKey = keyof CharacterStats;

interface StatDef {
  key: StatKey;
  abbr: string;
  label: string;
  colorClass: string;
}

const STAT_DEFS: StatDef[] = [
  { key: 'vigor',        abbr: 'VIG', label: 'Vigor',        colorClass: styles.colVig },
  { key: 'mind',         abbr: 'MND', label: 'Mind',         colorClass: styles.colMnd },
  { key: 'endurance',    abbr: 'END', label: 'Endurance',    colorClass: styles.colEnd },
  { key: 'strength',     abbr: 'STR', label: 'Strength',     colorClass: styles.colStr },
  { key: 'dexterity',    abbr: 'DEX', label: 'Dexterity',    colorClass: styles.colDex },
  { key: 'intelligence', abbr: 'INT', label: 'Intelligence', colorClass: styles.colInt },
  { key: 'faith',        abbr: 'FAI', label: 'Faith',        colorClass: styles.colFai },
  { key: 'arcane',       abbr: 'ARC', label: 'Arcane',       colorClass: styles.colArc },
];

// ── Derived stat formulas (exact Elden Ring curves) ──────────

function calcHP(vig: number): number {
  const v = Math.min(99, Math.max(1, vig));
  if (v <= 25) return Math.floor(300 + 500 * Math.pow((v - 1) / 24, 1.5));
  if (v <= 40) return Math.floor(800 + 650 * Math.pow((v - 25) / 15, 1.1));
  if (v <= 60) return Math.floor(1450 + 450 * (1 - Math.pow(1 - (v - 40) / 20, 1.2)));
  return Math.floor(1900 + 200 * (1 - Math.pow(1 - (v - 60) / 39, 1.2)));
}

function calcFP(mnd: number): number {
  const m = Math.min(99, Math.max(1, mnd));
  if (m <= 15) return Math.floor(50 + 45 * ((m - 1) / 14));
  if (m <= 35) return Math.floor(95 + 105 * ((m - 15) / 20));
  if (m <= 60) return Math.floor(200 + 150 * (1 - Math.pow(1 - (m - 35) / 25, 1.2)));
  return Math.floor(350 + 100 * ((m - 60) / 39));
}

function calcStamina(end: number): number {
  const e = Math.min(99, Math.max(1, end));
  if (e <= 15) return Math.floor(80 + 25 * ((e - 1) / 14));
  if (e <= 30) return Math.floor(105 + 25 * ((e - 15) / 15));
  if (e <= 50) return Math.floor(130 + 25 * ((e - 30) / 20));
  return Math.floor(155 + 15 * ((e - 50) / 49));
}

function calcMaxEquipLoad(end: number): number {
  const e = Math.min(99, Math.max(1, end));
  if (e <= 8) return Math.round((25 + 20 * ((e - 1) / 7)) * 10) / 10;
  if (e <= 25) return Math.round((45 + 27 * ((e - 8) / 17)) * 10) / 10;
  if (e <= 60) return Math.round((72 + 48 * Math.pow((e - 25) / 35, 1.1)) * 10) / 10;
  return Math.round((120 + 40 * ((e - 60) / 39)) * 10) / 10;
}

function runeCostForLevel(targetLevel: number): number {
  if (targetLevel <= 1) return 0;
  const L = targetLevel - 1;
  const x = Math.max(0, (L - 11) * 0.02);
  return Math.floor((x + 0.1) * (L + 81) ** 2 + 1 + 1e-6);
}

// ── Total rune cost between two levels ──────────────────────

function totalRuneCost(fromLevel: number, toLevel: number): number {
  if (toLevel <= fromLevel) return 0;
  let total = 0;
  for (let l = fromLevel + 1; l <= toLevel; l++) {
    total += runeCostForLevel(l);
  }
  return total;
}

// ── Helpers ──────────────────────────────────────────────────

function totalStats(s: CharacterStats): number {
  return s.vigor + s.mind + s.endurance + s.strength +
    s.dexterity + s.intelligence + s.faith + s.arcane;
}

function getEquippedWeapons(equipped: EquippedItems): EquippedWeapon[] {
  return [...equipped.rightHand, ...equipped.leftHand]
    .filter(w => w.name && w.damage);
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/** Render a delta badge: +N green, -N red, nothing for 0 */
function DeltaBadge({ value, className }: { value: number; className?: string }) {
  if (value === 0) return null;
  const cls = value > 0 ? styles.positive : styles.negative;
  const prefix = value > 0 ? '+' : '';
  return (
    <span className={`${className ?? ''} ${cls}`}>
      ({prefix}{formatNumber(value)})
    </span>
  );
}

// ── Component ────────────────────────────────────────────────

export default function BuildPlanner({ stats, level, equipped }: Props) {
  const [simStats, setSimStats] = useState<CharacterStats>({ ...stats });

  // Reset simStats when character changes
  useEffect(() => {
    setSimStats({ ...stats });
  }, [stats]);

  const handleChange = useCallback((key: StatKey, value: number) => {
    setSimStats(prev => ({ ...prev, [key]: Math.max(1, Math.min(99, value)) }));
  }, []);

  const handleReset = useCallback(() => {
    setSimStats({ ...stats });
  }, [stats]);

  // ── Talisman bonuses (constant across sim) ─────────────────

  const talismanBonuses = useMemo(
    () => computeTalismanBonuses(equipped.talismans),
    [equipped.talismans],
  );

  // ── Effective stats (base + talisman attr bonuses) ─────────

  const effectiveStats = useMemo(() => {
    const a = talismanBonuses.attrs;
    return {
      vigor:        Math.min(99, stats.vigor        + (a.vigor ?? 0)),
      mind:         Math.min(99, stats.mind         + (a.mind ?? 0)),
      endurance:    Math.min(99, stats.endurance    + (a.endurance ?? 0)),
      strength:     Math.min(99, stats.strength     + (a.strength ?? 0)),
      dexterity:    Math.min(99, stats.dexterity    + (a.dexterity ?? 0)),
      intelligence: Math.min(99, stats.intelligence + (a.intelligence ?? 0)),
      faith:        Math.min(99, stats.faith        + (a.faith ?? 0)),
      arcane:       Math.min(99, stats.arcane       + (a.arcane ?? 0)),
    };
  }, [stats, talismanBonuses.attrs]);

  const effectiveSimStats = useMemo(() => {
    const a = talismanBonuses.attrs;
    return {
      vigor:        Math.min(99, simStats.vigor        + (a.vigor ?? 0)),
      mind:         Math.min(99, simStats.mind         + (a.mind ?? 0)),
      endurance:    Math.min(99, simStats.endurance    + (a.endurance ?? 0)),
      strength:     Math.min(99, simStats.strength     + (a.strength ?? 0)),
      dexterity:    Math.min(99, simStats.dexterity    + (a.dexterity ?? 0)),
      intelligence: Math.min(99, simStats.intelligence + (a.intelligence ?? 0)),
      faith:        Math.min(99, simStats.faith        + (a.faith ?? 0)),
      arcane:       Math.min(99, simStats.arcane       + (a.arcane ?? 0)),
    };
  }, [simStats, talismanBonuses.attrs]);

  // ── Derived values ──────────────────────────────────────────

  const simLevel = useMemo(() => totalStats(simStats) - 79, [simStats]);
  const pointsDelta = simLevel - level;

  const { hpBonus, fpBonus, staminaBonus, equipLoadBonus } = talismanBonuses;

  const origDerived = useMemo(() => ({
    hp:        Math.floor(calcHP(effectiveStats.vigor) * (1 + hpBonus)),
    fp:        Math.floor(calcFP(effectiveStats.mind) * (1 + fpBonus)),
    stamina:   Math.floor(calcStamina(effectiveStats.endurance) * (1 + staminaBonus)),
    equipLoad: Math.round(calcMaxEquipLoad(effectiveStats.endurance) * (1 + equipLoadBonus) * 10) / 10,
  }), [effectiveStats, hpBonus, fpBonus, staminaBonus, equipLoadBonus]);

  const simDerived = useMemo(() => ({
    hp:        Math.floor(calcHP(effectiveSimStats.vigor) * (1 + hpBonus)),
    fp:        Math.floor(calcFP(effectiveSimStats.mind) * (1 + fpBonus)),
    stamina:   Math.floor(calcStamina(effectiveSimStats.endurance) * (1 + staminaBonus)),
    equipLoad: Math.round(calcMaxEquipLoad(effectiveSimStats.endurance) * (1 + equipLoadBonus) * 10) / 10,
  }), [effectiveSimStats, hpBonus, fpBonus, staminaBonus, equipLoadBonus]);

  const runeCost = useMemo(
    () => simLevel > level ? totalRuneCost(level, simLevel) : 0,
    [level, simLevel],
  );

  // ── Weapon AR ───────────────────────────────────────────────

  const weapons = useMemo(() => getEquippedWeapons(equipped), [equipped]);

  const weaponAR = useMemo(() => weapons.map(w => ({
    weapon: w,
    orig: estimateEquippedAR(w, effectiveStats),
    sim:  estimateEquippedAR(w, effectiveSimStats),
  })), [weapons, effectiveStats, effectiveSimStats]);

  // ── Inline derived stat for each row ────────────────────────

  const inlineDerived: Record<StatKey, { label: string; sim: string; delta: number } | null> = useMemo(() => ({
    vigor:        { label: 'HP',   sim: `${simDerived.hp}`,                   delta: simDerived.hp - origDerived.hp },
    mind:         { label: 'FP',   sim: `${simDerived.fp}`,                   delta: simDerived.fp - origDerived.fp },
    endurance:    { label: 'Stam', sim: `${simDerived.stamina} / ${simDerived.equipLoad.toFixed(1)}`, delta: simDerived.stamina - origDerived.stamina },
    strength:     null,
    dexterity:    null,
    intelligence: null,
    faith:        null,
    arcane:       null,
  }), [origDerived, simDerived]);

  // ── Check if anything changed ───────────────────────────────

  const isModified = useMemo(() =>
    STAT_DEFS.some(({ key }) => simStats[key] !== stats[key]),
    [simStats, stats],
  );

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.title}>Build Planner</span>
        <div className={styles.headerRight}>
          {isModified && (
            <button className={styles.resetBtn} onClick={handleReset}>
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Level / Points summary */}
      <div className={styles.summary}>
        <div className={styles.levelBlock}>
          <span className={styles.levelLabel}>Level</span>
          <span className={styles.levelValue}>{level}</span>
          {pointsDelta !== 0 && (
            <>
              <span className={styles.levelArrow}>&rarr;</span>
              <span className={styles.levelSim}>{simLevel}</span>
              <DeltaBadge value={pointsDelta} className={styles.pointsDelta} />
            </>
          )}
        </div>

        {runeCost > 0 && (
          <div className={styles.runeBlock}>
            <span className={styles.runeLabel}>Runes needed</span>
            <span className={styles.runeValue}>{formatNumber(runeCost)}</span>
          </div>
        )}
      </div>

      {/* Stat sliders */}
      <div className={styles.body}>
        {STAT_DEFS.map(({ key, abbr, colorClass }) => {
          const orig = stats[key];
          const sim  = simStats[key];
          const derived = inlineDerived[key];
          return (
            <div key={key} className={`${styles.statRow} ${colorClass}`}>
              <span className={styles.statLabel}>{abbr}</span>

              <input
                type="range"
                className={styles.slider}
                min={1}
                max={99}
                value={sim}
                onChange={e => handleChange(key, Number(e.target.value))}
              />

              <span className={styles.statValue}>{sim}</span>

              <div className={styles.derivedInline}>
                {derived ? (
                  <>
                    <span className={styles.derivedLabel}>{derived.label}</span>
                    <span className={styles.derivedVal}>{derived.sim}</span>
                    <DeltaBadge value={derived.delta} className={styles.derivedDelta} />
                  </>
                ) : (
                  /* Show stat delta for stats without a derived value */
                  sim !== orig ? (
                    <DeltaBadge value={sim - orig} className={styles.derivedDelta} />
                  ) : null
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Weapon AR section */}
      <div className={styles.arSection}>
        <div className={styles.arTitle}>Weapon AR</div>
        {weapons.length === 0 ? (
          <div className={styles.arEmpty}>No weapons equipped</div>
        ) : (
          <div className={styles.arList}>
            {weaponAR.map(({ weapon, orig, sim }) => {
              const delta = sim.total - orig.total;
              const displayName = weapon.name ?? 'Unknown';
              const upgrade = weapon.upgradeLevel ? ` +${weapon.upgradeLevel}` : '';
              return (
                <div key={`${weapon.rawId}-${weapon.baseId}`} className={styles.arRow}>
                  <span className={styles.arName}>
                    {displayName}{upgrade}
                  </span>
                  <div className={styles.arValues}>
                    <span className={styles.arCurrent}>{orig.total}</span>
                    {delta !== 0 && (
                      <>
                        <span className={styles.arArrow}>&rarr;</span>
                        <span className={styles.arSim}>{sim.total}</span>
                        <DeltaBadge value={delta} className={styles.arDelta} />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
