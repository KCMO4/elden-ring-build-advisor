import { useState, useRef } from 'react';
import html2canvas from 'html2canvas';
import type { CharacterData, EquippedWeapon } from '../../types';
import StatsPanel from '../StatsPanel/StatsPanel';
import DerivedStatsPanel from '../DerivedStatsPanel/DerivedStatsPanel';
import EquipmentGrid from '../EquipmentGrid/EquipmentGrid';
import InventoryPanel from '../InventoryPanel/InventoryPanel';
import ItemTooltip from '../ItemTooltip/ItemTooltip';
import styles from './BuildPage.module.css';

// TODO: Advisor panel — planned tabs:
//   - "Recommended Builds"  : curated build suggestions based on character stats
//   - "Questlines"          : step-by-step guide for each NPC questline

interface Props {
  character: CharacterData;
  onBack: () => void;
}

export default function BuildPage({ character, onBack }: Props) {
  const [hoveredItem, setHoveredItem] = useState<EquippedWeapon | null>(null);
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);
  const [exporting, setExporting] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

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
          <DerivedStatsPanel stats={character.stats} equipped={character.equipped} />
        </aside>

        <section className={styles.content}>
          <EquipmentGrid equipped={character.equipped} onItemHover={handleItemHover} />
          <InventoryPanel inventory={character.inventory} />
        </section>
      </div>

      {/* ── Tooltip flotante ── */}
      {hoveredItem && tooltipRect && (
        <ItemTooltip item={hoveredItem} triggerRect={tooltipRect} stats={character.stats} />
      )}
    </div>
  );
}
