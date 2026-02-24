import { useMemo } from 'react';
import type { CharacterStats, EquippedItems, DamageStats, DefenseStats } from '../../types';
import { useMountAnimation } from '../../hooks/useMountAnimation';
import { computeTalismanBonuses } from '../../utils/talismanEffects';
import { estimateEquippedAR, stackNegation } from '../../utils/arCalc';
import styles from './DerivedStatsPanel.module.css';

interface Props {
  stats:    CharacterStats;
  equipped: EquippedItems;
  level:    number;
}

// ── Fórmulas exactas de Elden Ring ────────────────────────────
// Interpolación de potencia piecewise (reverse-engineered por la comunidad)

function calcHP(vig: number): number {
  const v = Math.min(99, Math.max(1, vig));
  let hp: number;
  if      (v <= 25) hp = 300  + 500 * Math.pow((v - 1)  / 24, 1.5);
  else if (v <= 40) hp = 800  + 650 * Math.pow((v - 25) / 15, 1.1);
  else if (v <= 60) hp = 1450 + 450 * (1 - Math.pow(1 - (v - 40) / 20, 1.2));
  else              hp = 1900 + 200 * (1 - Math.pow(1 - (v - 60) / 39, 1.2));
  return Math.floor(hp);
}

function calcFP(mnd: number): number {
  const m = Math.min(99, Math.max(1, mnd));
  let fp: number;
  if      (m <= 15) fp = 40  + 55  * ((m - 1)  / 14);
  else if (m <= 35) fp = 95  + 105 * ((m - 15) / 20);
  else if (m <= 60) fp = 200 + 150 * (1 - Math.pow(1 - (m - 35) / 25, 1.2));
  else              fp = 350 + 100 * ((m - 60) / 39);
  return Math.floor(fp);
}

function calcStamina(end: number): number {
  const e = Math.min(99, Math.max(1, end));
  let sta: number;
  if      (e <= 15) sta = 80  + 25 * ((e - 1)  / 14);
  else if (e <= 30) sta = 105 + 25 * ((e - 15) / 15);
  else if (e <= 50) sta = 130 + 25 * ((e - 30) / 20);
  else              sta = 155 + 15 * ((e - 50) / 49);
  return Math.floor(sta);
}

function calcMaxEquipLoad(end: number): number {
  const e = Math.min(99, Math.max(1, end));
  let load: number;
  if      (e <= 8)  load = 45;
  else if (e <= 25) load = 45  + 27 * ((e - 8)  / 17);
  else if (e <= 60) load = 72  + 48 * Math.pow((e - 25) / 35, 1.1);
  else              load = 120 + 40 * ((e - 60) / 39);
  return Math.round(load * 10) / 10;
}

// ── Helpers ──────────────────────────────────────────────────

function equipWeight(eq: EquippedItems): number {
  const all = [...eq.rightHand, ...eq.leftHand, eq.head, eq.chest, eq.hands, eq.legs];
  const total = all.reduce((s, item) => s + (item.weight ?? 0), 0);
  return Math.round(total * 10) / 10;
}

/** Total poise from equipped armor pieces (simple sum) */
function totalPoise(eq: EquippedItems): number {
  return [eq.head, eq.chest, eq.hands, eq.legs]
    .reduce((sum, p) => sum + (p.poise ?? 0), 0);
}

// ── Fórmulas exactas de resistencias de Elden Ring ──────────────
// Resistencia = floor(LevelComponent + AttributeComponent) + ArmorSum

/** Rune Level component — identical for all 4 resistances */
function resistLevelComponent(runeLevel: number): number {
  const lvl = runeLevel + 79; // internal formula uses lvl+79
  if (lvl <= 149) return 75 + 30 * ((lvl - 1) / 149);
  if (lvl <= 190) return 105 + 40 * ((lvl - 150) / 40);
  if (lvl <= 240) return 145 + 15 * ((lvl - 190) / 50);
  return 160 + 20 * ((lvl - 240) / 552);
}

/** Attribute component for Immunity (Vigor), Robustness (Endurance), Focus (Mind) */
function resistAttrComponent(stat: number): number {
  if (stat <= 30) return 0;
  if (stat <= 40) return 30 * ((stat - 30) / 10);
  if (stat <= 60) return 30 + 10 * ((stat - 40) / 20);
  return 40 + 10 * ((stat - 60) / 39);
}

