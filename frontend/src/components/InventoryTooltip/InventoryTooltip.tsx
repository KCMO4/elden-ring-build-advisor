import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { ResolvedInventoryItem, CharacterStats } from '../../types';
import { useTooltipPosition } from '../../hooks/useTooltipPosition';
import { getTalismanEffectLines } from '../../utils/talismanEffects';
import { estimateARWithBreakdown, estimatePassiveBuildup } from '../../utils/arCalc';
// Reutiliza los estilos del ItemTooltip del equipo para consistencia visual
import styles from '../ItemTooltip/ItemTooltip.module.css';
import invStyles from './InventoryTooltip.module.css';

interface Props {
  item: ResolvedInventoryItem;
  triggerRect: DOMRect;
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

/** Colores por tipo de passive */
const PASSIVE_COLOR: Record<string, string> = {
  blood: '#c06060', frost: '#70b0d0', poison: '#6a9a3a', rot: '#c07030',
  sleep: '#8070b0', madness: '#c0a020', death: '#808080',
};
const PASSIVE_LABEL: Record<string, string> = {
  blood: 'Bleed', frost: 'Frost', poison: 'Poison', rot: 'Scarlet Rot',
  sleep: 'Sleep', madness: 'Madness', death: 'Death Blight',
};

function ScalingBadge({ stat, grade }: { stat: string; grade: string }) {
  const g = (grade?.toUpperCase() ?? '-') as ScalingGrade;
  if (g === '-') return null;
  const cls = GRADE_CLASS[g] ?? styles.gradeNone;
  return <span className={`${styles.badge} ${cls}`}>{stat}: {g}</span>;
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

/** Colores por tipo de daño */
const DMG_COLOR: Record<string, string> = {
  physical:  '#c8bfa0',
  magic:     '#6a9cd4',
  fire:      '#d4703c',
  lightning: '#d4c03c',
  holy:      '#c4a84c',
};

function ColorDamageBar({ label, value, max, color }: { label: string; value: number; max: number; color?: string }) {
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
      <span className={styles.damageValue} style={{ color: color ?? undefined }}>{value}</span>
    </div>
  );
}

/** Sección de daño para armas */
function WeaponSection({ item, stats }: { item: ResolvedInventoryItem; stats?: CharacterStats }) {
  const { damage, scaling, weight, stability, passives, requirements, guardNegation, critical } = item;
  if (!damage && !scaling && !stability && !guardNegation) return null;

  // AR estimado si hay stats del personaje y el arma tiene damage+scaling
  const arData = useMemo(() => {
    if (!stats || !damage || !scaling) return null;
    // ResolvedInventoryItem es estructuralmente compatible con EquippedWeapon
    return estimateARWithBreakdown(item as any, stats);
  }, [item, stats, damage, scaling]);

  const arMax = 650;
  const maxDmg = damage
    ? Math.max(damage.physical, damage.magic, damage.fire, damage.lightning, damage.holy, 1)
    : 1;
  const hasScaling = scaling && Object.values(scaling).some(v => v !== '-');

  // ARC passive scaling
  const arcGrade = scaling?.arc ?? '-';

  return (
    <>
      {damage && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>
            {arData ? 'Estimated AR' : 'Attack Power'}
          </div>
          {arData ? (
            <>
              <ColorDamageBar label="Physical"  value={arData.ar.physical}  max={arMax} color={DMG_COLOR.physical}  />
              <ColorDamageBar label="Magic"     value={arData.ar.magic}     max={arMax} color={DMG_COLOR.magic}     />
              <ColorDamageBar label="Fire"      value={arData.ar.fire}      max={arMax} color={DMG_COLOR.fire}      />
              <ColorDamageBar label="Lightning" value={arData.ar.lightning} max={arMax} color={DMG_COLOR.lightning} />
              <ColorDamageBar label="Holy"      value={arData.ar.holy}      max={arMax} color={DMG_COLOR.holy}      />
            </>
          ) : (
            <>
              <DamageBar label="Physical"  value={damage.physical}  max={maxDmg} />
              <DamageBar label="Magic"     value={damage.magic}     max={maxDmg} />
              <DamageBar label="Fire"      value={damage.fire}      max={maxDmg} />
              <DamageBar label="Lightning" value={damage.lightning} max={maxDmg} />
              <DamageBar label="Holy"      value={damage.holy}      max={maxDmg} />
            </>
          )}
        </div>
      )}
      {critical != null && critical !== 100 && (
        <div className={styles.section}>
          <div className={styles.statRow}>
            <span className={styles.statLabel}>Critical</span>
            <span className={styles.statValue}>{critical}</span>
          </div>
        </div>
      )}
      {hasScaling && scaling && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Scaling</div>
          <div className={styles.badgeRow}>
            <ScalingBadge stat="STR" grade={scaling.str} />
            <ScalingBadge stat="DEX" grade={scaling.dex} />
            <ScalingBadge stat="INT" grade={scaling.int} />
            <ScalingBadge stat="FAI" grade={scaling.fai} />
            <ScalingBadge stat="ARC" grade={scaling.arc} />
          </div>
        </div>
      )}
      {passives && passives.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Passive Effects</div>
          {passives.map(p => {
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
      {requirements && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Requirements</div>
          <div className={styles.badgeRow}>
            {requirements.str > 0 && (
              <span className={`${styles.badge} ${stats && stats.strength < requirements.str ? styles.reqUnmet : styles.reqMet}`}>
                STR {requirements.str}
              </span>
            )}
            {requirements.dex > 0 && (
              <span className={`${styles.badge} ${stats && stats.dexterity < requirements.dex ? styles.reqUnmet : styles.reqMet}`}>
                DEX {requirements.dex}
              </span>
            )}
            {requirements.int > 0 && (
              <span className={`${styles.badge} ${stats && stats.intelligence < requirements.int ? styles.reqUnmet : styles.reqMet}`}>
                INT {requirements.int}
              </span>
            )}
            {requirements.fai > 0 && (
              <span className={`${styles.badge} ${stats && stats.faith < requirements.fai ? styles.reqUnmet : styles.reqMet}`}>
                FAI {requirements.fai}
              </span>
            )}
            {requirements.arc > 0 && (
              <span className={`${styles.badge} ${stats && stats.arcane < requirements.arc ? styles.reqUnmet : styles.reqMet}`}>
                ARC {requirements.arc}
              </span>
            )}
          </div>
        </div>
      )}
      {guardNegation && !damage && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Guarded Dmg Negation</div>
          <ColorDamageBar label="Physical"  value={guardNegation.physical}  max={100} color={DMG_COLOR.physical}  />
          <ColorDamageBar label="Magic"     value={guardNegation.magic}     max={100} color={DMG_COLOR.magic}     />
          <ColorDamageBar label="Fire"      value={guardNegation.fire}      max={100} color={DMG_COLOR.fire}      />
          <ColorDamageBar label="Lightning" value={guardNegation.lightning} max={100} color={DMG_COLOR.lightning} />
          <ColorDamageBar label="Holy"      value={guardNegation.holy}      max={100} color={DMG_COLOR.holy}      />
        </div>
      )}
      {guardNegation && damage && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Guard Negation</div>
          <ColorDamageBar label="Physical"  value={guardNegation.physical}  max={60} color={DMG_COLOR.physical}  />
          <ColorDamageBar label="Magic"     value={guardNegation.magic}     max={60} color={DMG_COLOR.magic}     />
          <ColorDamageBar label="Fire"      value={guardNegation.fire}      max={60} color={DMG_COLOR.fire}      />
          <ColorDamageBar label="Lightning" value={guardNegation.lightning} max={60} color={DMG_COLOR.lightning} />
          <ColorDamageBar label="Holy"      value={guardNegation.holy}      max={60} color={DMG_COLOR.holy}      />
          {guardNegation.boost != null && guardNegation.boost > 0 && (
            <div className={styles.statRow}>
              <span className={styles.statLabel}>Guard Boost</span>
              <span className={styles.statValue}>{guardNegation.boost}</span>
            </div>
          )}
        </div>
      )}
      {stability !== undefined && stability > 0 && (
        <div className={styles.weightRow}>
          <span className={styles.weightLabel}>Guard Boost</span>
          <span className={styles.weightValue}>{stability}</span>
        </div>
      )}
      {weight !== undefined && weight > 0 && (
        <div className={`${styles.weightRow} ${stability ? invStyles.noTopBorder : ''}`}>
          <span className={styles.weightLabel}>Weight</span>
          <span className={styles.weightValue}>{weight.toFixed(1)}</span>
        </div>
      )}
    </>
  );
}

