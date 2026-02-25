import type { CharacterStats, EquippedWeapon } from '../../types';
import { useMountAnimation } from '../../hooks/useMountAnimation';
import { computeTalismanBonuses } from '../../utils/talismanEffects';
import styles from './StatsPanel.module.css';

interface Props {
  stats:     CharacterStats;
  talismans?: readonly EquippedWeapon[];
}

interface StatDef {
  key: keyof CharacterStats;
  abbr: string;
  label: string;
  colorClass: string;
  caps: number[];
  desc: string;
}

const STAT_DEFS: StatDef[] = [
  { key: 'vigor',        abbr: 'VIG', label: 'Vigor',        colorClass: styles.colVig, caps: [25, 40, 60], desc: 'Increases maximum HP. Also boosts Immunity (poison/rot resistance). Major softcaps at 40 and 60.' },
  { key: 'mind',         abbr: 'MND', label: 'Mind',         colorClass: styles.colMnd, caps: [15, 35, 60], desc: 'Increases maximum FP for spells and weapon skills. Also boosts Focus (madness/sleep resistance). Softcaps at 35 and 60.' },
  { key: 'endurance',    abbr: 'END', label: 'Endurance',    colorClass: styles.colEnd, caps: [15, 30, 50], desc: 'Increases maximum Stamina and Equip Load. Also boosts Robustness (bleed/frost resistance). Softcaps at 30 and 50.' },
  { key: 'strength',     abbr: 'STR', label: 'Strength',     colorClass: styles.colStr, caps: [18, 60, 80], desc: 'Increases damage with STR-scaling weapons. Required for heavy weapons and greatshields. Two-handing gives 1.5x effective STR.' },
  { key: 'dexterity',    abbr: 'DEX', label: 'Dexterity',    colorClass: styles.colDex, caps: [18, 60, 80], desc: 'Increases damage with DEX-scaling weapons. Reduces casting time of spells and incantations. Slightly reduces fall damage.' },
  { key: 'intelligence', abbr: 'INT', label: 'Intelligence', colorClass: styles.colInt, caps: [20, 50, 80], desc: 'Increases magic damage and sorcery scaling. Required to cast sorceries. Also boosts magic defense.' },
  { key: 'faith',        abbr: 'FAI', label: 'Faith',        colorClass: styles.colFai, caps: [20, 50, 80], desc: 'Increases holy/fire damage and incantation scaling. Required to cast incantations. Also boosts Vitality (death blight resistance).' },
  { key: 'arcane',       abbr: 'ARC', label: 'Arcane',       colorClass: styles.colArc, caps: [20, 60, 80], desc: 'Increases status buildup (bleed, poison, rot) and Discovery. Scales certain weapons and dragon incantations. Also boosts Vitality.' },
];

const MAX_STAT = 99;

export default function StatsPanel({ stats, talismans = [] }: Props) {
  const ready = useMountAnimation();
  const talBonus = computeTalismanBonuses(talismans);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Attributes</span>
      </div>

      <div className={styles.list}>
        {STAT_DEFS.map(({ key, abbr, label, colorClass, caps, desc }, index) => {
          const base  = stats[key] ?? 0;
          const bonus = (talBonus.attrs[key] ?? 0) as number;
          const value = Math.min(99, base + bonus);
          const pct   = Math.round((value / MAX_STAT) * 100);
          return (
            <div key={key} className={`${styles.row} ${colorClass}`}>
              <div className={styles.labelGroup}>
                <span className={styles.abbr}>{abbr}</span>
                <span className={styles.infoIcon} data-tooltip={desc}>?</span>
                <span className={styles.label}>{label}</span>
              </div>

              {/* Barra con ticks de softcap */}
              <div className={styles.barWrap}>
                <div className={styles.barTrack}>
                  <div
                    className={styles.barFill}
                    style={{
                      width: ready ? `${pct}%` : '0%',
                      transitionDelay: `${index * 60}ms`,
                    }}
                  />
                </div>
                {caps.map(cap => {
                  const capPct = (cap / MAX_STAT) * 100;
                  const reached = value >= cap;
                  return (
                    <div
                      key={cap}
                      className={`${styles.tick} ${reached ? styles.tickReached : ''}`}
                      style={{ left: `${capPct}%` }}
                    />
                  );
                })}
              </div>

              <span className={`${styles.value} ${value >= caps[caps.length - 1] ? styles.valueCapped : ''}`}>
                {value}
                {bonus > 0 && <span className={styles.bonus}>+{bonus}</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