/** Attribute component for Vitality (Arcane) — different curve, starts from level 1 */
function resistArcaneComponent(arc: number): number {
  if (arc <= 15) return arc;
  if (arc <= 40) return 15 + 15 * ((arc - 15) / 25);
  if (arc <= 60) return 30 + 10 * ((arc - 40) / 20);
  return 40 + 10 * ((arc - 60) / 39);
}

interface ResistanceTotals {
  immunity: number;
  robustness: number;
  focus: number;
  vitality: number;
}

function calcResistances(
  level: number,
  stats: CharacterStats,
  eq: EquippedItems,
): ResistanceTotals {
  const pieces = [eq.head, eq.chest, eq.hands, eq.legs];
  const armorSum = (key: 'immunity' | 'robustness' | 'focus' | 'vitality') =>
    pieces.reduce((s, p) => s + (p[key] ?? 0), 0);

  const lvlComp = resistLevelComponent(level);
  return {
    immunity:   Math.floor(lvlComp + resistAttrComponent(stats.vigor))      + armorSum('immunity'),
    robustness: Math.floor(lvlComp + resistAttrComponent(stats.endurance))  + armorSum('robustness'),
    focus:      Math.floor(lvlComp + resistAttrComponent(stats.mind))       + armorSum('focus'),
    vitality:   Math.floor(lvlComp + resistArcaneComponent(stats.arcane))   + armorSum('vitality'),
  };
}

/**
 * Calcula la negación total de daño usando apilamiento MULTIPLICATIVO.
 * Fórmula del juego: total% = (1 − ∏(1 − ni/100)) × 100
 * Las 4 piezas de armadura contribuyen independientemente.
 */
function totalNegation(eq: EquippedItems): DefenseStats {
  const pieces = [eq.head, eq.chest, eq.hands, eq.legs];

  const collect = (key: keyof DefenseStats): number[] =>
    pieces
      .filter(p => p.defense != null)
      .map(p => p.defense![key] ?? 0);

  return {
    physical:  stackNegation(collect('physical')),
    strike:    stackNegation(collect('strike')),
    slash:     stackNegation(collect('slash')),
    pierce:    stackNegation(collect('pierce')),
    magic:     stackNegation(collect('magic')),
    fire:      stackNegation(collect('fire')),
    lightning: stackNegation(collect('lightning')),
    holy:      stackNegation(collect('holy')),
  };
}

// ── Tipos de daño (para Attack) ───────────────────────────────
const DMG_TYPES: { key: keyof DamageStats; label: string; color: string }[] = [
  { key: 'physical',  label: 'Physical',  color: '#c8bfa0' },
  { key: 'magic',     label: 'Magic',     color: '#6a9cd4' },
  { key: 'fire',      label: 'Fire',      color: '#d4703c' },
  { key: 'lightning', label: 'Lightning', color: '#d4c03c' },
  { key: 'holy',      label: 'Holy',      color: '#c4a84c' },
];

// ── Tipos de defensa (8 tipos como en el juego) ───────────────
const DEF_TYPES: { key: keyof DefenseStats; label: string; color: string; indent?: boolean }[] = [
  { key: 'physical',  label: 'Physical',  color: '#c8bfa0' },
  { key: 'strike',    label: 'VS Strike', color: '#a8a090', indent: true },
  { key: 'slash',     label: 'VS Slash',  color: '#a8a090', indent: true },
  { key: 'pierce',    label: 'VS Pierce', color: '#a8a090', indent: true },
  { key: 'magic',     label: 'Magic',     color: '#6a9cd4' },
  { key: 'fire',      label: 'Fire',      color: '#d4703c' },
  { key: 'lightning', label: 'Lightning', color: '#d4c03c' },
  { key: 'holy',      label: 'Holy',      color: '#c4a84c' },
];

// ── Subcomponente: fila de protección con formato "X / Y%" ────

interface NegRowProps {
  label: string;
  negation: number;
  color: string;
  maxNeg?: number;
  ready: boolean;
  delay: number;
  indent?: boolean;
}

