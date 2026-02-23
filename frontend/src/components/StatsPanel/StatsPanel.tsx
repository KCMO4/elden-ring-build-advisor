import type { CharacterStats } from '../../types';
import { useMountAnimation } from '../../hooks/useMountAnimation';
import styles from './StatsPanel.module.css';

interface Props {
  stats: CharacterStats;
}

interface StatDef {
  key: keyof CharacterStats;
  abbr: string;
  label: string;
  colorClass: string;
}

const STAT_DEFS: StatDef[] = [
  { key: 'vigor',        abbr: 'VIG', label: 'Vigor',        colorClass: styles.colVig },
  { key: 'mind',         abbr: 'MND', label: 'Mente',        colorClass: styles.colMnd },
  { key: 'endurance',    abbr: 'END', label: 'Resistencia',  colorClass: styles.colEnd },
  { key: 'strength',     abbr: 'STR', label: 'Fuerza',       colorClass: styles.colStr },
  { key: 'dexterity',    abbr: 'DEX', label: 'Destreza',     colorClass: styles.colDex },
  { key: 'intelligence', abbr: 'INT', label: 'Inteligencia', colorClass: styles.colInt },
  { key: 'faith',        abbr: 'FAI', label: 'Fe',           colorClass: styles.colFai },
  { key: 'arcane',       abbr: 'ARC', label: 'Arcano',       colorClass: styles.colArc },
];

const MAX_STAT = 99;

export default function StatsPanel({ stats }: Props) {
  const ready = useMountAnimation();

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Atributos</span>
      </div>

      <div className={styles.list}>
        {STAT_DEFS.map(({ key, abbr, label, colorClass }, index) => {
          const value = stats[key] ?? 0;
          const pct = Math.round((value / MAX_STAT) * 100);
          return (
            <div key={key} className={`${styles.row} ${colorClass}`}>
              <div className={styles.labelGroup}>
                <span className={styles.abbr}>{abbr}</span>
                <span className={styles.label}>{label}</span>
              </div>
              <div className={styles.barTrack}>
                <div
                  className={styles.barFill}
                  style={{
                    width: ready ? `${pct}%` : '0%',
                    transitionDelay: `${index * 60}ms`,
                  }}
                />
              </div>
              <span className={styles.value}>{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
