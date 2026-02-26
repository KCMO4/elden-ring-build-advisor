import { useState, useMemo, useEffect } from 'react';
import styles from './RuneCalculator.module.css';

const MAX_LEVEL = 713;

interface Props {
  level: number;
  heldRunes: number;
}

// ── Exact rune cost formula (regulation.bin) ─────────────────

function runeCostForLevel(targetLevel: number): number {
  if (targetLevel <= 1) return 0;
  const L = targetLevel - 1;
  const x = Math.max(0, (L - 11) * 0.02);
  return Math.floor((x + 0.1) * (L + 81) ** 2 + 1 + 1e-6);
}

function totalRunesBetween(from: number, to: number): number {
  let total = 0;
  for (let lv = from + 1; lv <= to; lv++) total += runeCostForLevel(lv);
  return total;
}

function maxLevelWithRunes(currentLevel: number, runes: number): number {
  let remaining = runes;
  let lv = currentLevel;
  while (lv < MAX_LEVEL) {
    const cost = runeCostForLevel(lv + 1);
    if (remaining < cost) break;
    remaining -= cost;
    lv++;
  }
  return lv;
}

// ── Formatter ────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString('en-US');

// ── Component ────────────────────────────────────────────────

export default function RuneCalculator({ level, heldRunes }: Props) {
  const [targetLevel, setTargetLevel] = useState(Math.min(level + 10, MAX_LEVEL));

  // Reset target when character changes
  useEffect(() => {
    setTargetLevel(Math.min(level + 10, MAX_LEVEL));
  }, [level]);

  const atMaxLevel = level >= MAX_LEVEL;
  const clampedTarget = atMaxLevel ? level : Math.max(level + 1, Math.min(targetLevel, MAX_LEVEL));

  const quickTargets = useMemo(() => {
    if (atMaxLevel) return [];
    const targets = new Set<number>();
    if (level + 10 <= MAX_LEVEL) targets.add(level + 10);
    if (level + 25 <= MAX_LEVEL) targets.add(level + 25);
    for (const t of [125, 150, 200]) {
      if (t > level && t <= MAX_LEVEL) targets.add(t);
    }
    return [...targets].sort((a, b) => a - b);
  }, [level, atMaxLevel]);

  const totalNeeded = useMemo(
    () => totalRunesBetween(level, clampedTarget),
    [level, clampedTarget],
  );

  const runesRemaining = Math.max(0, totalNeeded - heldRunes);
  const progressPct = totalNeeded > 0 ? Math.min(100, (heldRunes / totalNeeded) * 100) : 0;

  const reachableLevel = useMemo(
    () => maxLevelWithRunes(level, heldRunes),
    [level, heldRunes],
  );

  const levelBreakdown = useMemo(() => {
    const rows: Array<{ lv: number; cost: number; cumulative: number; affordable: boolean }> = [];
    let cumulative = 0;
    for (let lv = level + 1; lv <= clampedTarget; lv++) {
      const cost = runeCostForLevel(lv);
      cumulative += cost;
      rows.push({ lv, cost, cumulative, affordable: cumulative <= heldRunes });
    }
    return rows;
  }, [level, clampedTarget, heldRunes]);

  return (
    <div className={styles.panel}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <h3 className={styles.title}>Rune Calculator</h3>
        <div className={styles.currentInfo}>
          <span className={styles.badge}>Level {level}</span>
          <span className={styles.badge}>
            <span className={styles.rune}>&#5791;</span>
            {fmt(heldRunes)}
          </span>
        </div>
      </div>

      {/* ── Target Input ── */}
      <div className={styles.section}>
        <label className={styles.label}>Target Level</label>
        <input
          className={styles.input}
          type="number"
          min={level + 1}
          max={713}
          value={targetLevel}
          onChange={e => setTargetLevel(Number(e.target.value) || level + 1)}
        />

        <div className={styles.quickTargets}>
          {quickTargets.map(t => (
            <button
              key={t}
              className={`${styles.pill} ${t === clampedTarget ? styles.pillActive : ''}`}
              onClick={() => setTargetLevel(t)}
            >
              Lv{t}
            </button>
          ))}
        </div>
      </div>

      {/* ── Summary ── */}
      <div className={styles.section}>
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Total Needed</span>
          <span className={styles.summaryValue}>
            <span className={styles.rune}>&#5791;</span> {fmt(totalNeeded)}
          </span>
        </div>
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Already Held</span>
          <span className={styles.summaryValueHeld}>
            <span className={styles.rune}>&#5791;</span> {fmt(heldRunes)}
          </span>
        </div>
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Still Need</span>
          <span className={`${styles.summaryValue} ${runesRemaining === 0 ? styles.affordable : ''}`}>
            <span className={styles.rune}>&#5791;</span> {fmt(runesRemaining)}
          </span>
        </div>

        {/* ── Progress Bar ── */}
        <div className={styles.progressWrap}>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className={styles.progressLabel}>{progressPct.toFixed(1)}%</span>
        </div>
      </div>

      {/* ── Reverse Calculator ── */}
      <div className={styles.section}>
        <div className={styles.reverseBox}>
          <span className={styles.reverseLabel}>With current runes</span>
          <span className={styles.reverseValue}>
            Level {reachableLevel}
            {reachableLevel > level && (
              <span className={styles.reverseGain}> (+{reachableLevel - level})</span>
            )}
            {reachableLevel === level && (
              <span className={styles.reverseNone}> (not enough for next level)</span>
            )}
          </span>
        </div>
      </div>

      {/* ── Level Breakdown Table ── */}
      <div className={styles.tableSection}>
        <div className={styles.tableTitle}>Level Breakdown</div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Level</th>
                <th className={`${styles.th} ${styles.thRight}`}>Cost</th>
                <th className={`${styles.th} ${styles.thRight}`}>Cumulative</th>
              </tr>
            </thead>
            <tbody>
              {levelBreakdown.map((row, i) => (
                <tr
                  key={row.lv}
                  className={`${styles.tr} ${i % 2 === 0 ? styles.trEven : ''} ${row.affordable ? styles.trAffordable : ''}`}
                >
                  <td className={styles.td}>{row.lv}</td>
                  <td className={`${styles.td} ${styles.tdRight}`}>
                    {fmt(row.cost)}
                    {row.lv === reachableLevel && reachableLevel > level && (
                      <span className={styles.affordTag}> max</span>
                    )}
                  </td>
                  <td className={`${styles.td} ${styles.tdRight}`}>{fmt(row.cumulative)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