function NegRow({ label, negation, color, maxNeg = 60, ready, delay, indent }: NegRowProps) {
  const pct = Math.min((negation / maxNeg) * 100, 100);
  return (
    <div className={`${styles.negRow} ${indent ? styles.negRowIndent : ''}`}>
      <span className={styles.negLabel} style={indent ? { color: '#7a7060' } : undefined}>{label}</span>
      <div className={styles.negBar}>
        <div
          className={styles.negFill}
          style={{
            width: ready ? `${pct}%` : '0%',
            background: color,
            transitionDelay: `${delay}ms`,
            opacity: indent ? 0.65 : 0.85,
          }}
        />
      </div>
      <span className={styles.negValue} style={{ color: indent ? '#9a9080' : color }}>
        {negation > 0 ? (Number.isInteger(negation) ? negation : negation.toFixed(1)) : '—'}
      </span>
    </div>
  );
}

// ── Subcomponente: fila de body stats ─────────────────────────

interface BodyRowProps { label: string; value: number; max: number; colorClass: string; ready: boolean; delay: number }

function BodyRow({ label, value, max, colorClass, ready, delay }: BodyRowProps) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <div className={`${styles.barTrack} ${colorClass}`}>
        <div
          className={styles.barFill}
          style={{
            width: ready ? `${Math.min((value / max) * 100, 100)}%` : '0%',
            transitionDelay: `${delay}ms`,
          }}
        />
      </div>
      <span className={styles.rowValue}>{value}</span>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────

// ── Tipos de resistencia ──────────────────────────────────────
const RESIST_TYPES: { key: keyof ResistanceTotals; label: string; color: string }[] = [
  { key: 'immunity',   label: 'Immunity',   color: '#8bc34a' },
  { key: 'robustness', label: 'Robustness', color: '#e57373' },
  { key: 'focus',      label: 'Focus',      color: '#ba68c8' },
  { key: 'vitality',   label: 'Vitality',   color: '#78909c' },
];

