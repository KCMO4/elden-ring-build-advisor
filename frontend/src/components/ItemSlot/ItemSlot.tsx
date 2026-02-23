import type { EquippedWeapon } from '../../types';
import styles from './ItemSlot.module.css';

interface Props {
  item?: EquippedWeapon | null;
  label?: string;
  category?: 'weapon' | 'armor' | 'talisman';
  animIndex?: number;
}

const CATEGORY_PLACEHOLDERS: Record<string, string> = {
  weapon: '⚔',
  armor: '🛡',
  talisman: '✦',
};

function isEmptyItem(item?: EquippedWeapon | null): boolean {
  if (!item) return true;
  if (item.rawId === 0xFFFFFFFF || item.rawId === 0) return true;
  if (!item.name) return true;
  return false;
}

function truncateName(name: string, max = 12): string {
  return name.length > max ? name.slice(0, max - 1) + '…' : name;
}

function baseName(item: EquippedWeapon): string {
  if (!item.name) return '';
  if (item.upgradeLevel && item.upgradeLevel > 0) {
    return item.name.replace(/ \+\d+$/, '');
  }
  return item.name;
}

export default function ItemSlot({ item, label, category = 'weapon', animIndex = 0 }: Props) {
  const empty = isEmptyItem(item);
  const placeholder = CATEGORY_PLACEHOLDERS[category] ?? '—';

  const displayName = !empty && item?.name ? baseName(item) : null;
  const tooltip = !empty && item?.name ? item.name : undefined;

  return (
    <div className={styles.slot} style={{ animationDelay: `${animIndex * 45}ms` }}>
      <div
        className={`${styles.frame} ${empty ? styles.frameEmpty : ''}`}
        title={tooltip}
      >
        {!empty && item?.image ? (
          <img
            src={item.image}
            alt={item.name ?? ''}
            className={styles.image}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <span className={styles.placeholder}>{placeholder}</span>
        )}

        {!empty && item?.upgradeLevel !== undefined && item.upgradeLevel > 0 && (
          <span className={styles.badge}>+{item.upgradeLevel}</span>
        )}
      </div>

      {label && <span className={styles.label}>{label}</span>}
      {displayName && <span className={styles.name}>{truncateName(displayName)}</span>}
    </div>
  );
}
