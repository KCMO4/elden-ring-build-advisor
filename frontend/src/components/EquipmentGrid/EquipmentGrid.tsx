import type { EquippedItems, EquippedWeapon } from '../../types';
import ItemSlot from '../ItemSlot/ItemSlot';
import styles from './EquipmentGrid.module.css';

interface Props {
  equipped: EquippedItems;
  onItemHover?: (item: EquippedWeapon | null, rect: DOMRect | null) => void;
}

export default function EquipmentGrid({ equipped, onItemHover }: Props) {
  return (
    <div className={styles.panel}>
      {/* ── Armas ── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Armas</div>
        <div className={styles.weaponsRow}>
          <div className={styles.handGroup}>
            <div className={styles.handLabel}>Mano izquierda</div>
            <div className={styles.handSlots}>
              {equipped.leftHand.map((w, i) => (
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
            <div className={styles.handLabel}>Mano derecha</div>
            <div className={styles.handSlots}>
              {equipped.rightHand.map((w, i) => (
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
        <div className={styles.sectionTitle}>Armadura</div>
        <div className={styles.armorRow}>
          <ItemSlot item={equipped.head}  label="Cabeza"  category="armor-head"  animIndex={6}  onHover={onItemHover} />
          <ItemSlot item={equipped.chest} label="Torso"   category="armor-chest" animIndex={7}  onHover={onItemHover} />
          <ItemSlot item={equipped.hands} label="Brazos"  category="armor-hands" animIndex={8}  onHover={onItemHover} />
          <ItemSlot item={equipped.legs}  label="Piernas" category="armor-legs"  animIndex={9}  onHover={onItemHover} />
        </div>
      </div>

      {/* ── Talismanes ── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Talismanes</div>
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
    </div>
  );
}