/** Sección de defensa para armaduras */
function ArmorSection({ item }: { item: ResolvedInventoryItem }) {
  const { defense, weight, poise, immunity, robustness, focus, vitality } = item;
  if (!defense) return null;

  const maxDef = Math.max(
    defense.physical, defense.strike, defense.slash, defense.pierce,
    defense.magic, defense.fire, defense.lightning, defense.holy, 1,
  );

  const hasResistances = (poise != null && poise > 0) ||
    (immunity != null && immunity > 0) || (robustness != null && robustness > 0) ||
    (focus != null && focus > 0) || (vitality != null && vitality > 0);

  return (
    <>
      <div className={styles.section}>
        <div className={styles.sectionLabel}>Dmg Negation</div>
        <DamageBar label="Physical"  value={defense.physical}  max={maxDef} />
        <DamageBar label="  Strike"  value={defense.strike}    max={maxDef} />
        <DamageBar label="  Slash"   value={defense.slash}     max={maxDef} />
        <DamageBar label="  Pierce"  value={defense.pierce}    max={maxDef} />
        <DamageBar label="Magic"     value={defense.magic}     max={maxDef} />
        <DamageBar label="Fire"      value={defense.fire}      max={maxDef} />
        <DamageBar label="Lightning" value={defense.lightning} max={maxDef} />
        <DamageBar label="Holy"      value={defense.holy}      max={maxDef} />
      </div>
      {hasResistances && (
        <div className={styles.section}>
          {poise != null && poise > 0 && (
            <div className={styles.statRow}>
              <span className={styles.statLabel}>Poise</span>
              <span className={styles.statValue}>{poise}</span>
            </div>
          )}
          {immunity != null && immunity > 0 && (
            <div className={styles.statRow}>
              <span className={styles.statLabel} style={{ color: '#8bc34a' }}>Immunity</span>
              <span className={styles.statValue}>{immunity}</span>
            </div>
          )}
          {robustness != null && robustness > 0 && (
            <div className={styles.statRow}>
              <span className={styles.statLabel} style={{ color: '#e57373' }}>Robustness</span>
              <span className={styles.statValue}>{robustness}</span>
            </div>
          )}
          {focus != null && focus > 0 && (
            <div className={styles.statRow}>
              <span className={styles.statLabel} style={{ color: '#ba68c8' }}>Focus</span>
              <span className={styles.statValue}>{focus}</span>
            </div>
          )}
          {vitality != null && vitality > 0 && (
            <div className={styles.statRow}>
              <span className={styles.statLabel} style={{ color: '#78909c' }}>Vitality</span>
              <span className={styles.statValue}>{vitality}</span>
            </div>
          )}
        </div>
      )}
      {weight !== undefined && weight > 0 && (
        <div className={styles.weightRow}>
          <span className={styles.weightLabel}>Weight</span>
          <span className={styles.weightValue}>{weight.toFixed(1)}</span>
        </div>
      )}
      {defense && weight != null && weight > 0 && (
        <div className={styles.efficiencyRow}>
          Efficiency {(defense.physical / weight).toFixed(1)}
        </div>
      )}
    </>
  );
}

