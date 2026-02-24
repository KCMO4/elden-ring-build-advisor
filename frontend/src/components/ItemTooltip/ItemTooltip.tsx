import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { EquippedWeapon, CharacterStats } from '../../types';
import { useTooltipPosition } from '../../hooks/useTooltipPosition';
import { getTalismanEffectLines } from '../../utils/talismanEffects';
import { estimateARWithBreakdown } from '../../utils/arCalc';
import styles from './ItemTooltip.module.css';

interface Props {
  item: EquippedWeapon;
  triggerRect: DOMRect;
  /** Stats del personaje — necesarios para calcular el AR estimado con escalado */
  stats?: CharacterStats;
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

/** Colores por tipo de daño */
const DMG_COLOR: Record<string, string> = {
  physical:  '#c8bfa0',
  magic:     '#6a9cd4',
  fire:      '#d4703c',
  lightning: '#d4c03c',
  holy:      '#c4a84c',
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

function DamageBar({
  label, value, max, color, prefix,
}: {
  label: string; value: number; max: number; color?: string; prefix?: string;
}) {
  if (!value || value <= 0) return null;
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className={styles.damageRow}>
      <span className={styles.damageLabel}>{label}</span>
      <div className={styles.barTrack}>
        <div
          className={styles.barFill}
          style={{ width: `${pct}%`, background: color ? `linear-gradient(to right, #3a2a10, ${color})` : undefined }}
        />
      </div>
      <span className={styles.damageValue} style={{ color: color ?? undefined }}>
        {prefix ?? ''}{value}
      </span>
    </div>
  );
}

/** Fila de desglose de escalado: "FUE  D  18  →  +28" */
function BreakdownRow({
  stat, grade, statValue, bonus,
}: {
  stat: string; grade: string; statValue: number; bonus: number;
}) {
  if (bonus <= 0) return null;
  const g = (grade?.toUpperCase() ?? '-') as ScalingGrade;
  if (g === '-') return null;
  const cls = GRADE_CLASS[g] ?? styles.gradeNone;
  return (
    <div className={styles.breakdownRow}>
      <span className={styles.breakdownStat}>{stat}</span>
      <span className={`${styles.badge} ${cls}`}>{g}</span>
      <span className={styles.breakdownStatVal}>{statValue}</span>
      <span className={styles.breakdownArrow}>→</span>
      <span className={styles.breakdownBonus}>+{bonus}</span>
    </div>
  );
}

export default function ItemTooltip({ item, triggerRect, stats }: Props) {
  const pos = useTooltipPosition(triggerRect);

  const displayName = item.name
    ? item.upgradeLevel && item.upgradeLevel > 0
      ? item.name.replace(/ \+\d+$/, '')
      : item.name
    : '—';

  // AR estimado con desglose — solo si hay stats del personaje y el arma tiene damage+scaling
  const arData = useMemo(() => {
    if (!stats || !item.damage || !item.scaling) return null;
    return estimateARWithBreakdown(item, stats);
  }, [item, stats]);

  // Si no hay stats del personaje, mostrar daño base sin escalar
  const rawDamage = item.damage;
  const maxRawDmg = rawDamage
    ? Math.max(rawDamage.physical, rawDamage.magic, rawDamage.fire, rawDamage.lightning, rawDamage.holy, 1)
    : 1;

  const hasScaling = item.scaling &&
    Object.values(item.scaling).some(v => v !== '-');

  const effectLines = getTalismanEffectLines(item.baseId ?? 0);

  const arMax = 650;

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
      {item.skill && (
        <div className={styles.skillLine}>Skill: {item.skill}</div>
      )}

      <div className={styles.divider} />

      {/* ── Attack Power (AR estimado si hay stats, base si no) ── */}
      {rawDamage && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>
            {arData ? 'Estimated AR' : 'Attack Power'}
          </div>

          {arData ? (
            // AR con escalado aplicado
            <>
              <DamageBar label="Physical"  value={arData.ar.physical}  max={arMax} color={DMG_COLOR.physical}  prefix="~" />
              <DamageBar label="Magic"     value={arData.ar.magic}     max={arMax} color={DMG_COLOR.magic}     prefix="~" />
              <DamageBar label="Fire"      value={arData.ar.fire}      max={arMax} color={DMG_COLOR.fire}      prefix="~" />
              <DamageBar label="Lightning" value={arData.ar.lightning} max={arMax} color={DMG_COLOR.lightning} prefix="~" />
              <DamageBar label="Holy"      value={arData.ar.holy}      max={arMax} color={DMG_COLOR.holy}      prefix="~" />
            </>
          ) : (
            // Base +0 sin escalar
            <>
              <DamageBar label="Physical"  value={rawDamage.physical}  max={maxRawDmg} color={DMG_COLOR.physical}  />
              <DamageBar label="Magic"     value={rawDamage.magic}     max={maxRawDmg} color={DMG_COLOR.magic}     />
              <DamageBar label="Fire"      value={rawDamage.fire}      max={maxRawDmg} color={DMG_COLOR.fire}      />
              <DamageBar label="Lightning" value={rawDamage.lightning} max={maxRawDmg} color={DMG_COLOR.lightning} />
              <DamageBar label="Holy"      value={rawDamage.holy}      max={maxRawDmg} color={DMG_COLOR.holy}      />
            </>
          )}
        </div>
      )}

