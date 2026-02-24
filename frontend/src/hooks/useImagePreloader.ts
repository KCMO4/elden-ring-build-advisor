import { useState, useEffect, useRef } from 'react';

interface PreloadProgress {
  loaded: number;
  total: number;
  done: boolean;
}

/**
 * Preloads an array of image URLs in batches using the browser's Image API.
 * Caller should memoize the `urls` array to avoid re-triggering.
 */
export function useImagePreloader(urls: string[]): PreloadProgress {
  const [loaded, setLoaded] = useState(0);
  const cancelledRef = useRef(false);

  const unique = useRef<string[]>([]);
  // Deduplicate and filter empty/falsy URLs
  if (urls !== unique.current) {
    const set = new Set<string>();
    const deduped: string[] = [];
    for (const url of urls) {
      if (url && !set.has(url)) {
        set.add(url);
        deduped.push(url);
      }
    }
    unique.current = deduped;
  }

  const total = unique.current.length;

  useEffect(() => {
    cancelledRef.current = false;
    setLoaded(0);

    const BATCH_SIZE = 20;
    let count = 0;
    let batchIdx = 0;

    function loadBatch() {
      if (cancelledRef.current) return;
      const start = batchIdx * BATCH_SIZE;
      if (start >= unique.current.length) return;

      const batch = unique.current.slice(start, start + BATCH_SIZE);
      batchIdx++;

      let batchDone = 0;
      for (const url of batch) {
        const img = new Image();
        const onDone = () => {
          if (cancelledRef.current) return;
          count++;
          batchDone++;
          setLoaded(count);
          if (batchDone === batch.length) {
            loadBatch();
          }
        };
        img.onload = onDone;
        img.onerror = onDone;
        img.src = url;
      }
    }

    if (unique.current.length > 0) {
      loadBatch();
    }

    return () => { cancelledRef.current = true; };
  }, [urls]);

  return { loaded, total, done: total === 0 || loaded >= total };
}
