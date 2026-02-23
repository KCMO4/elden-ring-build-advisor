import { createPortal } from 'react-dom';
import type { ResolvedInventoryItem } from '../../types';
import { useTooltipPosition } from '../../hooks/useTooltipPosition';
// Reutiliza los estilos del ItemTooltip del equipo para consistencia visual
import styles from '../ItemTooltip/ItemTooltip.module.css';
import invStyles from './InventoryTooltip.module.css';

interface Props {
  item: ResolvedInventoryItem;
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

/** Sección de daño para armas */
function WeaponSection({ item }: { item: ResolvedInventoryItem }) {
  const { damage, scaling, weight, stability } = item;
  if (!damage && !scaling && !stability) return null;

  const maxDmg = damage
    ? Math.max(damage.physical, damage.magic, damage.fire, damage.lightning, damage.holy, 1)
    : 1;
  const hasScaling = scaling && Object.values(scaling).some(v => v !== '-');

  return (
    <>
      {damage && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Attack Power</div>
          <DamageBar label="Physical"  value={damage.physical}  max={maxDmg} />
          <DamageBar label="Magic"     value={damage.magic}     max={maxDmg} />
          <DamageBar label="Fire"      value={damage.fire}      max={maxDmg} />
          <DamageBar label="Lightning" value={damage.lightning} max={maxDmg} />
          <DamageBar label="Holy"      value={damage.holy}      max={maxDmg} />
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
  const { defense, weight } = item;
  if (!defense) return null;

  const maxDef = Math.max(
    defense.physical, defense.strike, defense.slash, defense.pierce,
    defense.magic, defense.fire, defense.lightning, defense.holy, 1,
  );

  return (
    <>
      <div className={styles.section}>
        <div className={styles.sectionLabel}>Dmg Negation</div>
        <DamageBar label="Physical"  value={defense.physical}  max={maxDef} />
        <DamageBar label="Strike"    value={defense.strike}    max={maxDef} />
        <DamageBar label="Slash"     value={defense.slash}     max={maxDef} />
        <DamageBar label="Pierce"    value={defense.pierce}    max={maxDef} />
        <DamageBar label="Magic"     value={defense.magic}     max={maxDef} />
        <DamageBar label="Fire"      value={defense.fire}      max={maxDef} />
        <DamageBar label="Lightning" value={defense.lightning} max={maxDef} />
        <DamageBar label="Holy"      value={defense.holy}      max={maxDef} />
      </div>
      {weight !== undefined && weight > 0 && (
        <div className={styles.weightRow}>
          <span className={styles.weightLabel}>Weight</span>
          <span className={styles.weightValue}>{weight.toFixed(1)}</span>
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

/** Sección de tipo de hechizo */
function SpellSection({ item }: { item: ResolvedInventoryItem }) {
  const { itemType } = item;
  if (!itemType) return null;
  return (
    <div className={invStyles.spellType}>
      {itemType === 'sorcery' ? 'Sorcery' : 'Incantation'}
    </div>
  );
}

/** Contenido del tooltip según categoría */
function TooltipContent({ item }: { item: ResolvedInventoryItem }) {
  const cat = item.category;

  if (cat === 'weapon' || cat === 'ammo') {
    return <WeaponSection item={item} />;
  }
  if (cat === 'armor') {
    return <ArmorSection item={item} />;
  }
  if (cat === 'talisman') {
    return item.effect ? <EffectSection effect={item.effect} /> : null;
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
        <SpellSection item={item} />
      </>
    );
  }
  if ((cat === 'consumable' || cat === 'key_item' || cat === 'crystal_tear') && item.effect) {
    return <EffectSection effect={item.effect} />;
  }
  return null;
}

export default function InventoryTooltip({ item, triggerRect }: Props) {
  const pos = useTooltipPosition(triggerRect);

  // Nombre limpio de prefijo "Ash of War: "
  const displayName = item.name.replace(/^Ash of War:\s*/i, '');

  // Subtítulo de tipo
  const subtitle = item.itemType
    ? String(item.itemType).charAt(0).toUpperCase() + String(item.itemType).slice(1)
    : undefined;

  const tooltip = (
    <div className={styles.tooltip} style={{ left: pos.x, top: pos.y }}>
      {/* ── Nombre ── */}
      <div className={styles.header}>
        <span className={styles.name}>{displayName}</span>
      </div>

      {subtitle && (
        <div className={invStyles.subtitle}>{subtitle}</div>
      )}

      <div className={styles.divider} />

      <TooltipContent item={item} />
    </div>
  );

  return createPortal(tooltip, document.body);
}
