// v5 — con tooltips de stats por categoría
import { useState, useMemo, useEffect, useRef } from 'react';
import type { Inventory, ResolvedInventoryItem, CharacterStats } from '../../types';
import InventoryTooltip from '../InventoryTooltip/InventoryTooltip';
import styles from './InventoryPanel.module.css';

interface Props {
  inventory: Inventory;
  stats?: CharacterStats;
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
  { key: 'weapons',      label: 'Weapons',  placeholder: '⚔' },
  { key: 'armors',       label: 'Armor',    placeholder: '🛡' },
  { key: 'talismans',    label: 'Talisms.', placeholder: '✦' },
  { key: 'spells',       label: 'Spells',   placeholder: '✦' },
  { key: 'spirits',      label: 'Spirits',  placeholder: '👻' },
  { key: 'ashesOfWar',   label: 'Ashes',    placeholder: '🔥' },
  { key: 'consumables',  label: 'Consum.',  placeholder: '🍶' },
  { key: 'materials',    label: 'Mats.',    placeholder: '🌿' },
  { key: 'upgrades',     label: 'Upgrades', placeholder: '⬆' },
  { key: 'crystalTears', label: 'Tears',    placeholder: '💧' },
  { key: 'ammos',        label: 'Ammo',     placeholder: '🏹' },
  { key: 'keyItems',     label: 'Key',      placeholder: '🗝' },
  { key: 'cookbooks',    label: 'Books',    placeholder: '📖' },
  { key: 'multiplayer',  label: 'Multi',    placeholder: '👆' },
];

interface ItemGridProps {
  items: ResolvedInventoryItem[];
  placeholder: string;
  stats?: CharacterStats;
}

function GridItem({ item, placeholder, stats }: { item: ResolvedInventoryItem; placeholder: string; stats?: CharacterStats }) {
  const [imgError, setImgError] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Reset imgError cuando cambia la imagen (cambio de tab reutiliza el componente)
  useEffect(() => {
    setImgError(false);
  }, [item.image]);

  const showImg = !!item.image && !imgError;
  const upgradeLevel = item.upgradeLevel ?? null;

  function handleMouseEnter() {
    if (ref.current) setRect(ref.current.getBoundingClientRect());
    setHovered(true);
  }

  // Solo mostrar tooltip si el ítem tiene datos extra además del nombre/imagen
  const hasTooltipData =
    !!item.damage || !!item.defense || !!item.scaling || !!item.effect ||
    !!item.affinity || !!item.skill || item.fpCost !== undefined || item.hpCost !== undefined ||
    !!item.itemType || !!item.requirements || !!item.passives || !!item.guardNegation ||
    item.poise !== undefined || item.cost !== undefined || item.weight !== undefined ||
    !!item.description || !!item.damageTypes ||
    (item.critical != null && item.critical !== 100);

  return (
    <div
      ref={ref}
      className={styles.gridItem}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setHovered(false)}
    >
      {upgradeLevel !== null && (
        <span className={styles.upgradeBadge}>+{upgradeLevel}</span>
      )}
      {item.quantity > 1 && (
        <span className={styles.quantityBadge}>×{item.quantity}</span>
      )}
      {showImg ? (
        <img
          src={item.image}
          alt={item.name}
          className={styles.itemImg}
          onError={() => setImgError(true)}
        />
      ) : (
        <div className={styles.itemPlaceholder}>{placeholder}</div>
      )}
      <span className={styles.itemName}>{item.name}</span>
      {hovered && hasTooltipData && rect && (
        <InventoryTooltip item={item} triggerRect={rect} stats={stats} />
      )}
    </div>
  );
}

function ItemGrid({ items, placeholder, stats }: ItemGridProps) {
  if (items.length === 0) {
    return <div className={styles.empty}>No items</div>;
  }

  return (
    <div className={styles.grid}>
      {items.map((item) => (
        <GridItem key={item.uid} item={item} placeholder={placeholder} stats={stats} />
      ))}
    </div>
  );
}

const EMPTY_INVENTORY: Inventory = {
  weapons: [], ammos: [], armors: [], talismans: [], spells: [],
  spirits: [], ashesOfWar: [], consumables: [], materials: [],
  upgrades: [], crystalTears: [], keyItems: [], cookbooks: [], multiplayer: [],
};

export default function InventoryPanel({ inventory, stats }: Props) {
  const [active, setActive] = useState<Tab>('weapons');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Resetear filtros al cambiar de tab
  useEffect(() => {
    setSearch('');
    setTypeFilter('');
  }, [active]);

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

  // Ítems del tab activo (con strip de "Ash of War: " si corresponde)
  const rawItems = inv[active] ?? [];
  const tabItems: ResolvedInventoryItem[] = active === 'ashesOfWar'
    ? rawItems.map(item => ({ ...item, name: item.name.replace(/^Ash of War:\s*/i, '') }))
    : rawItems;

  // Tipos únicos para el select de filtro (solo categorías que tienen datos)
  const availableTypes = useMemo(() => {
    const cats = tabItems.map(i => i.category).filter(Boolean);
    return [...new Set(cats)].sort();
  }, [tabItems]);

  // Filtrado client-side
  const filteredItems = useMemo(() => {
    let items = tabItems;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(q));
    }
    if (typeFilter) {
      items = items.filter(i => i.category === typeFilter);
    }
    return items;
  }, [tabItems, search, typeFilter]);

  const activeDef = TABS.find(t => t.key === active)!;
  const showTypeFilter = availableTypes.length > 1;

  return (
    <div className={styles.panel}>
      {/* ── Tabs ── */}
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

      {/* ── Filtros ── */}
      {tabItems.length > 0 && (
        <div className={styles.filters}>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {showTypeFilter && (
            <select
              className={styles.typeSelect}
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
            >
              <option value="">All types</option>
              {availableTypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* ── Grid de ítems ── */}
      <ItemGrid items={filteredItems} placeholder={activeDef.placeholder} stats={stats} />

      {/* ── Resultado de búsqueda ── */}
      {(search || typeFilter) && filteredItems.length === 0 && tabItems.length > 0 && (
        <div className={styles.empty}>No results for "{search || typeFilter}"</div>
      )}
    </div>
  );
}
