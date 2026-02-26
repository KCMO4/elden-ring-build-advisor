import { useState, useMemo } from 'react';
import type { CharacterStats, EquippedItems, Inventory, ResolvedInventoryItem } from '../../types';
import { computeTalismanBonuses } from '../../utils/talismanEffects';
import styles from './ArmorOptimizer.module.css';

// ── Types ────────────────────────────────────────────────────

interface Props {
  equipped: EquippedItems;
  inventory: Inventory;
  stats: CharacterStats;
}

type RollClass = 'light' | 'medium' | 'heavy';

type GoalKey =
  | 'poise'
  | 'physical' | 'magic' | 'fire' | 'lightning' | 'holy'
  | 'immunity' | 'robustness' | 'focus' | 'vitality';

interface ArmorPiece {
  name: string;
  slot: 'head' | 'chest' | 'arms' | 'legs';
  weight: number;
  poise: number;
  physical: number;
  magic: number;
  fire: number;
  lightning: number;
  holy: number;
  immunity: number;
  robustness: number;
  focus: number;
  vitality: number;
}

interface ArmorSet {
  head: ArmorPiece | null;
  chest: ArmorPiece | null;
  arms: ArmorPiece | null;
  legs: ArmorPiece | null;
  score: number;
  totalWeight: number;
}

// ── Constants ────────────────────────────────────────────────

const GOALS: { key: GoalKey; label: string }[] = [
  { key: 'poise',      label: 'Poise' },
  { key: 'physical',   label: 'Physical' },
  { key: 'magic',      label: 'Magic' },
  { key: 'fire',       label: 'Fire' },
  { key: 'lightning',  label: 'Lightning' },
  { key: 'holy',       label: 'Holy' },
  { key: 'immunity',   label: 'Immunity' },
  { key: 'robustness', label: 'Robustness' },
  { key: 'focus',      label: 'Focus' },
  { key: 'vitality',   label: 'Vitality' },
];

const ROLL_CLASSES: { key: RollClass; label: string; threshold: number }[] = [
  { key: 'light',  label: 'Light',  threshold: 0.3 },
  { key: 'medium', label: 'Medium', threshold: 0.7 },
  { key: 'heavy',  label: 'Heavy',  threshold: 1.0 },
];

const SLOT_ORDER = ['head', 'chest', 'arms', 'legs'] as const;

const SLOT_ITEM_TYPE: Record<string, ArmorPiece['slot']> = {
  'Helm':        'head',
  'Chest Armor': 'chest',
  'Gauntlets':   'arms',
  'Leg Armor':   'legs',
};

// ── Equip Load Formula ───────────────────────────────────────

function calcMaxEquipLoad(end: number): number {
  const e = Math.min(99, Math.max(1, end));
  let load: number;
  if      (e <= 8)  load = 25  + 20 * ((e - 1)  / 7);
  else if (e <= 25) load = 45  + 27 * ((e - 8)  / 17);
  else if (e <= 60) load = 72  + 48 * Math.pow((e - 25) / 35, 1.1);
  else              load = 120 + 40 * ((e - 60) / 39);
  return Math.round(load * 10) / 10;
}

// ── Helpers ──────────────────────────────────────────────────

function toArmorPiece(item: ResolvedInventoryItem, slot: ArmorPiece['slot']): ArmorPiece {
  return {
    name:       item.name,
    slot,
    weight:     item.weight ?? 0,
    poise:      item.poise ?? 0,
    physical:   item.defense?.physical ?? 0,
    magic:      item.defense?.magic ?? 0,
    fire:       item.defense?.fire ?? 0,
    lightning:  item.defense?.lightning ?? 0,
    holy:       item.defense?.holy ?? 0,
    immunity:   item.immunity ?? 0,
    robustness: item.robustness ?? 0,
    focus:      item.focus ?? 0,
    vitality:   item.vitality ?? 0,
  };
}

function getGoalValue(piece: ArmorPiece | null, goal: GoalKey): number {
  if (!piece) return 0;
  return piece[goal];
}

