import { useState, useMemo, useEffect } from 'react';
import type {
  CharacterStats,
  EquippedItems,
  EquippedWeapon,
  Inventory,
  ResolvedInventoryItem,
} from '../../types';
import { estimateEquippedAR } from '../../utils/arCalc';
import styles from './WeaponCompare.module.css';

interface Props {
  stats: CharacterStats;
  equipped: EquippedItems;
  inventory: Inventory;
}

// ── Helpers ──────────────────────────────────────────────────

const EMPTY_RAW_ID = 0xFFFFFFFF;

/** Convert a ResolvedInventoryItem to an EquippedWeapon-like shape for AR calc */
function toEquippedWeapon(item: ResolvedInventoryItem): EquippedWeapon {
  return {
    rawId: item.itemId,
    baseId: item.baseId,
    name: item.name,
    upgradeLevel: item.upgradeLevel,
    infusion: item.infusion,
    image: item.image,
    damage: item.damage,
    scaling: item.scaling,
    requirements: item.requirements,
    passives: item.passives,
    weight: item.weight,
    critical: item.critical,
    itemType: item.itemType,
    skill: item.skill,
    skillFpCost: item.skillFpCost,
    defense: item.defense,
    poise: item.poise,
    damageTypes: item.damageTypes,
    stability: item.stability,
    guardNegation: item.guardNegation,
  };
}

/** Build a unique key for a weapon to use as select value */
function weaponKey(w: EquippedWeapon, source: 'eq' | 'inv', idx: number): string {
  return `${source}-${idx}-${w.baseId}-${w.upgradeLevel ?? 0}`;
}

/** Format weapon name with upgrade level */
function displayName(w: EquippedWeapon): string {
  const lvl = w.upgradeLevel ?? 0;
  const plus = lvl > 0 ? ` +${lvl}` : '';
  const inf = w.infusion && w.infusion !== 'Standard' && w.infusion !== 'None'
    ? ` [${w.infusion}]` : '';
  return `${w.name ?? 'Unknown'}${plus}${inf}`;
}

/** Damage types in display order */
const DMG_TYPES = ['physical', 'magic', 'fire', 'lightning', 'holy'] as const;
type DmgType = typeof DMG_TYPES[number];

/** Colors per damage type */
const DMG_COLOR: Record<DmgType, string> = {
  physical:  '#c8bfa0',
  magic:     '#6a9cd4',
  fire:      '#d4703c',
  lightning: '#d4c03c',
  holy:      '#c4a84c',
};

/** Scaling stats in display order */
const SCALE_STATS = ['str', 'dex', 'int', 'fai', 'arc'] as const;
type ScaleStat = typeof SCALE_STATS[number];

const SCALE_LABEL: Record<ScaleStat, string> = {
  str: 'STR', dex: 'DEX', int: 'INT', fai: 'FAI', arc: 'ARC',
};

/** Map scaling stat abbreviation to CharacterStats key */
const STAT_KEY: Record<ScaleStat, keyof CharacterStats> = {
  str: 'strength', dex: 'dexterity', int: 'intelligence', fai: 'faith', arc: 'arcane',
};

const GRADE_CLASS: Record<string, string> = {
  S: styles.gradeS, A: styles.gradeA, B: styles.gradeB,
  C: styles.gradeC, D: styles.gradeD, E: styles.gradeE,
};

/** Passive type colors */
const PASSIVE_COLOR: Record<string, string> = {
  blood:   '#c06060',
  frost:   '#70b0d0',
  poison:  '#6a9a3a',
  rot:     '#c07030',
  sleep:   '#8070b0',
  madness: '#c0a020',
  death:   '#808080',
};

const PASSIVE_LABEL: Record<string, string> = {
  blood: 'Bleed', frost: 'Frost', poison: 'Poison', rot: 'Scarlet Rot',
  sleep: 'Sleep', madness: 'Madness', death: 'Death Blight',
};

// ── Weapon entry type for the select lists ───────────────────

interface WeaponEntry {
  key: string;
  weapon: EquippedWeapon;
  label: string;
  source: 'equipped' | 'inventory';
}

// ── Component ────────────────────────────────────────────────

