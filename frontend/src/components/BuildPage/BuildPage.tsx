import { useState, useRef, useMemo, useEffect } from 'react';
import html2canvas from 'html2canvas';
import type { CharacterData, EquippedWeapon } from '../../types';
import StatsPanel from '../StatsPanel/StatsPanel';
import DerivedStatsPanel from '../DerivedStatsPanel/DerivedStatsPanel';
import EquipmentGrid from '../EquipmentGrid/EquipmentGrid';
import InventoryPanel from '../InventoryPanel/InventoryPanel';
import AdvisorPanel from '../AdvisorPanel/AdvisorPanel';
import MatchmakingCalc from '../MatchmakingCalc/MatchmakingCalc';
import ItemTooltip from '../ItemTooltip/ItemTooltip';
import { useImagePreloader } from '../../hooks/useImagePreloader';
import { loadScalingData } from '../../utils/scalingData';
import styles from './BuildPage.module.css';

type ContentTab = 'inventory' | 'builds' | 'matchmaking';

interface Props {
  character: CharacterData;
  onBack: () => void;
}

export default function BuildPage({ character, onBack }: Props) {
  const [hoveredItem, setHoveredItem] = useState<EquippedWeapon | null>(null);
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);
  const [exporting, setExporting] = useState(false);
  const [contentTab, setContentTab] = useState<ContentTab>('inventory');
  const captureRef = useRef<HTMLDivElement>(null);

  // Main weapon for AdvisorPanel (scaling tips)
  const mainWeapon = useMemo(
    () => character.equipped.rightHand.find(w => w.name && w.damage) ?? null,
    [character.equipped.rightHand],
  );

  // Collect all image URLs from equipped + inventory for preloading
  const allImageUrls = useMemo(() => {
    const urls: string[] = [];
    const eq = character.equipped;
    // Equipped items
    for (const w of [...eq.rightHand, ...eq.leftHand]) if (w.image) urls.push(w.image);
    if (eq.head.image) urls.push(eq.head.image);
    if (eq.chest.image) urls.push(eq.chest.image);
    if (eq.hands.image) urls.push(eq.hands.image);
    if (eq.legs.image) urls.push(eq.legs.image);
    for (const t of eq.talismans) if (t.image) urls.push(t.image);
    for (const q of eq.quickItems) if (q.image) urls.push(q.image);
    for (const p of eq.pouch) if (p.image) urls.push(p.image);
    if (eq.greatRune?.image) urls.push(eq.greatRune.image);
    // Inventory items (all 14 categories)
    const inv = character.inventory;
    for (const cat of Object.values(inv)) {
      for (const item of cat) if (item.image) urls.push(item.image);
    }
    return urls;
  }, [character]);

  const preloadProgress = useImagePreloader(allImageUrls);

  // Load exact scaling data in background (improves AR accuracy if available)
  useEffect(() => { loadScalingData(); }, []);

  const handleItemHover = (item: EquippedWeapon | null, rect: DOMRect | null) => {
    setHoveredItem(item);
    setTooltipRect(rect);
  };

  const handleExport = async () => {
    if (!captureRef.current || exporting) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(captureRef.current, {
        backgroundColor: '#0a0906',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const link = document.createElement('a');
      link.download = `${character.name}-build.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>← Back</button>

        <div className={styles.heroInfo}>
          <h1 className={styles.charName}>{character.name}</h1>
          <div className={styles.charMeta}>
            <span className={styles.levelBadge}>Level {character.level}</span>
            <span className={styles.metaDot}>·</span>
            <span className={styles.playtime}>{character.playtime}</span>
          </div>
        </div>

        {/* ── Acciones + Runas ── */}
        <div className={styles.headerRight}>
          <button
            className={`${styles.exportBtn} ${exporting ? styles.exportBtnBusy : ''}`}
            onClick={handleExport}
            disabled={exporting}
            title="Download build as PNG"
          >
            {exporting ? '...' : '↓ PNG'}
          </button>
          <div className={styles.runeBlock}>
            <span className={styles.runeIcon}>ᛟ</span>
            <div className={styles.runeInfo}>
              <span className={styles.runeValue}>
                {character.heldRunes.toLocaleString('en-US')}
              </span>
              <span className={styles.runeLabel}>runes</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div className={styles.main} ref={captureRef}>
        <aside className={styles.sidebar}>
          <StatsPanel stats={character.stats} talismans={character.equipped.talismans} />
          <DerivedStatsPanel stats={character.stats} equipped={character.equipped} level={character.level} heldRunes={character.heldRunes} />
        </aside>

        <section className={styles.equipment}>
          <EquipmentGrid equipped={character.equipped} onItemHover={handleItemHover} />
          {!preloadProgress.done && (
            <div className={styles.preloadBar}>
              <div
                className={styles.preloadFill}
                style={{ width: `${(preloadProgress.loaded / preloadProgress.total) * 100}%` }}
              />
              <span className={styles.preloadLabel}>
                Loading images... {preloadProgress.loaded}/{preloadProgress.total}
              </span>
            </div>
          )}
        </section>

        <section className={styles.content}>
          <div className={styles.contentTabs}>
            <button
              className={`${styles.contentTab} ${contentTab === 'inventory' ? styles.contentTabActive : ''}`}
              onClick={() => setContentTab('inventory')}
            >
              Inventory
            </button>
            <button
              className={`${styles.contentTab} ${contentTab === 'builds' ? styles.contentTabActive : ''}`}
              onClick={() => setContentTab('builds')}
            >
              Builds
            </button>
            <button
              className={`${styles.contentTab} ${contentTab === 'matchmaking' ? styles.contentTabActive : ''}`}
              onClick={() => setContentTab('matchmaking')}
            >
              Matchmaking
            </button>
          </div>
          {contentTab === 'inventory' && (
            <InventoryPanel inventory={character.inventory} stats={character.stats} />
          )}
          {contentTab === 'builds' && (
            <AdvisorPanel
              stats={character.stats}
              level={character.level}
              mainWeapon={mainWeapon}
              inventory={character.inventory}
            />
          )}
          {contentTab === 'matchmaking' && (
            <MatchmakingCalc
              level={character.level}
              inventory={character.inventory}
            />
          )}
        </section>
      </div>

      {/* ── Tooltip flotante ── */}
      {hoveredItem && tooltipRect && (
        <ItemTooltip item={hoveredItem} triggerRect={tooltipRect} stats={character.stats} />
      )}
    </div>
  );
}