function sumGoal(set: ArmorSet, goal: GoalKey): number {
  return SLOT_ORDER.reduce((s, slot) => s + getGoalValue(set[slot], goal), 0);
}

function sumWeight(pieces: (ArmorPiece | null)[]): number {
  return pieces.reduce((s, p) => s + (p?.weight ?? 0), 0);
}

/** Total weight of non-armor equipped items (weapons + shields in hand slots). */
function weaponWeight(equipped: EquippedItems): number {
  const weapons = [...equipped.rightHand, ...equipped.leftHand];
  return Math.round(weapons.reduce((s, w) => s + (w.weight ?? 0), 0) * 10) / 10;
}

function currentArmorSet(equipped: EquippedItems): ArmorSet {
  const slotMap: Record<string, ArmorPiece['slot']> = {
    head: 'head', chest: 'chest', hands: 'arms', legs: 'legs',
  };
  const set: ArmorSet = { head: null, chest: null, arms: null, legs: null, score: 0, totalWeight: 0 };
  for (const [eqKey, slot] of Object.entries(slotMap)) {
    const item = equipped[eqKey as keyof EquippedItems] as typeof equipped.head;
    if (item.name) {
      set[slot] = {
        name:       item.name,
        slot,
        weight:     item.weight ?? 0,
        poise:      item.poise ?? 0,
        physical:   item.defense?.physical ?? 0,
        magic:      item.defense?.magic ?? 0,
        fire:       item.defense?.fire ?? 0,
        lightning:  item.defense?.lightning ?? 0,
        holy:       item.defense?.holy ?? 0,
        immunity:   item.immunity ?? 0,
        robustness: item.robustness ?? 0,
        focus:      item.focus ?? 0,
        vitality:   item.vitality ?? 0,
      };
    }
  }
  set.totalWeight = sumWeight(SLOT_ORDER.map(s => set[s]));
  return set;
}

// ── Optimizer ────────────────────────────────────────────────

