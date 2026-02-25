import { useMemo } from 'react';
import type { Inventory } from '../../types';
import styles from './MatchmakingCalc.module.css';

interface Props {
  level: number;
  inventory: Inventory;
}

// ── Matchmaking formulas (community reverse-engineered) ──────

function coopRange(level: number): { min: number; max: number } {
  const margin = Math.floor(level * 0.1) + 10;
  return { min: Math.max(1, level - margin), max: level + margin };
}

function invasionRangeAsHost(level: number): { min: number; max: number } {
  return {
    min: Math.max(1, level - Math.floor(level * 0.1)),
    max: level + Math.floor(level * 0.1) + 20,
  };
}

function invasionRangeAsInvader(level: number): { min: number; max: number } {
  return {
    min: Math.max(1, level - Math.floor(level * 0.1) - 20),
    max: level + Math.floor(level * 0.1),
  };
}

function duelistRange(level: number): { min: number; max: number } {
  const margin = Math.floor(level * 0.05) + 10;
  return { min: Math.max(1, level - margin), max: level + margin };
}

// ── Weapon upgrade level tiers ──────────────────────────────
// Matchmaking also considers max weapon upgrade level

const UPGRADE_TIERS_STANDARD = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25];
const UPGRADE_TIERS_SOMBER   = [0,1,2,3,4,5,6,7,8,9,10];

function weaponUpgradeRange(maxLevel: number, isSomber: boolean): { min: number; max: number } {
  const tiers = isSomber ? UPGRADE_TIERS_SOMBER : UPGRADE_TIERS_STANDARD;
  const idx = Math.min(maxLevel, tiers.length - 1);

  // Matchmaking allows ±2 upgrade tiers for standard, ±1 for somber equivalent
  const margin = isSomber ? 1 : 2;
  return {
    min: Math.max(0, tiers[idx] - margin),
    max: Math.min(tiers[tiers.length - 1], tiers[idx] + margin),
  };
}

function findMaxWeaponUpgrade(inventory: Inventory): { level: number; somber: boolean; weaponName: string } {
  let maxLevel = 0;
  let somber = false;
  let weaponName = '';

  for (const w of inventory.weapons) {
    const lvl = w.upgradeLevel ?? 0;
    if (lvl > maxLevel) {
      maxLevel = lvl;
      somber = lvl <= 10 && lvl > 0;
      weaponName = w.name;
    }
  }

  return { level: maxLevel, somber, weaponName };
}

// ── Component ───────────────────────────────────────────────

interface RangeRowProps {
  label: string;
  range: { min: number; max: number };
  color: string;
  description: string;
}

function RangeRow({ label, range, color, description }: RangeRowProps) {
  return (
    <div className={styles.rangeRow}>
      <div className={styles.rangeHeader}>
        <span className={styles.rangeLabel} style={{ color }}>{label}</span>
        <span className={styles.rangeValues}>{range.min} — {range.max}</span>
      </div>
      <div className={styles.rangeDesc}>{description}</div>
      <div className={styles.rangeBar}>
        <div className={styles.rangeBarFill} style={{ background: color, width: '100%', opacity: 0.3 }} />
        <span className={styles.rangeMin}>{range.min}</span>
        <span className={styles.rangeMax}>{range.max}</span>
      </div>
    </div>
  );
}

export default function MatchmakingCalc({ level, inventory }: Props) {
  const coop = useMemo(() => coopRange(level), [level]);
  const hostInvasion = useMemo(() => invasionRangeAsHost(level), [level]);
  const invaderInvasion = useMemo(() => invasionRangeAsInvader(level), [level]);
  const duelist = useMemo(() => duelistRange(level), [level]);
  const maxUpgrade = useMemo(() => findMaxWeaponUpgrade(inventory), [inventory]);
  const upgradeRange = useMemo(
    () => weaponUpgradeRange(maxUpgrade.level, maxUpgrade.somber),
    [maxUpgrade],
  );

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Matchmaking Ranges</h3>
        <div className={styles.stats}>
          <span className={styles.statBadge}>Level {level}</span>
          {maxUpgrade.level > 0 && (
            <span className={styles.statBadge}>
              Max Upgrade +{maxUpgrade.level} {maxUpgrade.somber ? '(Somber)' : '(Standard)'}
            </span>
          )}
        </div>
      </div>

      <div className={styles.ranges}>
        <RangeRow
          label="Co-op (Summon Sign)"
          range={coop}
          color="#6ab54a"
          description="You can summon / be summoned by players in this range"
        />
        <RangeRow
          label="Invasion (As Host)"
          range={hostInvasion}
          color="#d4483c"
          description="Invaders at these levels can enter your world"
        />
        <RangeRow
          label="Invasion (As Invader)"
          range={invaderInvasion}
          color="#e07840"
          description="Worlds you can invade are at these levels"
        />
        <RangeRow
          label="Duelist (Summoning Pools)"
          range={duelist}
          color="#6a9cd4"
          description="Dueling range is tighter than co-op"
        />
      </div>

      {maxUpgrade.level > 0 && (
        <div className={styles.upgradeSection}>
          <div className={styles.sectionTitle}>Weapon Upgrade Factor</div>
          <div className={styles.upgradeInfo}>
            <span className={styles.upgradeLabel}>Max weapon:</span>
            <span className={styles.upgradeName}>{maxUpgrade.weaponName} +{maxUpgrade.level}</span>
          </div>
          <div className={styles.upgradeInfo}>
            <span className={styles.upgradeLabel}>Matches with:</span>
            <span className={styles.upgradeName}>
              +{upgradeRange.min} to +{upgradeRange.max}
              {maxUpgrade.somber ? ' (Somber)' : ' (Standard)'}
            </span>
          </div>
          <p className={styles.note}>
            Weapon upgrade level and rune level BOTH must overlap for matchmaking to connect players.
          </p>
        </div>
      )}

      <div className={styles.formulaSection}>
        <div className={styles.sectionTitle}>Formulas</div>
        <div className={styles.formula}>Co-op: Level ± (Level × 10% + 10)</div>
        <div className={styles.formula}>Invasion Host: Level − 10% to Level + 10% + 20</div>
        <div className={styles.formula}>Invasion Invader: Level − 10% − 20 to Level + 10%</div>
        <div className={styles.formula}>Duelist: Level ± (Level × 5% + 10)</div>
      </div>
    </div>
  );
}