export default function DerivedStatsPanel({ stats, equipped, level }: Props) {
  const ready = useMountAnimation();

  // Bonuses de talismanes equipados
  const talBonus = useMemo(
    () => computeTalismanBonuses(equipped.talismans),
    [equipped.talismans],
  );

  // Stats efectivos (base + bonus de atributo de talismanes)
  const effVig = Math.min(99, stats.vigor      + (talBonus.attrs.vigor      ?? 0));
  const effMnd = Math.min(99, stats.mind       + (talBonus.attrs.mind       ?? 0));
  const effEnd = Math.min(99, stats.endurance  + (talBonus.attrs.endurance  ?? 0));

  // Derivadas con multiplicadores de talismanes
  const hp      = Math.floor(calcHP(effVig)          * (1 + talBonus.hpBonus));
  const fp      = Math.floor(calcFP(effMnd)          * (1 + talBonus.fpBonus));
  const stamina = Math.floor(calcStamina(effEnd)      * (1 + talBonus.staminaBonus));
  const maxLoad = Math.round(calcMaxEquipLoad(effEnd) * (1 + talBonus.equipLoadBonus) * 10) / 10;

  const currLoad = equipWeight(equipped);
  const loadPct  = maxLoad > 0 ? (currLoad / maxLoad) * 100 : 0;
  const loadTag  = loadPct < 30 ? 'Light' : loadPct < 70 ? 'Medium' : loadPct < 100 ? 'Heavy' : 'Overloaded!';

  const neg      = totalNegation(equipped);
  const hasArmor = Object.values(neg).some(v => v > 0);

  const poise    = totalPoise(equipped);
  const resist   = calcResistances(level, stats, equipped);

  // Arma principal RH: primer slot con arma real
  const mainWeapon = equipped.rightHand.find(w => w.name && w.damage) ?? null;

  // AR estimado (base × upgrade + escalado de atributos)
  const arEstimate = useMemo(
    () => mainWeapon?.damage ? estimateEquippedAR(mainWeapon, stats) : null,
    [mainWeapon, stats],
  );

  return (
    <div className={styles.panel}>

      {/* ── Body ── */}
      <div className={styles.section}>
        <span className={styles.sectionTitle}>Body</span>
        <BodyRow label="HP"      value={hp}     max={2100} colorClass={styles.barVig} ready={ready} delay={0} />
        <BodyRow label="FP"      value={fp}     max={450}  colorClass={styles.barMnd} ready={ready} delay={80} />
        <BodyRow label="Stamina" value={stamina} max={170}  colorClass={styles.barEnd} ready={ready} delay={160} />

        {/* Equip Load */}
        <div className={styles.loadRow}>
          <span className={styles.rowLabel}>Equip Load</span>
          <div className={styles.loadBarWrap}>
            <div className={`${styles.barTrack} ${loadPct >= 100 ? styles.barOver : styles.barLoad}`}>
              <div className={styles.barFill} style={{ width: ready ? `${Math.min(loadPct, 100)}%` : '0%', transitionDelay: '240ms' }} />
            </div>
            {/* Thresholds: 30% (light/medium) y 70% (medium/heavy) */}
            <div className={`${styles.loadTick} ${loadPct >= 30 ? styles.loadTickReached : ''}`} style={{ left: '30%' }} title="Light / Medium (30%)" />
            <div className={`${styles.loadTick} ${loadPct >= 70 ? styles.loadTickReached : ''}`} style={{ left: '70%' }} title="Medium / Heavy (70%)" />
          </div>
          <span className={styles.rowValue}>
            {currLoad > 0 ? `${currLoad} / ${maxLoad.toFixed(1)}` : `— / ${maxLoad.toFixed(1)}`}
          </span>
          <span className={`${styles.loadTag} ${loadPct >= 70 ? styles.loadTagWarn : ''}`}>{loadTag}</span>
        </div>
      </div>

      {/* ── Attack ── */}
      {mainWeapon && arEstimate && (
        <div className={styles.section}>
          <span className={styles.sectionTitle}>
            Attack
            <span className={styles.sectionNote}>{mainWeapon.name}{mainWeapon.upgradeLevel ? ` +${mainWeapon.upgradeLevel}` : ''}</span>
          </span>
          {DMG_TYPES.map(({ key, label, color }, i) => {
            const v = arEstimate[key as keyof typeof arEstimate] as number;
            if (!v || v <= 0) return null;
            return (
              <div key={key} className={styles.row}>
                <span className={styles.rowLabel}>{label}</span>
                <div className={styles.barTrack}>
                  <div
                    className={styles.barFill}
                    style={{
                      width: ready ? `${Math.min((v / 650) * 100, 100)}%` : '0%',
                      background: color,
                      transitionDelay: `${320 + i * 60}ms`,
                    }}
                  />
                </div>
                <span className={styles.rowValue}>~{v}</span>
              </div>
            );
          })}
          {mainWeapon.scaling && (
            <div className={styles.scalingRow}>
              {(['str','dex','int','fai','arc'] as const).map(s => {
                const grade = mainWeapon.scaling![s];
                if (!grade || grade === '-') return null;
                return (
                  <span key={s} className={styles.scalingBadge}>
                    <span className={styles.scalingStat}>{s.toUpperCase()}</span>
                    <span className={styles.scalingGrade}>{grade}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Defense / Dmg Negation ── */}
      {hasArmor && (
        <div className={styles.section}>
          <span className={styles.sectionTitle}>Dmg Negation %</span>
          {DEF_TYPES.map(({ key, label, color, indent }, i) => (
            <NegRow
              key={key}
              label={label}
              negation={neg[key]}
              color={color}
              ready={ready}
              delay={500 + i * 50}
              indent={indent}
            />
          ))}
        </div>
      )}

      {/* ── Poise ── */}
      {poise > 0 && (
        <div className={styles.section}>
          <span className={styles.sectionTitle}>Poise</span>
          <BodyRow label="Poise" value={Math.round(poise * 10) / 10} max={100} colorClass={styles.barPoise} ready={ready} delay={900} />
        </div>
      )}

      {/* ── Resistances ── */}
      <div className={styles.section}>
        <span className={styles.sectionTitle}>Resistances</span>
        {RESIST_TYPES.map(({ key, label, color }, i) => (
          <NegRow
            key={key}
            label={label}
            negation={resist[key]}
            color={color}
            maxNeg={300}
            ready={ready}
            delay={960 + i * 50}
          />
        ))}
      </div>

    </div>
  );
}
