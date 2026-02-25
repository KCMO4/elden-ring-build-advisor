import { useState, useEffect, useMemo } from 'react';
import { getAdvisor } from '../../api/client';
import type { CharacterStats, AdvisorWeapon, EquippedWeapon } from '../../types';
import styles from './AdvisorPanel.module.css';

interface Props {
  stats: CharacterStats;
  mainWeaponAR?: number;
  mainWeapon?: EquippedWeapon | null;
}

type CompBadge = 'better' | 'similar' | 'worse';

function getComparison(ar: number, mainAr: number): CompBadge | null {
  if (!mainAr || mainAr <= 0) return null;
  const diff = ar - mainAr;
  if (diff > 10) return 'better';
  if (diff < -10) return 'worse';
  return 'similar';
}

const COMP_LABELS: Record<CompBadge, string> = {
  better:  'BETTER',
  similar: 'SIMILAR',
  worse:   'WORSE',
};

// ── Optimizador de nivel ─────────────────────────────────────

const CAPS: Record<string, number[]> = {
  vigor:        [40, 60],
  mind:         [55, 60],
  endurance:    [25, 60],
  strength:     [20, 40, 60, 80],
  dexterity:    [20, 40, 60, 80],
  intelligence: [20, 40, 60, 80],
  faith:        [20, 40, 60, 80],
  arcane:       [20, 40, 60, 80],
};

const SCALE_TO_STAT: Record<string, keyof CharacterStats> = {
  str: 'strength',
  dex: 'dexterity',
  int: 'intelligence',
  fai: 'faith',
  arc: 'arcane',
};

const STAT_LABEL: Record<string, string> = {
  vigor: 'VIG', mind: 'MND', endurance: 'END',
  strength: 'STR', dexterity: 'DEX', intelligence: 'INT', faith: 'FAI', arcane: 'ARC',
};

const GRADE_WEIGHT: Record<string, number> = { S: 6, A: 5, B: 4, C: 3, D: 2, E: 1 };

interface LevelTip {
  statKey: string;
  label:   string;
  current: number;
  nextCap: number;
  points:  number;
  grade?:  string;
}

function computeTips(stats: CharacterStats, weapon: EquippedWeapon | null): LevelTip[] {
  const tips: LevelTip[] = [];

  if (weapon?.scaling) {
    for (const [sk, statKey] of Object.entries(SCALE_TO_STAT)) {
      const grade = weapon.scaling[sk as keyof typeof weapon.scaling];
      if (!grade || grade === '-') continue;
      const cur = stats[statKey] as number;
      const nextCap = CAPS[statKey]?.find(c => c > cur);
      if (nextCap === undefined) continue;
      tips.push({ statKey, label: STAT_LABEL[statKey], current: cur, nextCap, points: nextCap - cur, grade });
    }
  }

  // VIG recomendado si está por debajo de 60
  const vig = stats.vigor;
  if (vig < 60 && !tips.find(t => t.statKey === 'vigor')) {
    const nextCap = CAPS.vigor.find(c => c > vig);
    if (nextCap !== undefined) {
      tips.push({ statKey: 'vigor', label: 'VIG', current: vig, nextCap, points: nextCap - vig });
    }
  }

  // Ordenar: mayor grade primero, luego menor distancia al cap
  tips.sort((a, b) => {
    const wa = GRADE_WEIGHT[a.grade ?? ''] ?? 0;
    const wb = GRADE_WEIGHT[b.grade ?? ''] ?? 0;
    if (wa !== wb) return wb - wa;
    return a.points - b.points;
  });

  return tips.slice(0, 4);
}

export default function AdvisorPanel({ stats, mainWeaponAR = 0, mainWeapon }: Props) {
  const [weapons, setWeapons] = useState<AdvisorWeapon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getAdvisor(stats)
      .then(data => {
        if (!cancelled) {
          const list = (data.usable ?? []).map(r => ({
            ...r.weapon,
            estimatedAR: r.estimatedAR,
          }));
          setWeapons(list);
        }
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load recommendations');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [stats]);

  const tips = useMemo(() => computeTips(stats, mainWeapon ?? null), [stats, mainWeapon]);

  return (
    <div className={styles.panel}>
      <div className={styles.title}>Recommended Weapons</div>

      {loading && (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Calculating estimated AR...</span>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      {!loading && !error && (
        <div className={styles.list}>
          {weapons.slice(0, 10).map((w, i) => {
            const comp = getComparison(Math.round(w.estimatedAR), mainWeaponAR);
            return (
              <div key={w.id} className={styles.item}>
                <span className={`${styles.rank} ${i < 3 ? styles.topBadge : ''}`}>
                  {i < 3 ? '★' : `#${i + 1}`}
                </span>

                {w.image ? (
                  <img
                    src={w.image}
                    alt={w.name}
                    className={styles.itemImage}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className={styles.itemPlaceholder}>⚔</div>
                )}

                <div className={styles.itemInfo}>
                  <div className={styles.itemName}>{w.name}</div>
                  <div className={styles.itemType}>{w.type}</div>
                </div>

                <div className={styles.itemAr}>
                  <div className={styles.arValue}>{Math.round(w.estimatedAR)}</div>
                  {comp && (
                    <div className={`${styles.compBadge} ${styles[`comp_${comp}`]}`}>
                      {COMP_LABELS[comp]}
                    </div>
                  )}
                  {!comp && <div className={styles.arLabel}>AR est.</div>}
                </div>
              </div>
            );
          })}

          {weapons.length === 0 && (
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              No weapons found for these stats.
            </p>
          )}
        </div>
      )}

      {/* ── Optimizador de nivel ── */}
      {tips.length > 0 && (
        <>
          <div className={styles.optimizerTitle}>Next Caps</div>
          <div className={styles.optList}>
            {tips.map(t => (
              <div key={t.statKey} className={styles.optItem}>
                <span className={styles.optLabel}>
                  {t.label}
                  {t.grade && <span className={styles.optGrade}> {t.grade}</span>}
                </span>
                <span className={styles.optArrow}>{t.current} → {t.nextCap}</span>
                <span className={styles.optPointsBadge}>+{t.points}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
