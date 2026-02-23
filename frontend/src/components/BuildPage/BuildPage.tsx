import { useState, useMemo, useRef } from 'react';
import html2canvas from 'html2canvas';
import type { CharacterData, EquippedWeapon } from '../../types';
import StatsPanel from '../StatsPanel/StatsPanel';
import DerivedStatsPanel from '../DerivedStatsPanel/DerivedStatsPanel';
import EquipmentGrid from '../EquipmentGrid/EquipmentGrid';
import InventoryPanel from '../InventoryPanel/InventoryPanel';
import AdvisorPanel from '../AdvisorPanel/AdvisorPanel';
import ItemTooltip from '../ItemTooltip/ItemTooltip';
import styles from './BuildPage.module.css';

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

  // Arma principal RH1 (primer slot con arma real) — para el Advisor y el optimizer
  const mainWeapon = useMemo(
    () => character.equipped.rightHand.find(w => w.name && w.damage) ?? null,
    [character.equipped],
  );

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

  // AR estimado del arma principal para la comparación en el Advisor
  const mainWeaponAR = useMemo(() => {
    if (!mainWeapon?.damage) return 0;
    const d = mainWeapon.damage;
    return d.physical + d.magic + d.fire + d.lightning + d.holy;
  }, [mainWeapon]);

  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>← Volver</button>

        <div className={styles.heroInfo}>
          <h1 className={styles.charName}>{character.name}</h1>
          <div className={styles.charMeta}>
            <span className={styles.levelBadge}>Nivel {character.level}</span>
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
            title="Descargar build como PNG"
          >
            {exporting ? '...' : '↓ PNG'}
          </button>
          <div className={styles.runeBlock}>
            <span className={styles.runeIcon}>ᛟ</span>
            <div className={styles.runeInfo}>
              <span className={styles.runeValue}>
                {character.heldRunes.toLocaleString('es-AR')}
              </span>
              <span className={styles.runeLabel}>runas</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div className={styles.main} ref={captureRef}>
        <aside className={styles.sidebar}>
          <StatsPanel stats={character.stats} talismans={character.equipped.talismans} />
          <DerivedStatsPanel stats={character.stats} equipped={character.equipped} />
          <AdvisorPanel stats={character.stats} mainWeaponAR={mainWeaponAR} mainWeapon={mainWeapon} />
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
