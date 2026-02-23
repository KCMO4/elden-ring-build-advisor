/**
 * useTooltipPosition — calcula la posición (x, y) de un tooltip en `position: fixed`
 * a partir del DOMRect del elemento trigger. Hace flip automático si no hay espacio.
 */

const TOOLTIP_WIDTH  = 272;
const TOOLTIP_HEIGHT = 320; // altura estimada máxima
const OFFSET = 10;

export interface TooltipPosition {
  x: number;
  y: number;
  side: 'right' | 'left';
}

export function useTooltipPosition(rect: DOMRect | null): TooltipPosition {
  if (!rect) return { x: 0, y: 0, side: 'right' };

  const spaceRight = window.innerWidth - rect.right;
  const spaceLeft  = rect.left;

  const side: 'right' | 'left' =
    spaceRight >= TOOLTIP_WIDTH + OFFSET ? 'right' : 'left';

  const x = side === 'right'
    ? rect.right + OFFSET
    : rect.left - TOOLTIP_WIDTH - OFFSET;

  // Centra verticalmente respecto al slot, con clamp para que no salga de pantalla
  const idealY = rect.top + rect.height / 2 - TOOLTIP_HEIGHT / 2;
  const y = Math.max(8, Math.min(idealY, window.innerHeight - TOOLTIP_HEIGHT - 8));

  // Si tampoco cabe por la izquierda, preferir derecha igualmente
  if (side === 'left' && spaceLeft < TOOLTIP_WIDTH + OFFSET) {
    return { x: rect.right + OFFSET, y, side: 'right' };
  }

  return { x, y, side };
}
