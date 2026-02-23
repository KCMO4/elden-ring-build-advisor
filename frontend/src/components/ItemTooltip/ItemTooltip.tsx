import { createPortal } from 'react-dom';
import type { EquippedWeapon } from '../../types';
import { useTooltipPosition } from '../../hooks/useTooltipPosition';
import { getTalismanEffectLines } from '../../utils/talismanEffects';
import styles from './ItemTooltip.module.css';

interface Props {
  item: EquippedWeapon;
  triggerRect: DOMRect;
}

type ScalingGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | '-';

const GRADE_CLASS: Record<ScalingGrade, string> = {
  S: styles.gradeS,
  A: styles.gradeA,
  B: styles.gradeB,
  C: styles.gradeC,
  D: styles.gradeD,
  E: styles.gradeE,
  '-': styles.gradeNone,
};

function ScalingBadge({ stat, grade }: { stat: string; grade: string }) {
  const g = (grade?.toUpperCase() ?? '-') as ScalingGrade;
  if (g === '-') return null;
  const cls = GRADE_CLASS[g] ?? styles.gradeNone;
  return (
    <span className={`${styles.badge} ${cls}`}>
      {stat}: {g}
    </span>
  );
}

function DamageBar({ label, value, max }: { label: string; value: number; max: number }) {
  if (!value || value <= 0) return null;
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className={styles.damageRow}>
      <span className={styles.damageLabel}>{label}</span>
      <div className={styles.barTrack}>
        <div className={styles.barFill} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.damageValue}>{value}</span>
    </div>
  );
}

export default function ItemTooltip({ item, triggerRect }: Props) {
  const pos = useTooltipPosition(triggerRect);

  const displayName = item.name
    ? item.upgradeLevel && item.upgradeLevel > 0
      ? item.name.replace(/ \+\d+$/, '')
      : item.name
    : '—';

  const damage = item.damage;
  const maxDmg = damage
    ? Math.max(damage.physical, damage.magic, damage.fire, damage.lightning, damage.holy, 1)
    : 1;

  const hasScaling = item.scaling &&
    Object.values(item.scaling).some(v => v !== '-');

  const effectLines = getTalismanEffectLines(item.baseId ?? 0);

  const tooltip = (
    <div
      className={styles.tooltip}
      style={{ left: pos.x, top: pos.y }}
    >
      {/* ── Nombre ── */}
      <div className={styles.header}>
        <span className={styles.name}>{displayName}</span>
        {item.upgradeLevel !== undefined && item.upgradeLevel > 0 && (
          <span className={styles.upgradeLevel}>+{item.upgradeLevel}</span>
        )}
      </div>

      <div className={styles.divider} />

      {/* ── Attack Power ── */}
      {damage && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Attack Power</div>
          <DamageBar label="Físico"   value={damage.physical}  max={maxDmg} />
          <DamageBar label="Magia"    value={damage.magic}     max={maxDmg} />
          <DamageBar label="Fuego"    value={damage.fire}      max={maxDmg} />
          <DamageBar label="Relámp."  value={damage.lightning} max={maxDmg} />
          <DamageBar label="Sagrado"  value={damage.holy}      max={maxDmg} />
        </div>
      )}

      {/* ── Defensa (para armaduras) ── */}
      {item.defense && !damage && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Negación de daño</div>
          <DamageBar label="Físico"   value={item.defense.physical}  max={35} />
          <DamageBar label="Magia"    value={item.defense.magic}     max={35} />
          <DamageBar label="Fuego"    value={item.defense.fire}      max={35} />
          <DamageBar label="Relámp."  value={item.defense.lightning} max={35} />
          <DamageBar label="Sagrado"  value={item.defense.holy}      max={35} />
        </div>
      )}

      {/* ── Attribute Scaling ── */}
      {hasScaling && item.scaling && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Escalado</div>
          <div className={styles.badgeRow}>
            <ScalingBadge stat="FUE" grade={item.scaling.str} />
            <ScalingBadge stat="DES" grade={item.scaling.dex} />
            <ScalingBadge stat="INT" grade={item.scaling.int} />
            <ScalingBadge stat="FE"  grade={item.scaling.fai} />
            <ScalingBadge stat="ARC" grade={item.scaling.arc} />
          </div>
        </div>
      )}

      {/* ── Efectos (talismanes con stats numéricos) ── */}
      {effectLines && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Efecto</div>
          {effectLines.map(({ label, value }) => (
            <div key={label} className={styles.effectRow}>
              <span className={styles.effectLabel}>{label}</span>
              <span className={styles.effectValue}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Descripción de efecto (talismanes sin datos numéricos) ── */}
      {!effectLines && item.effect && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Efecto</div>
          <p className={styles.effectText}>{item.effect}</p>
        </div>
      )}

      {/* ── Peso ── */}
      {item.weight !== undefined && item.weight > 0 && (
        <div className={styles.weightRow}>
          <span className={styles.weightLabel}>Peso</span>
          <span className={styles.weightValue}>{item.weight.toFixed(1)}</span>
        </div>
      )}
    </div>
  );

  return createPortal(tooltip, document.body);
}
