import { useState, useEffect, useMemo } from 'react';
import { getBuilds } from '../../api/client';
import { rankBuilds } from '../../utils/buildMatcher';
import type { BuildMatch, BuildTemplate } from '../../utils/buildMatcher';
import type { CharacterStats, EquippedWeapon, Inventory } from '../../types';
import styles from './AdvisorPanel.module.css';

interface Props {
  stats: CharacterStats;
  level?: number;
  mainWeapon?: EquippedWeapon | null;
  inventory?: Inventory;
}

// ── Next Caps optimizer ─────────────────────────────────────

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
  str: 'strength', dex: 'dexterity', int: 'intelligence', fai: 'faith', arc: 'arcane',
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

  const vig = stats.vigor;
  if (vig < 60 && !tips.find(t => t.statKey === 'vigor')) {
    const nextCap = CAPS.vigor.find(c => c > vig);
    if (nextCap !== undefined) {
      tips.push({ statKey: 'vigor', label: 'VIG', current: vig, nextCap, points: nextCap - vig });
    }
  }

  tips.sort((a, b) => {
    const wa = GRADE_WEIGHT[a.grade ?? ''] ?? 0;
    const wb = GRADE_WEIGHT[b.grade ?? ''] ?? 0;
    if (wa !== wb) return wb - wa;
    return a.points - b.points;
  });

  return tips.slice(0, 4);
}

// ── Tag colors ───────────────────────────────────────────────

const DIFF_COLORS: Record<string, string> = {
  beginner: '#6dbf7e', intermediate: '#e0a040', advanced: '#e05a5a',
};

const TAG_COLORS: Record<string, string> = {
  bleed: '#d4483c', frost: '#8ecfef', poison: '#8bc34a', rot: '#c87038',
  magic: '#6a9cd4', fire: '#d4703c', lightning: '#d4c03c', holy: '#c4a84c',
  strength: '#c8bfa0', dexterity: '#b8d060', intelligence: '#6a9cd4',
  faith: '#c4a84c', arcane: '#ba68c8', dragon: '#78909c', death: '#a0a0a0',
  madness: '#e0c040', tank: '#5a8a5a', aggressive: '#d4483c',
  dex: '#b8d060', ranged: '#8ecfef', gravity: '#9070c0', bubble: '#f0c080',
};

