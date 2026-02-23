import type { CharacterData } from '../../types';
import StatsPanel from '../StatsPanel/StatsPanel';
import DerivedStatsPanel from '../DerivedStatsPanel/DerivedStatsPanel';
import EquipmentGrid from '../EquipmentGrid/EquipmentGrid';
import InventoryPanel from '../InventoryPanel/InventoryPanel';
import styles from './BuildPage.module.css';

interface Props {
  character: CharacterData;
  onBack: () => void;
}

export default function BuildPage({ character, onBack }: Props) {
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
            <span className={styles.playtime}>{character.playtime} jugadas</span>
          </div>
        </div>

        <div className={styles.headerRight} />
      </header>

      {/* ── Body ── */}
      <div className={styles.main}>
        <aside className={styles.sidebar}>
          <StatsPanel stats={character.stats} />
          <DerivedStatsPanel stats={character.stats} equipped={character.equipped} />
        </aside>

        <section className={styles.content}>
          <EquipmentGrid equipped={character.equipped} />
          <InventoryPanel inventory={character.inventory} />
        </section>
      </div>

    </div>
  );
}
