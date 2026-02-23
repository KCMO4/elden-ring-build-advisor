import type { EquippedItems, EquippedWeapon, QuickSlotItem } from '../../types';
import ItemSlot from '../ItemSlot/ItemSlot';
import styles from './EquipmentGrid.module.css';

interface Props {
  equipped: EquippedItems;
  onItemHover?: (item: EquippedWeapon | null, rect: DOMRect | null) => void;
}

/** Move equipped items to the front, empty slots to the back */
function compactSlots<T extends EquippedWeapon>(slots: T[]): T[] {
  const filled = slots.filter(s => s.rawId !== 0xFFFFFFFF && s.rawId !== 0 && s.name);
  const empty  = slots.filter(s => s.rawId === 0xFFFFFFFF || s.rawId === 0 || !s.name);
  return [...filled, ...empty];
}

function isQuickSlotEmpty(item: QuickSlotItem): boolean {
  return item.rawId === 0xFFFFFFFF || item.rawId === 0 || !item.name;
}

export default function EquipmentGrid({ equipped, onItemHover }: Props) {
  const leftHand  = compactSlots(equipped.leftHand);
  const rightHand = compactSlots(equipped.rightHand);

  const filledQuickItems = equipped.quickItems?.filter(q => !isQuickSlotEmpty(q)) ?? [];
  const filledPouch      = equipped.pouch?.filter(q => !isQuickSlotEmpty(q)) ?? [];

  return (
    <div className={styles.panel}>
      {/* ── Great Rune ── */}
      {equipped.greatRune && equipped.greatRune.name && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Great Rune</div>
          <div className={styles.greatRuneRow}>
            <div className={styles.greatRuneSlot}>
              <span className={styles.greatRuneIcon}>ᛟ</span>
              <span className={styles.greatRuneName}>{equipped.greatRune.name}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Armas ── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Weapons</div>
        <div className={styles.weaponsRow}>
          <div className={styles.handGroup}>
            <div className={styles.handLabel}>Left Hand</div>
            <div className={styles.handSlots}>
              {leftHand.map((w, i) => (
                <ItemSlot
                  key={i}
                  item={w}
                  label={`LH${i + 1}`}
                  category="weapon"
                  animIndex={i}
                  onHover={onItemHover}
                />
              ))}
            </div>
          </div>
          <div className={styles.handGroup}>
            <div className={styles.handLabel}>Right Hand</div>
            <div className={styles.handSlots}>
              {rightHand.map((w, i) => (
                <ItemSlot
                  key={i}
                  item={w}
                  label={`RH${i + 1}`}
                  category="weapon"
                  animIndex={3 + i}
                  onHover={onItemHover}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Armadura ── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Armor</div>
        <div className={styles.armorRow}>
          <ItemSlot item={equipped.head}  label="Head"  category="armor-head"  animIndex={6}  onHover={onItemHover} />
          <ItemSlot item={equipped.chest} label="Chest" category="armor-chest" animIndex={7}  onHover={onItemHover} />
          <ItemSlot item={equipped.hands} label="Arms"  category="armor-hands" animIndex={8}  onHover={onItemHover} />
          <ItemSlot item={equipped.legs}  label="Legs"  category="armor-legs"  animIndex={9}  onHover={onItemHover} />
        </div>
      </div>

      {/* ── Talismanes ── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Talismans</div>
        <div className={styles.talismanRow}>
          {equipped.talismans.map((t, i) => (
            <ItemSlot
              key={i}
              item={t}
              label={`T${i + 1}`}
              category="talisman"
              animIndex={10 + i}
              onHover={onItemHover}
            />
          ))}
        </div>
      </div>

      {/* ── Quick Items ── */}
      {filledQuickItems.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Quick Items</div>
          <div className={styles.quickItemsRow}>
            {filledQuickItems.map((item, i) => (
              <div key={i} className={styles.quickSlot} title={item.name ?? ''}>
                <span className={styles.quickSlotIcon}>◆</span>
                <span className={styles.quickSlotName}>{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Pouch ── */}
      {filledPouch.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Pouch</div>
          <div className={styles.quickItemsRow}>
            {filledPouch.map((item, i) => (
              <div key={i} className={styles.quickSlot} title={item.name ?? ''}>
                <span className={styles.quickSlotIcon}>◆</span>
                <span className={styles.quickSlotName}>{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