      {/* ── Defensa (para armaduras) ── */}
      {item.defense && !rawDamage && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Dmg Negation</div>
          <DamageBar label="Physical"  value={item.defense.physical}  max={35} color={DMG_COLOR.physical}  />
          <DamageBar label="Magic"     value={item.defense.magic}     max={35} color={DMG_COLOR.magic}     />
          <DamageBar label="Fire"      value={item.defense.fire}      max={35} color={DMG_COLOR.fire}      />
          <DamageBar label="Lightning" value={item.defense.lightning} max={35} color={DMG_COLOR.lightning} />
          <DamageBar label="Holy"      value={item.defense.holy}      max={35} color={DMG_COLOR.holy}      />
        </div>
      )}

      {/* ── Poise + Resistances (para armaduras) ── */}
      {item.defense && !rawDamage && (item.poise != null && item.poise > 0 || item.immunity != null) && (
        <div className={styles.section}>
          {item.poise != null && item.poise > 0 && (
            <div className={styles.statRow}>
              <span className={styles.statLabel}>Poise</span>
              <span className={styles.statValue}>{item.poise}</span>
            </div>
          )}
          {item.immunity != null && item.immunity > 0 && (
            <div className={styles.statRow}>
              <span className={styles.statLabel} style={{ color: '#8bc34a' }}>Immunity</span>
              <span className={styles.statValue}>{item.immunity}</span>
            </div>
          )}
          {item.robustness != null && item.robustness > 0 && (
            <div className={styles.statRow}>
              <span className={styles.statLabel} style={{ color: '#e57373' }}>Robustness</span>
              <span className={styles.statValue}>{item.robustness}</span>
            </div>
          )}
          {item.focus != null && item.focus > 0 && (
            <div className={styles.statRow}>
              <span className={styles.statLabel} style={{ color: '#ba68c8' }}>Focus</span>
              <span className={styles.statValue}>{item.focus}</span>
            </div>
          )}
          {item.vitality != null && item.vitality > 0 && (
            <div className={styles.statRow}>
              <span className={styles.statLabel} style={{ color: '#78909c' }}>Vitality</span>
              <span className={styles.statValue}>{item.vitality}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Desglose de escalado (solo si hay AR calculado) ── */}
      {arData && hasScaling && item.scaling && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Scaling applied</div>
          <BreakdownRow
            stat="STR" grade={item.scaling.str}
            statValue={stats!.strength}    bonus={arData.breakdown.strBonus}
          />
          <BreakdownRow
            stat="DEX" grade={item.scaling.dex}
            statValue={stats!.dexterity}   bonus={arData.breakdown.dexBonus}
          />
          <BreakdownRow
            stat="INT" grade={item.scaling.int}
            statValue={stats!.intelligence} bonus={arData.breakdown.intBonus}
          />
          <BreakdownRow
            stat="FAI" grade={item.scaling.fai}
            statValue={stats!.faith}       bonus={arData.breakdown.faiBonus}
          />
          <BreakdownRow
            stat="ARC" grade={item.scaling.arc}
            statValue={stats!.arcane}      bonus={arData.breakdown.arcBonus}
          />
          {/* Base (daño ajustado por nivel, antes del escalado) */}
          <div className={styles.breakdownBase}>
            <span className={styles.breakdownBaseLbl}>Base +{item.upgradeLevel ?? 0}</span>
            <span className={styles.breakdownBaseVal}>
              {arData.breakdown.base.physical > 0 ? arData.breakdown.base.physical : ''}
              {arData.breakdown.base.magic     > 0 ? (arData.breakdown.base.physical > 0 ? ' / ' : '') + arData.breakdown.base.magic     : ''}
              {arData.breakdown.base.fire      > 0 ? ' / ' + arData.breakdown.base.fire      : ''}
              {arData.breakdown.base.lightning > 0 ? ' / ' + arData.breakdown.base.lightning : ''}
              {arData.breakdown.base.holy      > 0 ? ' / ' + arData.breakdown.base.holy      : ''}
            </span>
          </div>
        </div>
      )}

      {/* ── Escalado simple (cuando no hay stats del personaje) ── */}
      {!arData && hasScaling && item.scaling && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Scaling</div>
          <div className={styles.badgeRow}>
            <ScalingBadge stat="STR" grade={item.scaling.str} />
            <ScalingBadge stat="DEX" grade={item.scaling.dex} />
            <ScalingBadge stat="INT" grade={item.scaling.int} />
            <ScalingBadge stat="FAI" grade={item.scaling.fai} />
            <ScalingBadge stat="ARC" grade={item.scaling.arc} />
          </div>
        </div>
      )}

      {/* ── Efectos (talismanes con stats numéricos) ── */}
      {effectLines && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Effect</div>
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
          <div className={styles.sectionLabel}>Effect</div>
          <p className={styles.effectText}>{item.effect}</p>
        </div>
      )}

      {/* ── Guard Boost (shields) ── */}
      {item.stability != null && item.stability > 0 && (
        <div className={styles.section}>
          <div className={styles.statRow}>
            <span className={styles.statLabel}>Guard Boost</span>
            <span className={styles.statValue}>{item.stability}</span>
          </div>
        </div>
      )}

      {/* ── Peso ── */}
      {item.weight !== undefined && item.weight > 0 && (
        <div className={styles.weightRow}>
          <span className={styles.weightLabel}>Weight</span>
          <span className={styles.weightValue}>{item.weight.toFixed(1)}</span>
        </div>
      )}
    </div>
  );

  return createPortal(tooltip, document.body);
}
