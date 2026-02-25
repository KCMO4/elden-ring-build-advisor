import type { CharacterStats, Inventory, ResolvedInventoryItem } from '../types';

export interface StatRange {
  min: number;
  ideal: number;
}

export interface BuildTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  pve: boolean;
  pvp: boolean;
  levelRange: [number, number];
  statProfile: Record<keyof CharacterStats, StatRange>;
  weapons: string[];
  shields: string[];
  armorSuggestion: string;
  talismans: string[];
  ashesOfWar: string[];
  spells: string[];
  tips: string;
}

export interface BuildMatch {
  build: BuildTemplate;
  fitScore: number;       // 0–100
  statScore: number;      // 0–70
  levelScore: number;     // 0–10
  inventoryScore: number; // 0–20
  ownedItems: string[];
  missingItems: string[];
}

const STAT_KEYS: (keyof CharacterStats)[] = [
  'vigor', 'mind', 'endurance', 'strength',
  'dexterity', 'intelligence', 'faith', 'arcane',
];

/**
 * Calculate how well a player's stats match a build template.
 * Returns a score from 0 to 100.
 */
export function matchBuild(
  stats: CharacterStats,
  level: number,
  build: BuildTemplate,
  inventory?: Inventory | null,
): BuildMatch {
  // ── 1. Stat similarity (0–70 points) ──
  let statScore = 0;
  let totalWeight = 0;

  for (const key of STAT_KEYS) {
    const profile = build.statProfile[key];
    const playerVal = stats[key] as number;
    const { min, ideal } = profile;

    // Weight: higher ideal = more important to the build
    const weight = Math.max(ideal, 1) / 99;
    totalWeight += weight;

    if (playerVal >= ideal) {
      // At or above ideal — great, but diminishing returns for over-investing
      const overInvest = Math.min(0.3, (playerVal - ideal) / 40);
      statScore += weight * (1 - overInvest);
    } else if (playerVal >= min) {
      // Between min and ideal — proportional score
      const range = Math.max(ideal - min, 1);
      statScore += weight * (0.5 + 0.5 * ((playerVal - min) / range));
    } else {
      // Below minimum — penalty
      const deficit = Math.min(1, (min - playerVal) / Math.max(min, 1));
      statScore += weight * Math.max(0, 0.3 - deficit * 0.5);
    }
  }

  const normalizedStatScore = totalWeight > 0
    ? Math.max(0, Math.min(70, (statScore / totalWeight) * 70))
    : 0;

  // ── 2. Level range (0–10 points) ──
  let levelScore = 0;
  const [minLvl, maxLvl] = build.levelRange;
  if (level >= minLvl && level <= maxLvl) {
    levelScore = 10;
  } else if (level >= minLvl - 30 && level <= maxLvl + 30) {
    const dist = level < minLvl ? minLvl - level : level - maxLvl;
    levelScore = Math.max(0, 10 - dist * 0.33);
  }

  // ── 3. Inventory match (0–20 points) ──
  const allBuildItems = [
    ...build.weapons,
    ...build.shields,
    ...build.talismans,
    ...build.spells,
  ];

  const ownedItems: string[] = [];
  const missingItems: string[] = [];

  if (inventory && allBuildItems.length > 0) {
    const ownedNames = new Set<string>();
    const addNames = (items: ResolvedInventoryItem[]) => {
      for (const item of items) {
        if (item.name) ownedNames.add(item.name.toLowerCase());
      }
    };

    addNames(inventory.weapons);
    addNames(inventory.armors);
    addNames(inventory.talismans);
    addNames(inventory.spells);
    addNames(inventory.spirits);
    addNames(inventory.ashesOfWar);

    for (const itemName of allBuildItems) {
      if (ownedNames.has(itemName.toLowerCase())) {
        ownedItems.push(itemName);
      } else {
        missingItems.push(itemName);
      }
    }
  } else {
    missingItems.push(...allBuildItems);
  }

  const inventoryScore = allBuildItems.length > 0
    ? (ownedItems.length / allBuildItems.length) * 20
    : 0;

  const fitScore = Math.round(
    Math.max(0, Math.min(100, normalizedStatScore + levelScore + inventoryScore)),
  );

  return {
    build,
    fitScore,
    statScore: Math.round(normalizedStatScore),
    levelScore: Math.round(levelScore * 10) / 10,
    inventoryScore: Math.round(inventoryScore * 10) / 10,
    ownedItems,
    missingItems,
  };
}

/**
 * Rank all builds by fit score, return top N.
 */
export function rankBuilds(
  builds: BuildTemplate[],
  stats: CharacterStats,
  level: number,
  inventory?: Inventory | null,
  topN = 5,
): BuildMatch[] {
  return builds
    .map(b => matchBuild(stats, level, b, inventory))
    .sort((a, b) => b.fitScore - a.fitScore)
    .slice(0, topN);
}
