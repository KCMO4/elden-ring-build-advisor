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
  /** Softcap values (at 99-scale) */
  caps: number[];
}

const STAT_DEFS: StatDef[] = [
  { key: 'vigor',        abbr: 'VIG', label: 'Vigor',        colorClass: styles.colVig, caps: [40, 60] },
  { key: 'mind',         abbr: 'MND', label: 'Mente',        colorClass: styles.colMnd, caps: [55, 60] },
  { key: 'endurance',    abbr: 'END', label: 'Resistencia',  colorClass: styles.colEnd, caps: [25, 60] },
  { key: 'strength',     abbr: 'STR', label: 'Fuerza',       colorClass: styles.colStr, caps: [20, 40, 60, 80] },
  { key: 'dexterity',    abbr: 'DEX', label: 'Destreza',     colorClass: styles.colDex, caps: [20, 40, 60, 80] },
  { key: 'intelligence', abbr: 'INT', label: 'Inteligencia', colorClass: styles.colInt, caps: [20, 40, 60, 80] },
  { key: 'faith',        abbr: 'FAI', label: 'Fe',           colorClass: styles.colFai, caps: [20, 40, 60, 80] },
  { key: 'arcane',       abbr: 'ARC', label: 'Arcano',       colorClass: styles.colArc, caps: [20, 40, 60, 80] },
];

const MAX_STAT = 99;

export default function StatsPanel({ stats, talismans = [] }: Props) {
  const ready = useMountAnimation();
  const talBonus = computeTalismanBonuses(talismans);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Atributos</span>
      </div>

      <div className={styles.list}>
        {STAT_DEFS.map(({ key, abbr, label, colorClass, caps }, index) => {
          const base  = stats[key] ?? 0;
          const bonus = (talBonus.attrs[key] ?? 0) as number;
          const value = Math.min(99, base + bonus);
          const pct   = Math.round((value / MAX_STAT) * 100);
          return (
            <div key={key} className={`${styles.row} ${colorClass}`}>
              <div className={styles.labelGroup}>
                <span className={styles.abbr}>{abbr}</span>
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
                      title={`Softcap ${cap}`}
                    />
                  );
                })}
              </div>

              <span className={styles.value}>
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
