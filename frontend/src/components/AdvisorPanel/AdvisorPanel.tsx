import { useState, useEffect } from 'react';
import { getAdvisor } from '../../api/client';
import type { CharacterStats, AdvisorWeapon } from '../../types';
import styles from './AdvisorPanel.module.css';

interface Props {
  stats: CharacterStats;
}

export default function AdvisorPanel({ stats }: Props) {
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
          // data.usable es un array de { weapon, estimatedAR, canEquip }
          const list = (data.usable ?? []).map(r => ({
            ...r.weapon,
            estimatedAR: r.estimatedAR,
          }));
          setWeapons(list);
        }
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error al cargar recomendaciones');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [stats]);

  return (
    <div className={styles.panel}>
      <div className={styles.title}>Armas Recomendadas</div>

      {loading && (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Calculando AR estimado...</span>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      {!loading && !error && (
        <div className={styles.list}>
          {weapons.slice(0, 10).map((w, i) => (
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
                <div className={styles.itemName} title={w.name}>{w.name}</div>
                <div className={styles.itemType}>{w.type}</div>
              </div>

              <div className={styles.itemAr}>
                <div className={styles.arValue}>{Math.round(w.estimatedAR)}</div>
                <div className={styles.arLabel}>AR est.</div>
              </div>
            </div>
          ))}

          {weapons.length === 0 && (
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              No se encontraron armas para estos stats.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
