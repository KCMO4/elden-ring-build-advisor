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

function quickSlotToEquipped(item: QuickSlotItem): EquippedWeapon {
  const levelMatch = item.name?.match(/ \+(\d+)$/);
  return {
    rawId: item.rawId,
    baseId: item.baseId,
    name: item.name,
    image: item.image,
    upgradeLevel: levelMatch ? parseInt(levelMatch[1], 10) : undefined,
    quantity: item.quantity,
  };
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
            <ItemSlot
              item={quickSlotToEquipped(equipped.greatRune)}
              category="great-rune"
              animIndex={14}
              onHover={onItemHover}
            />
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

      {/* ── Flask of Wondrous Physick ── */}
      {(equipped.physickTears?.length ?? 0) > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Flask of Wondrous Physick</div>
          <div className={styles.quickItemsRow}>
            {equipped.physickTears!.map((tear, i) => (
              <ItemSlot
                key={i}
                item={quickSlotToEquipped(tear)}
                category="physick-tear"
                size="small"
                animIndex={45 + i}
                onHover={onItemHover}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Memory Slots (Spell Slots) ── */}
      {(equipped.memorySlotCount ?? 0) > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            Memory Slots ({equipped.spellSlots?.filter(s => s.name)?.length ?? 0}/{equipped.memorySlotCount})
          </div>
          <div className={styles.quickItemsRow}>
            {Array.from({ length: equipped.memorySlotCount! }).map((_, i) => {
              const spell = equipped.spellSlots?.[i];
              return (
                <ItemSlot
                  key={i}
                  item={spell ? quickSlotToEquipped(spell) : undefined}
                  category="spell-slot"
                  size="small"
                  animIndex={31 + i}
                  onHover={onItemHover}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Quick Items ── */}
      {filledQuickItems.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Quick Items</div>
          <div className={styles.quickItemsRow}>
            {filledQuickItems.map((item, i) => (
              <ItemSlot
                key={i}
                item={quickSlotToEquipped(item)}
                category="quick-item"
                size="small"
                animIndex={15 + i}
                onHover={onItemHover}
              />
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
              <ItemSlot
                key={i}
                item={quickSlotToEquipped(item)}
                category="pouch"
                size="small"
                animIndex={25 + i}
                onHover={onItemHover}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