/** Sección de efecto textual (talismanes, consumibles, etc.) */
function EffectSection({ effect }: { effect: string }) {
  return (
    <div className={invStyles.effectText}>{effect}</div>
  );
}

/** Sección de ceniza de guerra */
function AshSection({ item }: { item: ResolvedInventoryItem }) {
  const { affinity, skill } = item;
  if (!affinity && !skill) return null;
  return (
    <div className={styles.section}>
      {affinity && affinity !== 'None' && (
        <div className={invStyles.ashRow}>
          <span className={invStyles.ashLabel}>Affinity</span>
          <span className={invStyles.ashValue}>{affinity}</span>
        </div>
      )}
      {skill && (
        <div className={invStyles.ashRow}>
          <span className={invStyles.ashLabel}>Skill</span>
          <span className={invStyles.ashValue}>{skill}</span>
        </div>
      )}
    </div>
  );
}

/** Sección de espíritu invocable */
function SpiritSection({ item }: { item: ResolvedInventoryItem }) {
  const { fpCost, hpCost, effect } = item;
  const hasCosts = (fpCost !== undefined && fpCost > 0) || (hpCost !== undefined && hpCost > 0);
  if (!hasCosts && !effect) return null;
  return (
    <>
      {hasCosts && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Summon Cost</div>
          {fpCost !== undefined && fpCost > 0 && (
            <div className={invStyles.costRow}>
              <span className={invStyles.fpLabel}>FP</span>
              <span className={invStyles.costValue}>{fpCost}</span>
            </div>
          )}
          {hpCost !== undefined && hpCost > 0 && (
            <div className={invStyles.costRow}>
              <span className={invStyles.hpLabel}>HP</span>
              <span className={invStyles.costValue}>{hpCost}</span>
            </div>
          )}
        </div>
      )}
      {effect && <EffectSection effect={effect} />}
    </>
  );
}