export default function WeaponCompare({ stats, equipped, inventory }: Props) {
  // Build the full weapon list from equipped + inventory
  const weaponList = useMemo<WeaponEntry[]>(() => {
    const entries: WeaponEntry[] = [];

    // Equipped weapons (right hand + left hand)
    const allEquipped = [...equipped.rightHand, ...equipped.leftHand];
    allEquipped.forEach((w, i) => {
      if (!w.name || w.rawId === EMPTY_RAW_ID) return;
      entries.push({
        key: weaponKey(w, 'eq', i),
        weapon: w,
        label: `[E] ${displayName(w)}`,
        source: 'equipped',
      });
    });

    // Inventory weapons
    inventory.weapons.forEach((item, i) => {
      if (!item.name) return;
      const w = toEquippedWeapon(item);
      entries.push({
        key: weaponKey(w, 'inv', i),
        weapon: w,
        label: displayName(w),
        source: 'inventory',
      });
    });

    return entries;
  }, [equipped, inventory]);

  // Default: first two equipped weapons, or first two from the list
  const defaultKeys = useMemo(() => {
    const equippedEntries = weaponList.filter(e => e.source === 'equipped');
    const k1 = equippedEntries[0]?.key ?? weaponList[0]?.key ?? '';
    const k2 = equippedEntries[1]?.key ?? weaponList[1]?.key ?? '';
    return [k1, k2 !== k1 ? k2 : ''] as const;
  }, [weaponList]);

  const [selectedKey1, setSelectedKey1] = useState('');
  const [selectedKey2, setSelectedKey2] = useState('');

  // Reset selection when character changes
  useEffect(() => {
    setSelectedKey1('');
    setSelectedKey2('');
  }, [equipped, inventory]);

  // Resolve actual keys (use defaults until user picks)
  const key1 = selectedKey1 || defaultKeys[0];
  const key2 = selectedKey2 || defaultKeys[1];

  const entry1 = weaponList.find(e => e.key === key1) ?? null;
  const entry2 = weaponList.find(e => e.key === key2) ?? null;

  // AR calculations
  const ar1 = useMemo(
    () => entry1?.weapon.damage ? estimateEquippedAR(entry1.weapon, stats) : null,
    [entry1, stats],
  );
  const ar2 = useMemo(
    () => entry2?.weapon.damage ? estimateEquippedAR(entry2.weapon, stats) : null,
    [entry2, stats],
  );

  // Per-type max for proportional bars
  const maxByType = useMemo(() => {
    const result: Record<DmgType, number> = { physical: 1, magic: 1, fire: 1, lightning: 1, holy: 1 };
    for (const t of DMG_TYPES) {
      result[t] = Math.max(ar1?.[t] ?? 0, ar2?.[t] ?? 0, 1);
    }
    return result;
  }, [ar1, ar2]);

  if (weaponList.length === 0) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.title}>Weapon Compare</div>
        </div>
        <div className={styles.emptyState}>No weapons available to compare.</div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      {/* ── Header with selectors ── */}
      <div className={styles.header}>
        <div className={styles.title}>Weapon Compare</div>
        <div className={styles.selectorRow}>
          <select
            className={styles.weaponSelect}
            value={key1}
            onChange={e => setSelectedKey1(e.target.value)}
          >
            <option value="" disabled>Select weapon 1</option>
            {weaponList.map(e => (
              <option key={e.key} value={e.key}>{e.label}</option>
            ))}
          </select>
          <span className={styles.vsLabel}>vs</span>
          <select
            className={styles.weaponSelect}
            value={key2}
            onChange={e => setSelectedKey2(e.target.value)}
          >
            <option value="" disabled>Select weapon 2</option>
            {weaponList.map(e => (
              <option key={e.key} value={e.key}>{e.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Comparison body ── */}
      <div className={styles.compareBody}>
        {(!entry1 && !entry2) ? (
          <div className={styles.emptyState}>Select two weapons to compare.</div>
        ) : (
          <>
            {/* ── Name + Type ── */}
            <div className={styles.section}>
              <div className={styles.compRow}>
                <WeaponIdentity weapon={entry1?.weapon ?? null} />
                <WeaponIdentity weapon={entry2?.weapon ?? null} />
              </div>
            </div>

            {/* ── Total AR ── */}
            <div className={styles.section}>
              <span className={styles.sectionLabel}>Attack Rating</span>
              <div className={styles.compRow}>
                <ARTotalCell ar={ar1} otherAr={ar2} />
                <ARTotalCell ar={ar2} otherAr={ar1} />
              </div>

              {/* Per-type bars */}
              {DMG_TYPES.map(t => {
                const v1 = ar1?.[t] ?? 0;
                const v2 = ar2?.[t] ?? 0;
                if (v1 === 0 && v2 === 0) return null;
                const max = maxByType[t];
                return (
                  <div key={t} className={styles.compRow} style={{ marginTop: '0.15rem' }}>
                    <ARBarCell type={t} value={v1} max={max} isWinner={v1 > v2} />
                    <ARBarCell type={t} value={v2} max={max} isWinner={v2 > v1} />
                  </div>
                );
              })}
            </div>

            {/* ── Scaling ── */}
            <div className={styles.section}>
              <span className={styles.sectionLabel}>Scaling</span>
              <div className={styles.compRow}>
                <ScalingCell weapon={entry1?.weapon ?? null} />
                <ScalingCell weapon={entry2?.weapon ?? null} />
              </div>
            </div>

            {/* ── Requirements ── */}
            <div className={styles.section}>
              <span className={styles.sectionLabel}>Requirements</span>
              <div className={styles.compRow}>
                <RequirementsCell weapon={entry1?.weapon ?? null} stats={stats} />
                <RequirementsCell weapon={entry2?.weapon ?? null} stats={stats} />
              </div>
            </div>

            {/* ── Passive Effects ── */}
            <div className={styles.section}>
              <span className={styles.sectionLabel}>Passives</span>
              <div className={styles.compRow}>
                <PassivesCell weapon={entry1?.weapon ?? null} />
                <PassivesCell weapon={entry2?.weapon ?? null} />
              </div>
            </div>

            {/* ── Skill (Ash of War) ── */}
            <div className={styles.section}>
              <span className={styles.sectionLabel}>Skill</span>
              <div className={styles.compRow}>
                <SkillCell weapon={entry1?.weapon ?? null} />
                <SkillCell weapon={entry2?.weapon ?? null} />
              </div>
            </div>

            {/* ── Weight + Critical ── */}
            <div className={styles.section}>
              <span className={styles.sectionLabel}>Misc</span>
              <div className={styles.compRow}>
                <MiscCell
                  weapon={entry1?.weapon ?? null}
                  otherWeapon={entry2?.weapon ?? null}
                />
                <MiscCell
                  weapon={entry2?.weapon ?? null}
                  otherWeapon={entry1?.weapon ?? null}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function WeaponIdentity({ weapon }: { weapon: EquippedWeapon | null }) {
  if (!weapon) return <div />;
  return (
    <div>
      <div className={styles.weaponName}>{displayName(weapon)}</div>
      <div className={styles.weaponType}>{weapon.itemType ?? ''}</div>
    </div>
  );
}

type ARResult = { physical: number; magic: number; fire: number; lightning: number; holy: number; total: number };

function ARTotalCell({ ar, otherAr }: { ar: ARResult | null; otherAr: ARResult | null }) {
  if (!ar) return <div className={styles.arTotal}>--</div>;
  // Only show winner when both weapons have AR values
  const bothPresent = ar && otherAr;
  const isWinner = bothPresent && ar.total > otherAr.total;
  const isTie = bothPresent && ar.total === otherAr.total;
  return (
    <div className={`${isWinner && !isTie ? styles.winnerCell : ''}`}>
      <span className={`${styles.arTotal} ${isWinner && !isTie ? styles.arWinner : ''}`}>
        {ar.total}
        {isWinner && !isTie && <span className={styles.winnerStar}>&#9733;</span>}
      </span>
    </div>
  );
}

function ARBarCell({
  type,
  value,
  max,
  isWinner,
}: { type: DmgType; value: number; max: number; isWinner: boolean }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className={`${styles.arBar} ${isWinner && value > 0 ? styles.winnerCell : ''}`}>
      <span className={styles.arBarLabel} style={{ color: DMG_COLOR[type] }}>
        {type}
      </span>
      <div className={styles.arBarTrack}>
        <div
          className={styles.arBarFill}
          style={{
            width: `${pct}%`,
            background: DMG_COLOR[type],
            opacity: value > 0 ? 0.7 : 0,
          }}
        />
      </div>
      <span className={styles.arBarValue}>{value > 0 ? value : ''}</span>
    </div>
  );
}

function ScalingCell({ weapon }: { weapon: EquippedWeapon | null }) {
  if (!weapon?.scaling) return <div className={styles.scalingRow}>--</div>;
  return (
    <div className={styles.scalingRow}>
      {SCALE_STATS.map(s => {
        const grade = weapon.scaling![s]?.toUpperCase() ?? '-';
        if (grade === '-') return null;
        const cls = GRADE_CLASS[grade] ?? '';
        return (
          <span key={s} className={`${styles.scalingBadge} ${cls}`}>
            {SCALE_LABEL[s]} {grade}
          </span>
        );
      })}
    </div>
  );
}

function RequirementsCell({ weapon, stats }: { weapon: EquippedWeapon | null; stats: CharacterStats }) {
  if (!weapon?.requirements) return <div className={styles.reqRow}>--</div>;
  const req = weapon.requirements;
  return (
    <div className={styles.reqRow}>
      {SCALE_STATS.map(s => {
        const reqVal = req[s] ?? 0;
        if (reqVal <= 0) return null;
        const playerVal = stats[STAT_KEY[s]] as number;
        const met = playerVal >= reqVal;
        return (
          <span
            key={s}
            className={`${styles.reqBadge} ${met ? styles.reqMet : styles.reqUnmet}`}
          >
            {SCALE_LABEL[s]} {reqVal}
          </span>
        );
      })}
    </div>
  );
}

function PassivesCell({ weapon }: { weapon: EquippedWeapon | null }) {
  if (!weapon?.passives || weapon.passives.length === 0) {
    return (
      <div className={styles.passiveRow}>
        <span className={styles.noPassive}>&mdash;</span>
      </div>
    );
  }
  return (
    <div className={styles.passiveRow}>
      {weapon.passives.map((p, i) => (
        <span
          key={i}
          className={styles.passiveBadge}
          style={{
            color: PASSIVE_COLOR[p.type] ?? 'var(--text-dim)',
            borderColor: PASSIVE_COLOR[p.type] ?? 'var(--border)',
          }}
        >
          {PASSIVE_LABEL[p.type] ?? p.type} {p.buildup}
        </span>
      ))}
    </div>
  );
}

function SkillCell({ weapon }: { weapon: EquippedWeapon | null }) {
  if (!weapon?.skill) {
    return <div><span className={styles.noSkill}>&mdash;</span></div>;
  }
  return (
    <div>
      <span className={styles.skillName}>{weapon.skill}</span>
      {weapon.skillFpCost && weapon.skillFpCost.length > 0 && (
        <span className={styles.skillFp}>
          FP {weapon.skillFpCost.join('/')}
        </span>
      )}
    </div>
  );
}

function MiscCell({
  weapon,
  otherWeapon,
}: { weapon: EquippedWeapon | null; otherWeapon: EquippedWeapon | null }) {
  if (!weapon) return <div />;

  const w = weapon.weight ?? 0;
  const ow = otherWeapon?.weight ?? 0;
  // Lower weight is better
  const weightWinner = w < ow && w > 0;

  const c = weapon.critical ?? 100;
  const oc = otherWeapon?.critical ?? 100;
  const critWinner = c > oc;

  return (
    <div className={styles.miscGrid}>
      <span className={styles.miscLabel}>Weight</span>
      <span className={`${styles.miscValue} ${weightWinner ? styles.arWinner : ''}`}>
        {w.toFixed(1)}
      </span>
      <span className={styles.miscLabel}>Critical</span>
      <span className={`${styles.miscValue} ${critWinner ? styles.arWinner : ''}`}>
        {c}
      </span>
    </div>
  );
}
