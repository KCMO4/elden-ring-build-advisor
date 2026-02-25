import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { EquippedWeapon, CharacterStats } from '../../types';
import { useTooltipPosition } from '../../hooks/useTooltipPosition';
import { getTalismanEffectLines } from '../../utils/talismanEffects';
import { getGreatRuneEffectLines } from '../../utils/greatRuneEffects';
import { estimateARWithBreakdown, meetsRequirements, estimatePassiveBuildup } from '../../utils/arCalc';
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

/** Colores por tipo de passive */
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

  // Check si cumple requisitos (para warning de penalización)
  const reqsMet = !stats || !item.requirements || !item.damage
    ? true
    : meetsRequirements(item, stats);

  // Si no hay stats del personaje, mostrar daño base sin escalar
  const rawDamage = item.damage;
  const maxRawDmg = rawDamage
    ? Math.max(rawDamage.physical, rawDamage.magic, rawDamage.fire, rawDamage.lightning, rawDamage.holy, 1)
    : 1;

  const hasScaling = item.scaling &&
    Object.values(item.scaling).some(v => v !== '-');

  const effectLines = getTalismanEffectLines(item.baseId ?? 0);
  const greatRuneLines = getGreatRuneEffectLines(item.baseId ?? 0);

  // Subtítulo: tipo de arma + infusión, tipo de armadura, o categoría de escudo
  const subtitle = (() => {
    if (item.itemType) {
      if (item.infusion) return `${item.infusion} ${item.itemType}`;
      return item.itemType;
    }
    if (item.infusion) return item.infusion;
    return null;
  })();

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
      {subtitle && (
        <div className={styles.subtitle}>{subtitle}</div>
      )}
      {item.damageTypes && item.damageTypes.length > 0 && (
        <div className={styles.badgeRow} style={{ marginBottom: '0.4rem' }}>
          {item.damageTypes.map(t => (
            <span key={t} className={styles.dmgTypeBadge}>{t}</span>
          ))}
        </div>
      )}
      {item.skill && (
        <div className={styles.skillLine}>
          Skill: {item.skill}
          {item.skillFpCost && (
            <span className={styles.skillFp}>
              FP {item.skillFpCost[0]}{item.skillFpCost[1] != null ? ` (${item.skillFpCost[1]})` : ''}
            </span>
          )}
        </div>
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
              {!reqsMet && (
                <div style={{ color: '#d4483c', fontSize: '0.75rem', marginTop: '0.3rem' }}>
                  Requirements not met — damage reduced
                </div>
              )}
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

      {/* ── Critical + Riposte ── */}
      {item.critical != null && (
        <div className={styles.section}>
          <div className={styles.statRow}>
            <span className={styles.statLabel}>Critical</span>
            <span className={styles.statValue}>{item.critical}</span>
          </div>
          {arData && item.critical > 100 && (
            <div className={styles.statRow}>
              <span className={styles.statLabel} style={{ color: '#e8c97a' }}>Riposte</span>
              <span className={styles.statValue} style={{ color: '#e8c97a' }}>
                ~{Math.round(arData.ar.total * item.critical / 100)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Defensa (para armaduras — 8 tipos) ── */}
      {item.defense && !rawDamage && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Dmg Negation</div>
          <DamageBar label="Physical"  value={item.defense.physical}  max={35} color={DMG_COLOR.physical}  />
          <DamageBar label="  Strike"  value={item.defense.strike}    max={35} color={DMG_COLOR.physical}  />
          <DamageBar label="  Slash"   value={item.defense.slash}     max={35} color={DMG_COLOR.physical}  />
          <DamageBar label="  Pierce"  value={item.defense.pierce}    max={35} color={DMG_COLOR.physical}  />
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

      {/* ── Passive effects (blood, frost, etc.) — with ARC scaling ── */}
      {item.passives && item.passives.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Passive Effects</div>
          {item.passives.map(p => {
            const arcGrade = item.scaling?.arc ?? '-';
            const scaled = stats && arcGrade !== '-'
              ? estimatePassiveBuildup(p.buildup, stats.arcane, arcGrade)
              : p.buildup;
            return (
              <div key={p.type} className={styles.damageRow}>
                <span className={styles.damageLabel}>{PASSIVE_LABEL[p.type] ?? p.type}</span>
                <div className={styles.barTrack}>
                  <div
                    className={styles.barFill}
                    style={{
                      width: `${Math.min(100, (scaled / 100) * 100)}%`,
                      background: `linear-gradient(to right, #3a2a10, ${PASSIVE_COLOR[p.type] ?? '#888'})`,
                    }}
                  />
                </div>
                <span className={styles.damageValue} style={{ color: PASSIVE_COLOR[p.type] ?? '#888' }}>
                  {scaled !== p.buildup ? `~${scaled}` : p.buildup}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Requirements (armas) ── */}
      {item.requirements && rawDamage && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Requirements</div>
          <div className={styles.badgeRow}>
            {item.requirements.str > 0 && (
              <span className={`${styles.badge} ${stats && stats.strength < item.requirements.str ? styles.reqUnmet : styles.reqMet}`}>
                STR {item.requirements.str}
              </span>
            )}
            {item.requirements.dex > 0 && (
              <span className={`${styles.badge} ${stats && stats.dexterity < item.requirements.dex ? styles.reqUnmet : styles.reqMet}`}>
                DEX {item.requirements.dex}
              </span>
            )}
            {item.requirements.int > 0 && (
              <span className={`${styles.badge} ${stats && stats.intelligence < item.requirements.int ? styles.reqUnmet : styles.reqMet}`}>
                INT {item.requirements.int}
              </span>
            )}
            {item.requirements.fai > 0 && (
              <span className={`${styles.badge} ${stats && stats.faith < item.requirements.fai ? styles.reqUnmet : styles.reqMet}`}>
                FAI {item.requirements.fai}
              </span>
            )}
            {item.requirements.arc > 0 && (
              <span className={`${styles.badge} ${stats && stats.arcane < item.requirements.arc ? styles.reqUnmet : styles.reqMet}`}>
                ARC {item.requirements.arc}
              </span>
            )}
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

      {/* ── Great Rune effects ── */}
      {!effectLines && greatRuneLines && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Great Rune Effect (activated)</div>
          {greatRuneLines.map(({ label, value }) => (
            <div key={label} className={styles.effectRow}>
              <span className={styles.effectLabel}>{label}</span>
              <span className={styles.effectValue}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Spell info (sorcery/incantation equipped in memory slots) ── */}
      {(item.itemType === 'sorcery' || item.itemType === 'incantation') && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>
            {item.itemType === 'sorcery' ? 'Sorcery' : 'Incantation'}
          </div>
          {item.skillFpCost && item.skillFpCost[0] > 0 && (
            <div className={styles.statRow}>
              <span className={styles.statLabel} style={{ color: '#6a9cd4' }}>FP Cost</span>
              <span className={styles.statValue}>{item.skillFpCost[0]}</span>
            </div>
          )}
          {item.requirements && (
            <div className={styles.badgeRow} style={{ marginTop: '0.3rem' }}>
              {item.requirements.int > 0 && (
                <span className={`${styles.badge} ${stats && stats.intelligence < item.requirements.int ? styles.reqUnmet : styles.reqMet}`}>
                  INT {item.requirements.int}
                </span>
              )}
              {item.requirements.fai > 0 && (
                <span className={`${styles.badge} ${stats && stats.faith < item.requirements.fai ? styles.reqUnmet : styles.reqMet}`}>
                  FAI {item.requirements.fai}
                </span>
              )}
              {item.requirements.arc > 0 && (
                <span className={`${styles.badge} ${stats && stats.arcane < item.requirements.arc ? styles.reqUnmet : styles.reqMet}`}>
                  ARC {item.requirements.arc}
                </span>
              )}
            </div>
          )}
          {item.effect && (
            <p className={styles.effectText} style={{ marginTop: '0.3rem' }}>{item.effect}</p>
          )}
        </div>
      )}

      {/* ── Descripción de efecto (talismanes sin datos numéricos, consumables) ── */}
      {!effectLines && item.effect && item.itemType !== 'sorcery' && item.itemType !== 'incantation' && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Effect</div>
          <p className={styles.effectText}>{item.effect}</p>
        </div>
      )}

      {/* ── Guarded Dmg Negation (shields — no armor defense) ── */}
      {item.guardNegation && !item.defense && !rawDamage && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Guarded Dmg Negation</div>
          <DamageBar label="Physical"  value={item.guardNegation.physical}  max={100} color={DMG_COLOR.physical}  />
          <DamageBar label="Magic"     value={item.guardNegation.magic}     max={100} color={DMG_COLOR.magic}     />
          <DamageBar label="Fire"      value={item.guardNegation.fire}      max={100} color={DMG_COLOR.fire}      />
          <DamageBar label="Lightning" value={item.guardNegation.lightning} max={100} color={DMG_COLOR.lightning} />
          <DamageBar label="Holy"      value={item.guardNegation.holy}      max={100} color={DMG_COLOR.holy}      />
        </div>
      )}

      {/* ── Guard Negation (weapons with damage) ── */}
      {item.guardNegation && rawDamage && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Guard Negation</div>
          <DamageBar label="Physical"  value={item.guardNegation.physical}  max={60} color={DMG_COLOR.physical}  />
          <DamageBar label="Magic"     value={item.guardNegation.magic}     max={60} color={DMG_COLOR.magic}     />
          <DamageBar label="Fire"      value={item.guardNegation.fire}      max={60} color={DMG_COLOR.fire}      />
          <DamageBar label="Lightning" value={item.guardNegation.lightning} max={60} color={DMG_COLOR.lightning} />
          <DamageBar label="Holy"      value={item.guardNegation.holy}      max={60} color={DMG_COLOR.holy}      />
          {item.guardNegation.boost != null && item.guardNegation.boost > 0 && (
            <div className={styles.statRow}>
              <span className={styles.statLabel}>Guard Boost</span>
              <span className={styles.statValue}>{item.guardNegation.boost}</span>
            </div>
          )}
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
      {/* ── Armor efficiency (physical defense / weight) ── */}
      {item.defense && item.weight != null && item.weight > 0 && !rawDamage && (
        <div className={styles.efficiencyRow}>
          Efficiency {(item.defense.physical / item.weight).toFixed(1)}
        </div>
      )}
    </div>
  );

  return createPortal(tooltip, document.body);
}