function optimizeArmor(
  inventory: Inventory,
  wepWeight: number,
  maxEquipLoad: number,
  goal: GoalKey,
  rollThreshold: number,
): ArmorSet {
  const armorBudget = maxEquipLoad * rollThreshold - wepWeight;

  // Group inventory armors by slot; deduplicate by name (keep first)
  const bySlot: Record<ArmorPiece['slot'], ArmorPiece[]> = {
    head: [], chest: [], arms: [], legs: [],
  };

  const seen = new Set<string>();
  for (const item of inventory.armors) {
    const slot = SLOT_ITEM_TYPE[item.itemType ?? ''];
    if (!slot) continue;
    const key = `${slot}:${item.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    bySlot[slot].push(toArmorPiece(item, slot));
  }

  // Pre-filter: remove pieces heavier than budget by themselves
  for (const slot of SLOT_ORDER) {
    bySlot[slot] = bySlot[slot].filter(p => p.weight <= armorBudget);
  }

  // Sort each slot by goal value descending for early termination
  for (const slot of SLOT_ORDER) {
    bySlot[slot].sort((a, b) => b[goal] - a[goal]);
  }

  // If combined pool is small enough, do full brute force; otherwise prune
  const totalCombos =
    (bySlot.head.length + 1) *
    (bySlot.chest.length + 1) *
    (bySlot.arms.length + 1) *
    (bySlot.legs.length + 1);

  // Prune to top N per slot if too many combos (keep diverse options)
  const MAX_COMBOS = 500_000;
  if (totalCombos > MAX_COMBOS) {
    const targetPerSlot = Math.floor(Math.pow(MAX_COMBOS, 0.25));
    for (const slot of SLOT_ORDER) {
      if (bySlot[slot].length > targetPerSlot) {
        bySlot[slot] = bySlot[slot].slice(0, targetPerSlot);
      }
    }
  }

  // Add null (empty) option for each slot
  const headOptions:  (ArmorPiece | null)[] = [null, ...bySlot.head];
  const chestOptions: (ArmorPiece | null)[] = [null, ...bySlot.chest];
  const armsOptions:  (ArmorPiece | null)[] = [null, ...bySlot.arms];
  const legsOptions:  (ArmorPiece | null)[] = [null, ...bySlot.legs];

  let bestSet: ArmorSet = {
    head: null, chest: null, arms: null, legs: null,
    score: 0, totalWeight: 0,
  };

  // Precompute max possible score for remaining slots (for branch-and-bound)
  const maxBySlot: Record<string, number> = {};
  for (const slot of SLOT_ORDER) {
    maxBySlot[slot] = bySlot[slot].length > 0 ? bySlot[slot][0][goal] : 0;
  }

  for (const head of headOptions) {
    const headWeight = head?.weight ?? 0;
    const headScore  = getGoalValue(head, goal);

    // Upper bound check: even with best possible remaining, can we beat best?
    if (headScore + maxBySlot.chest + maxBySlot.arms + maxBySlot.legs <= bestSet.score) continue;

    for (const chest of chestOptions) {
      const hcWeight = headWeight + (chest?.weight ?? 0);
      if (hcWeight > armorBudget) continue;
      const hcScore = headScore + getGoalValue(chest, goal);

      if (hcScore + maxBySlot.arms + maxBySlot.legs <= bestSet.score) continue;

      for (const arms of armsOptions) {
        const hcaWeight = hcWeight + (arms?.weight ?? 0);
        if (hcaWeight > armorBudget) continue;
        const hcaScore = hcScore + getGoalValue(arms, goal);

        if (hcaScore + maxBySlot.legs <= bestSet.score) continue;

        const remainingBudget = armorBudget - hcaWeight;

        for (const legs of legsOptions) {
          const legWeight = legs?.weight ?? 0;
          if (legWeight > remainingBudget) continue;

          const totalScore = hcaScore + getGoalValue(legs, goal);
          const tw = hcaWeight + legWeight;
          if (totalScore > bestSet.score || (totalScore === bestSet.score && tw < bestSet.totalWeight)) {
            bestSet = { head, chest, arms, legs, score: totalScore, totalWeight: Math.round(tw * 10) / 10 };
          }
        }
      }
    }
  }

  return bestSet;
}

// ── Goal label for display ───────────────────────────────────

function goalLabel(goal: GoalKey): string {
  return GOALS.find(g => g.key === goal)?.label ?? goal;
}

function goalUnit(goal: GoalKey): string {
  if (goal === 'poise') return '';
  if (['physical', 'magic', 'fire', 'lightning', 'holy'].includes(goal)) return '%';
  return '';
}

function formatGoalValue(val: number, goal: GoalKey): string {
  const unit = goalUnit(goal);
  if (unit === '%') return val.toFixed(1) + unit;
  return String(Math.round(val));
}

// ── Diff formatting ──────────────────────────────────────────

function formatDiff(val: number, goal: GoalKey): string {
  const sign = val > 0 ? '+' : '';
  if (goalUnit(goal) === '%') return `${sign}${val.toFixed(1)}%`;
  return `${sign}${Math.round(val)}`;
}

function diffClass(val: number): string {
  if (val > 0.01) return styles.diffPositive;
  if (val < -0.01) return styles.diffNegative;
  return styles.diffNeutral;
}

// ── Component ────────────────────────────────────────────────

export default function ArmorOptimizer({ equipped, inventory, stats }: Props) {
  const [goal, setGoal] = useState<GoalKey>('poise');
  const [rollClass, setRollClass] = useState<RollClass>('medium');
  const [showBreakdown, setShowBreakdown] = useState(false);

  // Compute talisman bonuses (for equip load)
  const talismanBonuses = useMemo(
    () => computeTalismanBonuses(equipped.talismans),
    [equipped.talismans],
  );

  // Effective endurance with talisman attribute bonuses
  const effectiveEnd = Math.min(99, stats.endurance + (talismanBonuses.attrs.endurance ?? 0));

  // Max equip load with talisman equip load bonus
  const baseMaxLoad = calcMaxEquipLoad(effectiveEnd);
  const maxLoad = Math.round(baseMaxLoad * (1 + talismanBonuses.equipLoadBonus) * 10) / 10;

  // Weight from weapons
  const wepWeight = weaponWeight(equipped);

  // Roll threshold
  const rollThreshold = ROLL_CLASSES.find(r => r.key === rollClass)!.threshold;

  // Armor budget
  const armorBudget = Math.round((maxLoad * rollThreshold - wepWeight) * 10) / 10;

  // Current armor set
  const current = useMemo(() => {
    const set = currentArmorSet(equipped);
    set.score = sumGoal(set, goal);
    return set;
  }, [equipped, goal]);

  // Optimal armor set
  const optimal = useMemo(
    () => optimizeArmor(inventory, wepWeight, maxLoad, goal, rollThreshold),
    [inventory, wepWeight, maxLoad, goal, rollThreshold],
  );

  // Differences
  const scoreDiff = optimal.score - current.score;
  const weightDiff = optimal.totalWeight - current.totalWeight;

  // Budget bar percentage
  const budgetPct = armorBudget > 0 ? Math.min(100, (optimal.totalWeight / armorBudget) * 100) : 0;
  const budgetColor = budgetPct > 95 ? '#e05a5a' : budgetPct > 80 ? '#e0a040' : '#6dbf7e';

  // No armors in inventory?
  const hasArmors = inventory.armors.length > 0;

  return (
    <div className={styles.panel}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <span className={styles.title}>Armor Optimizer</span>
        </div>

        {/* Goal filter */}
        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>Goal</span>
          {GOALS.map(g => (
            <button
              key={g.key}
              className={`${styles.filterPill} ${goal === g.key ? styles.filterPillActive : ''}`}
              onClick={() => setGoal(g.key)}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* Roll class */}
        <div className={styles.rollRow}>
          <span className={styles.filterLabel}>Roll</span>
          {ROLL_CLASSES.map(r => (
            <button
              key={r.key}
              className={`${styles.rollPill} ${rollClass === r.key ? styles.rollPillActive : ''}`}
              onClick={() => setRollClass(r.key)}
            >
              {r.label} ({Math.round(r.threshold * 100)}%)
            </button>
          ))}
        </div>

        {/* Budget display */}
        <div className={styles.budgetRow}>
          <span className={styles.budgetLabel}>Budget</span>
          <span className={styles.budgetValue}>
            {armorBudget > 0 ? armorBudget.toFixed(1) : '0.0'}
          </span>
          <span className={styles.budgetDetail}>
            / {maxLoad.toFixed(1)} max load
          </span>
          <span className={styles.budgetDetail}>
            (weapons: {wepWeight.toFixed(1)})
          </span>
          <div className={styles.budgetBar}>
            <div
              className={styles.budgetFill}
              style={{ width: `${budgetPct}%`, background: budgetColor }}
            />
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className={styles.scrollArea}>
        {!hasArmors && (
          <div className={styles.emptyState}>
            No armors found in inventory. Upload a save with inventory data.
          </div>
        )}

        {hasArmors && armorBudget <= 0 && (
          <div className={styles.emptyState}>
            No weight budget available. Weapons exceed the equip load limit for {rollClass} roll.
          </div>
        )}

        {hasArmors && armorBudget > 0 && (
          <>
            {/* Optimal Set */}
            <div className={styles.setSection}>
              <div className={styles.setSectionHeader}>
                <span className={styles.setSectionTitle}>Optimal Set</span>
                <span className={styles.setSectionScore}>
                  {formatGoalValue(optimal.score, goal)} {goalLabel(goal)}
                </span>
              </div>

              {SLOT_ORDER.map(slot => {
                const piece = optimal[slot];
                return (
                  <div key={slot} className={styles.pieceRow}>
                    <span className={styles.pieceSlotLabel}>{slot}</span>
                    <span className={piece ? styles.pieceName : `${styles.pieceName} ${styles.pieceNameEmpty}`}>
                      {piece?.name ?? '(empty)'}
                    </span>
                    <span className={styles.pieceGoalVal}>
                      {piece ? formatGoalValue(getGoalValue(piece, goal), goal) : '--'}
                    </span>
                    <span className={styles.pieceWeight}>
                      {piece ? `${piece.weight.toFixed(1)} wt` : '0.0 wt'}
                    </span>
                  </div>
                );
              })}

              <div className={styles.totalsRow}>
                <span className={styles.totalsLabel}>Total</span>
                <span className={styles.totalsValue}>
                  {formatGoalValue(optimal.score, goal)}
                </span>
                <span className={styles.totalsWeight}>
                  {optimal.totalWeight.toFixed(1)} wt
                </span>
              </div>
            </div>

            {/* Current Set */}
            <div className={styles.setSection}>
              <div className={styles.setSectionHeader}>
                <span className={styles.setSectionTitle}>Current Set</span>
                <span className={styles.setSectionScore}>
                  {formatGoalValue(current.score, goal)} {goalLabel(goal)}
                </span>
              </div>

              {SLOT_ORDER.map(slot => {
                const piece = current[slot];
                return (
                  <div key={slot} className={styles.pieceRow}>
                    <span className={styles.pieceSlotLabel}>{slot}</span>
                    <span className={piece ? styles.pieceName : `${styles.pieceName} ${styles.pieceNameEmpty}`}>
                      {piece?.name ?? '(empty)'}
                    </span>
                    <span className={styles.pieceGoalVal}>
                      {piece ? formatGoalValue(getGoalValue(piece, goal), goal) : '--'}
                    </span>
                    <span className={styles.pieceWeight}>
                      {piece ? `${piece.weight.toFixed(1)} wt` : '0.0 wt'}
                    </span>
                  </div>
                );
              })}

              <div className={styles.totalsRow}>
                <span className={styles.totalsLabel}>Total</span>
                <span className={styles.totalsValue}>
                  {formatGoalValue(current.score, goal)}
                </span>
                <span className={styles.totalsWeight}>
                  {current.totalWeight.toFixed(1)} wt
                </span>
              </div>
            </div>

            {/* Difference */}
            <div className={styles.diffRow}>
              <span className={`${styles.diffItem} ${diffClass(scoreDiff)}`}>
                {formatDiff(scoreDiff, goal)} {goalLabel(goal)}
              </span>
              <span className={`${styles.diffItem} ${diffClass(-weightDiff)}`}>
                {weightDiff > 0 ? '+' : ''}{weightDiff.toFixed(1)} Weight
              </span>
            </div>

            {/* Detailed Breakdown (collapsible) */}
            <div className={styles.breakdownSection}>
              <div
                className={styles.breakdownTitle}
                onClick={() => setShowBreakdown(prev => !prev)}
              >
                <span
                  className={`${styles.breakdownToggle} ${showBreakdown ? styles.breakdownToggleOpen : ''}`}
                >
                  {'\u25B6'}
                </span>
                Full Stat Comparison
              </div>

              {showBreakdown && (
                <div className={styles.breakdownGrid}>
                  {/* Header row */}
                  <span className={styles.breakdownHeader}>Stat</span>
                  <span className={styles.breakdownHeader}>Optimal</span>
                  <span className={styles.breakdownHeader}>Current</span>
                  <span className={styles.breakdownHeader}>Diff</span>

                  {GOALS.map(stat => {
                    const optVal = sumGoal(optimal, stat.key);
                    const curVal = sumGoal(current, stat.key);
                    const diff = optVal - curVal;
                    return [
                      <span key={`${stat.key}-l`} className={styles.breakdownStatLabel}>{stat.label}</span>,
                      <span key={`${stat.key}-o`} className={styles.breakdownOptimal}>
                        {formatGoalValue(optVal, stat.key)}
                      </span>,
                      <span key={`${stat.key}-c`} className={styles.breakdownCurrent}>
                        {formatGoalValue(curVal, stat.key)}
                      </span>,
                      <span key={`${stat.key}-d`} className={`${styles.breakdownDiff} ${diffClass(diff)}`}>
                        {formatDiff(diff, stat.key)}
                      </span>,
                    ];
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
