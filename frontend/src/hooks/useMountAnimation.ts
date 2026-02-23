import { useState, useEffect } from 'react';

/**
 * Retorna `true` en el frame siguiente al mount.
 * Permite disparar transiciones CSS que necesitan un render inicial en estado base
 * (p.ej. barras que empiezan en width:0 y transicionan a su valor real).
 */
export function useMountAnimation(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return ready;
}
