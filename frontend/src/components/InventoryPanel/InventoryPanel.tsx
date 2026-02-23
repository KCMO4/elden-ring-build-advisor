// v2
import { useState } from 'react';
import type { Inventory, ResolvedInventoryItem } from '../../types';
import styles from './InventoryPanel.module.css';

interface Props {
  inventory: Inventory;
}

type Tab =
  | 'weapons'
  | 'ammos'
  | 'armors'
  | 'talismans'
  | 'spells'
  | 'spirits'
  | 'ashesOfWar'
  | 'consumables'
  | 'materials'
  | 'upgrades'
  | 'crystalTears'
  | 'keyItems'
  | 'cookbooks'
  | 'multiplayer';

interface TabDef {
  key: Tab;
  label: string;
  placeholder: string;
}

const TABS: TabDef[] = [
  { key: 'weapons',      label: 'Armas',    placeholder: '⚔' },
  { key: 'armors',       label: 'Armad.',   placeholder: '🛡' },
  { key: 'talismans',    label: 'Talism.',  placeholder: '✦' },
  { key: 'spells',       label: 'Hechizos', placeholder: '✦' },
  { key: 'spirits',      label: 'Espírit.', placeholder: '👻' },
  { key: 'ashesOfWar',   label: 'Cenizas',  placeholder: '🔥' },
  { key: 'consumables',  label: 'Consum.',  placeholder: '🍶' },
  { key: 'materials',    label: 'Mater.',   placeholder: '🌿' },
  { key: 'upgrades',     label: 'Mejoras',  placeholder: '⬆' },
  { key: 'crystalTears', label: 'Lágrim.',  placeholder: '💧' },
  { key: 'ammos',        label: 'Munición', placeholder: '🏹' },
  { key: 'keyItems',     label: 'Clave',    placeholder: '🗝' },
  { key: 'cookbooks',    label: 'Recetas',  placeholder: '📖' },
  { key: 'multiplayer',  label: 'Multi',    placeholder: '👆' },
];

function ItemGrid({ items, placeholder }: { items: ResolvedInventoryItem[]; placeholder: string }) {
  if (items.length === 0) {
    return <div className={styles.empty}>Sin ítems</div>;
  }

  return (
    <div className={styles.grid}>
      {items.map((item, i) => (
        <div key={i} className={styles.gridItem} title={item.name}>
          {item.image ? (
            <img
              src={item.image}
              alt={item.name}
              className={styles.itemImg}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className={styles.itemPlaceholder}>{placeholder}</div>
          )}
          <span className={styles.itemName}>{item.name}</span>
        </div>
      ))}
    </div>
  );
}

const EMPTY_INVENTORY: Inventory = {
  weapons: [], ammos: [], armors: [], talismans: [], spells: [],
  spirits: [], ashesOfWar: [], consumables: [], materials: [],
  upgrades: [], crystalTears: [], keyItems: [], cookbooks: [], multiplayer: [],
};

export default function InventoryPanel({ inventory }: Props) {
  const [active, setActive] = useState<Tab>('weapons');

  const inv = inventory ?? EMPTY_INVENTORY;

  const counts: Record<Tab, number> = {
    weapons:      inv.weapons.length,
    ammos:        inv.ammos.length,
    armors:       inv.armors.length,
    talismans:    inv.talismans.length,
    spells:       inv.spells.length,
    spirits:      inv.spirits.length,
    ashesOfWar:   inv.ashesOfWar.length,
    consumables:  inv.consumables.length,
    materials:    inv.materials.length,
    upgrades:     inv.upgrades.length,
    crystalTears: inv.crystalTears.length,
    keyItems:     inv.keyItems.length,
    cookbooks:    inv.cookbooks.length,
    multiplayer:  inv.multiplayer.length,
  };

  const rawItems = inv[active] ?? [];
  const activeItems = active === 'ashesOfWar'
    ? rawItems.map(item => ({ ...item, name: item.name.replace(/^Ash of War:\s*/i, '') }))
    : rawItems;
  const activeDef = TABS.find(t => t.key === active)!;

  return (
    <div className={styles.panel}>
      <div className={styles.tabs}>
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            className={`${styles.tab} ${active === key ? styles.tabActive : ''}`}
            onClick={() => setActive(key)}
          >
            {label}
            {counts[key] > 0 && (
              <span className={styles.tabCount}>{counts[key]}</span>
            )}
          </button>
        ))}
      </div>

      <ItemGrid items={activeItems} placeholder={activeDef.placeholder} />
    </div>
  );
}