/** Sección de hechizo (tipo, cost, slots, requirements, description) */
function SpellSection({ item, stats }: { item: ResolvedInventoryItem; stats?: CharacterStats }) {
  const { itemType, cost, slots, requirements, description } = item;
  return (
    <>
      {itemType && (
        <div className={invStyles.spellType}>
          {itemType === 'sorcery' ? 'Sorcery' : 'Incantation'}
        </div>
      )}
      {(cost !== undefined || slots !== undefined) && (
        <div className={styles.section}>
          {cost !== undefined && cost > 0 && (
            <div className={invStyles.costRow}>
              <span className={invStyles.fpLabel}>FP</span>
              <span className={invStyles.costValue}>{cost}</span>
            </div>
          )}
          {slots !== undefined && slots > 0 && (
            <div className={invStyles.costRow}>
              <span className={invStyles.slotsLabel}>Slots</span>
              <span className={invStyles.costValue}>{slots}</span>
            </div>
          )}
        </div>
      )}
      {requirements && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Requirements</div>
          <div className={styles.badgeRow}>
            {requirements.int > 0 && (
              <span className={`${styles.badge} ${stats && stats.intelligence < requirements.int ? styles.reqUnmet : styles.reqMet}`}>
                INT {requirements.int}
              </span>
            )}
            {requirements.fai > 0 && (
              <span className={`${styles.badge} ${stats && stats.faith < requirements.fai ? styles.reqUnmet : styles.reqMet}`}>
                FAI {requirements.fai}
              </span>
            )}
            {requirements.arc > 0 && (
              <span className={`${styles.badge} ${stats && stats.arcane < requirements.arc ? styles.reqUnmet : styles.reqMet}`}>
                ARC {requirements.arc}
              </span>
            )}
          </div>
        </div>
      )}
      {description && (
        <div className={invStyles.effectText}>{description}</div>
      )}
    </>
  );
}

/** Contenido del tooltip según categoría */
function TooltipContent({ item, stats }: { item: ResolvedInventoryItem; stats?: CharacterStats }) {
  const cat = item.category;

  if (cat === 'weapon' || cat === 'ammo') {
    return <WeaponSection item={item} stats={stats} />;
  }
  if (cat === 'armor') {
    return <ArmorSection item={item} />;
  }
  if (cat === 'talisman') {
    const effectLines = getTalismanEffectLines(item.baseId ?? 0);
    return (
      <>
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
        {!effectLines && item.effect && <EffectSection effect={item.effect} />}
        {item.weight !== undefined && item.weight > 0 && (
          <div className={styles.weightRow}>
            <span className={styles.weightLabel}>Weight</span>
            <span className={styles.weightValue}>{item.weight.toFixed(1)}</span>
          </div>
        )}
      </>
    );
  }
  if (cat === 'ash_of_war') {
    return <AshSection item={item} />;
  }
  if (cat === 'spirit') {
    return <SpiritSection item={item} />;
  }
  if (cat === 'spell') {
    return (
      <>
        <SpellSection item={item} stats={stats} />
      </>
    );
  }
  if ((cat === 'consumable' || cat === 'key_item' || cat === 'crystal_tear') && item.effect) {
    return <EffectSection effect={item.effect} />;
  }
  return null;
}

export default function InventoryTooltip({ item, triggerRect, stats }: Props) {
  const pos = useTooltipPosition(triggerRect);

  // Nombre limpio de prefijo "Ash of War: "
  const displayName = item.name.replace(/^Ash of War:\s*/i, '');

  // Parsear upgrade level del nombre
  const levelMatch = displayName.match(/ \+(\d+)$/);
  const upgradeLevel = levelMatch ? parseInt(levelMatch[1], 10) : null;
  const baseName = upgradeLevel !== null ? displayName.replace(/ \+\d+$/, '') : displayName;

  // Subtítulo de tipo
  const subtitle = item.itemType
    ? String(item.itemType).charAt(0).toUpperCase() + String(item.itemType).slice(1)
    : undefined;

  const tooltip = (
    <div className={styles.tooltip} style={{ left: pos.x, top: pos.y }}>
      {/* ── Nombre ── */}
      <div className={styles.header}>
        <span className={styles.name}>{baseName}</span>
        {upgradeLevel !== null && (
          <span className={styles.upgradeLevel}>+{upgradeLevel}</span>
        )}
      </div>

      {subtitle && (
        <div className={invStyles.subtitle}>{subtitle}</div>
      )}
      {item.damageTypes && item.damageTypes.length > 0 && (
        <div className={styles.badgeRow} style={{ marginBottom: '0.4rem' }}>
          {item.damageTypes.map(t => (
            <span key={t} className={styles.dmgTypeBadge}>{t}</span>
          ))}
        </div>
      )}

      <div className={styles.divider} />

      <TooltipContent item={item} stats={stats} />
    </div>
  );

  return createPortal(tooltip, document.body);
}
