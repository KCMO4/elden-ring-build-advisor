import { useState, useRef } from 'react';
import type { EquippedWeapon } from '../../types';
import styles from './ItemSlot.module.css';

export type ItemCategory =
  | 'weapon'
  | 'armor-head'
  | 'armor-chest'
  | 'armor-hands'
  | 'armor-legs'
  | 'talisman'
  | 'quick-item'
  | 'pouch'
  | 'great-rune';

interface Props {
  item?: EquippedWeapon | null;
  label?: string;
  category?: ItemCategory;
  size?: 'normal' | 'small';
  animIndex?: number;
  onHover?: (item: EquippedWeapon | null, rect: DOMRect | null) => void;
}

// SVG placeholders inline por categoría
function PlaceholderSvg({ category }: { category: ItemCategory }) {
  switch (category) {
    case 'weapon':
      return (
        <svg viewBox="0 0 24 24" className={styles.svgPlaceholder} fill="currentColor">
          {/* Espada */}
          <path d="M6.3 2.8L2.8 6.3l1.4 1.4 1-1 12 12-1 1 1.4 1.4 3.5-3.5-1.4-1.4-1 1-12-12 1-1L6.3 2.8z"/>
          <path d="M3 19l2 2 4-4-2-2L3 19zM21 3l-3 3-1-1-1 1 1 1-3 3 1 1 3-3 1 1 1-1-1-1 3-3L21 3z"/>
        </svg>
      );
    case 'armor-head':
      return (
        <svg viewBox="0 0 24 24" className={styles.svgPlaceholder} fill="currentColor">
          {/* Yelmo */}
          <path d="M12 2C8.1 2 5 5.1 5 9v2c0 1.1.4 2.1 1 2.9V16h12v-2.1c.6-.8 1-1.8 1-2.9V9c0-3.9-3.1-7-7-7zm0 2c2.8 0 5 2.2 5 5v2c0 .6-.1 1.2-.4 1.7L16 13H8l-.6-.3C7.1 12.2 7 11.6 7 11V9c0-2.8 2.2-5 5-5zM8 17h8v1H8z"/>
        </svg>
      );
    case 'armor-chest':
      return (
        <svg viewBox="0 0 24 24" className={styles.svgPlaceholder} fill="currentColor">
          {/* Coraza */}
          <path d="M12 2L6 5v6c0 4.4 2.6 8.5 6 10.4C15.4 19.5 18 15.4 18 11V5l-6-3zm0 2.2l4 2V11c0 3.4-1.7 6.6-4 8.5-2.3-1.9-4-5.1-4-8.5V6.2l4-2zM9 8h6v2H9V8zm0 3h6v2H9v-2z"/>
        </svg>
      );
    case 'armor-hands':
      return (
        <svg viewBox="0 0 24 24" className={styles.svgPlaceholder} fill="currentColor">
          {/* Guante */}
          <path d="M16 3c-1.1 0-2 .9-2 2H10C8.9 5 8 5.9 8 7v8c0 2.2 1.8 4 4 4h.5c1.9 0 3.5-1.3 3.9-3H16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 2h.1c0 0-.1 0 0 0V14h-1v-4H14v4h-2V7h6V5h-2zm-3 2H9v5h1V8h1v4h1V7z"/>
        </svg>
      );
    case 'armor-legs':
      return (
        <svg viewBox="0 0 24 24" className={styles.svgPlaceholder} fill="currentColor">
          {/* Grebas */}
          <path d="M9 2v10H7v10h4V14h2v8h4V12h-2V2H9zm2 2h2v8h-2V4zm-2 10h6v8H7l-.1-8H9zm2 2v4h2v-4h-2z"/>
        </svg>
      );
    case 'talisman':
      return (
        <svg viewBox="0 0 24 24" className={styles.svgPlaceholder} fill="currentColor">
          {/* Rombo / gema */}
          <path d="M12 2L4 9l8 13 8-13L12 2zm0 2.8L17.5 9 12 18.2 6.5 9 12 4.8zM9 9.5L12 15l3-5.5H9z"/>
        </svg>
      );
    case 'quick-item':
      return (
        <svg viewBox="0 0 24 24" className={styles.svgPlaceholder} fill="currentColor">
          {/* Flask / frasco */}
          <path d="M9 2v2H8v2l-3 8v4c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-4l-3-8V4h-1V2H9zm2 2h2v2h-2V4zM8.3 14L10 9h4l1.7 5H8.3zM7 16h10v2H7v-2z"/>
        </svg>
      );
    case 'pouch':
      return (
        <svg viewBox="0 0 24 24" className={styles.svgPlaceholder} fill="currentColor">
          {/* Bolsa / bag */}
          <path d="M9 4c-1.1 0-2 .9-2 2H5v12c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V6h-2c0-1.1-.9-2-2-2H9zm0 2h6v1H9V6zM7 8h10v10H7V8zm3 2v2h4v-2h-4z"/>
        </svg>
      );
    case 'great-rune':
      return (
        <svg viewBox="0 0 24 24" className={styles.svgPlaceholder} fill="currentColor">
          {/* Runa ᛟ estilizada */}
          <path d="M12 2L7 7v4l-3 3v2l3-3v5l5 5 5-5v-5l3 3v-2l-3-3V7l-5-5zm0 3l3 3v3l-3 3-3-3V8l3-3zm0 8l2 2v2l-2 2-2-2v-2l2-2z"/>
        </svg>
      );
    default:
      return <span className={styles.placeholder}>—</span>;
  }
}

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

export default function ItemSlot({
  item,
  label,
  category = 'weapon',
  size = 'normal',
  animIndex = 0,
  onHover,
}: Props) {
  const [imgError, setImgError] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  const empty = isEmptyItem(item);
  const displayName = !empty && item?.name ? baseName(item) : null;
  const tooltip = !empty && item?.name ? item.name : undefined;

  const showImage = !empty && !!item?.image && !imgError;
  const showPlaceholder = !showImage;

  const handleMouseEnter = () => {
    if (onHover && !empty && item && frameRef.current) {
      onHover(item, frameRef.current.getBoundingClientRect());
    }
  };

  const handleMouseLeave = () => {
    if (onHover) onHover(null, null);
  };

  return (
    <div className={`${styles.slot} ${size === 'small' ? styles.slotSmall : ''}`} style={{ animationDelay: `${animIndex * 45}ms` }}>
      <div
        ref={frameRef}
        className={`${styles.frame} ${empty ? styles.frameEmpty : ''} ${size === 'small' ? styles.frameSmall : ''}`}
        title={tooltip}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {showImage && (
          <img
            src={item!.image}
            alt={item!.name ?? ''}
            className={styles.image}
            onError={() => setImgError(true)}
          />
        )}

        {showPlaceholder && (
          <PlaceholderSvg category={category} />
        )}

        {!empty && item?.upgradeLevel !== undefined && item.upgradeLevel > 0 && (
          <span className={styles.badge}>+{item.upgradeLevel}</span>
        )}

        {!empty && item?.infusion && (
          <span
            className={styles.infusionBadge}
            data-infusion={item.infusion.toLowerCase().replace(' ', '-')}
          >
            {item.infusion}
          </span>
        )}
      </div>

      {label && <span className={styles.label}>{label}</span>}
      {displayName && <span className={styles.name}>{truncateName(displayName)}</span>}
    </div>
  );
}