export default function AdvisorPanel({ stats, level = 1, mainWeapon, inventory }: Props) {
  const [builds, setBuilds] = useState<BuildTemplate[]>([]);
  const [expandedBuild, setExpandedBuild] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getBuilds()
      .then(setBuilds)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const tips = useMemo(() => computeTips(stats, mainWeapon ?? null), [stats, mainWeapon]);

  const buildMatches: BuildMatch[] = useMemo(
    () => builds.length > 0 ? rankBuilds(builds, stats, level, inventory, builds.length) : [],
    [builds, stats, level, inventory],
  );

  return (
    <div className={styles.panel}>
      <div className={styles.title}>Recommended Builds</div>

      {loading && (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Matching builds to your stats...</span>
        </div>
      )}

      {!loading && buildMatches.length > 0 && (
        <div className={styles.buildList}>
          {buildMatches.map((match, idx) => {
            const isExpanded = expandedBuild === match.build.id;
            return (
              <div key={match.build.id} className={styles.buildCard}>
                <div
                  className={styles.buildHeader}
                  onClick={() => setExpandedBuild(isExpanded ? null : match.build.id)}
                >
                  <span className={styles.buildRank}>
                    {idx < 3 ? '\u2605' : `#${idx + 1}`}
                  </span>
                  <div className={styles.buildMain}>
                    <div className={styles.buildNameRow}>
                      <span className={styles.buildName}>{match.build.name}</span>
                      <span
                        className={styles.diffBadge}
                        style={{ color: DIFF_COLORS[match.build.difficulty] ?? '#aaa' }}
                      >
                        {match.build.difficulty}
                      </span>
                    </div>
                    <div className={styles.buildDesc}>{match.build.description}</div>
                    <div className={styles.buildTags}>
                      {match.build.tags.slice(0, 4).map(tag => (
                        <span
                          key={tag}
                          className={styles.buildTag}
                          style={{ borderColor: TAG_COLORS[tag] ?? 'var(--border)', color: TAG_COLORS[tag] ?? 'var(--text-dim)' }}
                        >
                          {tag}
                        </span>
                      ))}
                      {match.build.pve && <span className={styles.buildTag} style={{ borderColor: '#6dbf7e', color: '#6dbf7e' }}>PvE</span>}
                      {match.build.pvp && <span className={styles.buildTag} style={{ borderColor: '#e05a5a', color: '#e05a5a' }}>PvP</span>}
                    </div>
                  </div>
                  <div className={styles.buildScore}>
                    <div className={styles.scoreValue}>{match.fitScore}</div>
                    <div className={styles.scoreLabel}>match</div>
                  </div>
                </div>

                {isExpanded && (
                  <div className={styles.buildDetails}>
                    {match.build.weapons.length > 0 && (
                      <div className={styles.detailSection}>
                        <span className={styles.detailTitle}>Weapons</span>
                        <div className={styles.detailItems}>
                          {match.build.weapons.map(w => (
                            <span
                              key={w}
                              className={`${styles.detailItem} ${match.ownedItems.includes(w) ? styles.detailOwned : styles.detailMissing}`}
                            >
                              {match.ownedItems.includes(w) ? '\u2713 ' : ''}{w}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {match.build.shields.length > 0 && (
                      <div className={styles.detailSection}>
                        <span className={styles.detailTitle}>Shields</span>
                        <div className={styles.detailItems}>
                          {match.build.shields.map(s => (
                            <span key={s} className={styles.detailItem}>{s}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {match.build.talismans.length > 0 && (
                      <div className={styles.detailSection}>
                        <span className={styles.detailTitle}>Talismans</span>
                        <div className={styles.detailItems}>
                          {match.build.talismans.map(t => (
                            <span
                              key={t}
                              className={`${styles.detailItem} ${match.ownedItems.includes(t) ? styles.detailOwned : styles.detailMissing}`}
                            >
                              {match.ownedItems.includes(t) ? '\u2713 ' : ''}{t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {match.build.ashesOfWar.length > 0 && (
                      <div className={styles.detailSection}>
                        <span className={styles.detailTitle}>Ashes of War</span>
                        <div className={styles.detailItems}>
                          {match.build.ashesOfWar.map(a => (
                            <span key={a} className={styles.detailItem}>{a}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {match.build.spells.length > 0 && (
                      <div className={styles.detailSection}>
                        <span className={styles.detailTitle}>Spells</span>
                        <div className={styles.detailItems}>
                          {match.build.spells.map(s => (
                            <span
                              key={s}
                              className={`${styles.detailItem} ${match.ownedItems.includes(s) ? styles.detailOwned : styles.detailMissing}`}
                            >
                              {match.ownedItems.includes(s) ? '\u2713 ' : ''}{s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className={styles.detailSection}>
                      <span className={styles.detailTitle}>Armor</span>
                      <span className={styles.armorNote}>{match.build.armorSuggestion}</span>
                    </div>

                    <div className={styles.detailSection}>
                      <span className={styles.detailTitle}>Stats (yours / ideal)</span>
                      <div className={styles.statGrid}>
                        {(Object.keys(match.build.statProfile) as (keyof CharacterStats)[]).map(key => {
                          const profile = match.build.statProfile[key];
                          const playerVal = stats[key] as number;
                          const isAboveIdeal = playerVal >= profile.ideal;
                          const isBelowMin = playerVal < profile.min;
                          return (
                            <div key={key} className={styles.statRow}>
                              <span className={styles.statKey}>{STAT_LABEL[key] ?? key}</span>
                              <span
                                className={styles.statVal}
                                style={{
                                  color: isAboveIdeal ? '#6dbf7e' : isBelowMin ? '#e05a5a' : 'var(--text)',
                                }}
                              >
                                {playerVal}
                              </span>
                              <span className={styles.statIdeal}>{profile.ideal}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {match.ownedItems.length > 0 && (
                      <div className={styles.inventoryNote}>
                        You own {match.ownedItems.length} of {match.ownedItems.length + match.missingItems.length} recommended items
                      </div>
                    )}

                    <div className={styles.tipBox}>
                      {match.build.tips}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Next Caps ── */}
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
