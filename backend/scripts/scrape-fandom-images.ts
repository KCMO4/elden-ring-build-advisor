/**
 * scrape-fandom-images.ts — Actualiza las URLs de imagen usando la API de Fandom wiki.
 *
 * Para cada ítem en weapons/armors/talismans/spells.json que no tenga imagen
 * (o cuya imagen sea un Fextralife fallback), consulta:
 *   https://eldenring.fandom.com/api.php?action=query&prop=pageimages&titles={name}&format=json&pithumbsize=256
 *
 * Si la API devuelve una imagen, la guarda en el JSON.
 * Si no, deja la URL existente.
 *
 * Uso:
 *   npx ts-node --project tsconfig.scripts.json scripts/scrape-fandom-images.ts
 *
 * Opciones:
 *   --all       Re-procesa todos los ítems (no sólo los sin imagen)
 *   --category  weapons|armors|talismans|spells  (sólo esa categoría)
 *   --dry-run   No escribe archivos, sólo imprime estadísticas
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const DATA_DIR = path.join(__dirname, '..', 'src', 'data');
const FEXTRALIFE_HOST = 'eldenring.wiki.fextralife.com';

// Tamaño del thumb solicitado (px). Fandom CDN sirve la imagen escalada.
const THUMB_SIZE = 256;
// Pausa entre peticiones para no sobrecargar la API (ms)
const REQUEST_DELAY = 150;
// Peticiones en paralelo (lote)
const BATCH_SIZE = 5;

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface ItemWithImage {
  id: number;
  name: string;
  image?: string;
  [key: string]: unknown;
}

interface MediaWikiResponse {
  query: {
    pages: {
      [pageId: string]: {
        pageid?: number;
        ns?: number;
        title: string;
        thumbnail?: {
          source: string;
          width: number;
          height: number;
        };
        pageimage?: string;
        missing?: string;
      };
    };
  };
}

// ── Utilidades ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadJson(filename: string): ItemWithImage[] {
  const p = path.join(DATA_DIR, filename);
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as ItemWithImage[];
}

function saveJson(filename: string, data: ItemWithImage[]): void {
  const p = path.join(DATA_DIR, filename);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  console.log(`  Guardado ${filename} (${data.length} ítems)`);
}

function isFextralife(url: string | undefined): boolean {
  return !!url && url.includes(FEXTRALIFE_HOST);
}

function needsImage(item: ItemWithImage, forceAll: boolean): boolean {
  if (forceAll) return true;
  return !item.image || item.image === '' || isFextralife(item.image);
}

/**
 * Artículos pequeños que la wiki escribe en minúsculas en títulos de página.
 * "Protection Of The Erdtree" → "Protection of the Erdtree"
 */
function normalizeTitle(name: string): string {
  const minor = new Set(['of','the','a','an','and','or','in','on','at','to','for','by','with','from']);
  return name
    .split(' ')
    .map((word, i) => {
      const lower = word.toLowerCase();
      return (i === 0 || !minor.has(lower)) ? word : lower;
    })
    .join(' ');
}

// ── API de Fandom (MediaWiki) ─────────────────────────────────────────────────

/**
 * Obtiene la URL de imagen para un conjunto de títulos (máx 50 por request).
 * Retorna un mapa: título normalizado → URL de thumb.
 */
function fetchFandomImages(titles: string[]): Promise<Map<string, string>> {
  return new Promise((resolve, reject) => {
    const encoded = titles.map(t => encodeURIComponent(t)).join('|');
    const url = `https://eldenring.fandom.com/api.php?action=query&prop=pageimages&titles=${encoded}&format=json&pithumbsize=${THUMB_SIZE}`;

    https.get(url, { headers: { 'User-Agent': 'elden-ring-build-advisor/1.0 (educational project)' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // seguir redirect
        https.get(res.headers.location!, { headers: { 'User-Agent': 'elden-ring-build-advisor/1.0' } }, (res2) => {
          collectBody(res2, resolve, reject, titles);
        }).on('error', reject);
        return;
      }
      collectBody(res, resolve, reject, titles);
    }).on('error', reject);
  });
}

function collectBody(
  res: import('http').IncomingMessage,
  resolve: (value: Map<string, string>) => void,
  reject: (reason: unknown) => void,
  titles: string[]
): void {
  let raw = '';
  res.on('data', (c: string) => { raw += c; });
  res.on('end', () => {
    try {
      const json = JSON.parse(raw) as MediaWikiResponse;
      const result = new Map<string, string>();

      for (const page of Object.values(json.query?.pages ?? {})) {
        if (page.missing !== undefined) continue;
        if (page.thumbnail?.source) {
          // Normalizar: quitar parámetros de escala para obtener la imagen original
          const src = page.thumbnail.source
            .replace(/\/revision\/latest\/scale-to-width-down\/\d+/, '/revision/latest')
            .split('?')[0];
          result.set(page.title.toLowerCase(), src);
        }
      }
      resolve(result);
    } catch (e) {
      reject(new Error(`JSON inválido de Fandom API: ${e}\n${raw.slice(0, 200)}`));
    }
  });
}

// ── Procesamiento por lotes ───────────────────────────────────────────────────

async function processCategory(
  filename: string,
  forceAll: boolean,
  dryRun: boolean
): Promise<{ total: number; updated: number; notFound: number }> {
  const items = loadJson(filename);
  const toUpdate = items.filter(item => needsImage(item, forceAll));

  console.log(`\n  ${filename}: ${toUpdate.length} ítems a consultar (de ${items.length} total)`);

  if (toUpdate.length === 0) {
    return { total: items.length, updated: 0, notFound: 0 };
  }

  // Construir índice por nombre (lowercase) para actualizar después
  const nameIndex = new Map<string, number>();
  for (let i = 0; i < items.length; i++) {
    nameIndex.set(items[i].name.toLowerCase(), i);
  }

  let updated = 0;
  let notFound = 0;

  // Procesar en lotes
  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const batch = toUpdate.slice(i, i + BATCH_SIZE);
    const titles = batch.map(item => item.name);

    // Incluir títulos normalizados alternativos en el mismo batch
    const normalizedTitles = titles.map(normalizeTitle);
    const allTitles = [...new Set([...titles, ...normalizedTitles])];

    try {
      const imageMap = await fetchFandomImages(allTitles);

      for (const item of batch) {
        const found = imageMap.get(item.name.toLowerCase())
          ?? imageMap.get(normalizeTitle(item.name).toLowerCase());
        if (found) {
          const idx = nameIndex.get(item.name.toLowerCase());
          if (idx !== undefined) {
            items[idx].image = found;
            updated++;
          }
        } else {
          notFound++;
          if (notFound <= 5) {
            process.stdout.write(`\n    Sin imagen: "${item.name}"`);
          }
        }
      }

      // Progreso
      const done = Math.min(i + BATCH_SIZE, toUpdate.length);
      process.stdout.write(`\r    Progreso: ${done}/${toUpdate.length} (${updated} actualizados)   `);

    } catch (err) {
      console.warn(`\n    WARN: error en lote ${i}-${i + BATCH_SIZE}: ${err}`);
    }

    if (i + BATCH_SIZE < toUpdate.length) {
      await sleep(REQUEST_DELAY);
    }
  }

  process.stdout.write('\n');

  if (!dryRun && updated > 0) {
    saveJson(filename, items);
  }

  return { total: items.length, updated, notFound };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const forceAll = args.includes('--all');
  const dryRun  = args.includes('--dry-run');
  const catArg  = args.find(a => !a.startsWith('--'));

  console.log('=== scrape-fandom-images: Descarga de imágenes desde Fandom wiki ===\n');
  console.log(`  Modo: ${forceAll ? 'TODOS los ítems' : 'sólo ítems sin imagen válida'}`);
  console.log(`  Dry-run: ${dryRun ? 'SÍ (no escribe archivos)' : 'NO'}`);
  console.log(`  Categoría: ${catArg ?? 'todas'}`);
  console.log(`  Batch size: ${BATCH_SIZE} | Delay: ${REQUEST_DELAY}ms\n`);

  const categories: Array<{ file: string; label: string }> = [
    { file: 'weapons.json',     label: 'Armas' },
    { file: 'armors.json',      label: 'Armaduras' },
    { file: 'talismans.json',   label: 'Talismanes' },
    { file: 'spells.json',      label: 'Hechizos' },
    { file: 'shields.json',     label: 'Escudos' },
    { file: 'ashes.json',       label: 'Cenizas de guerra' },
    { file: 'spirits.json',     label: 'Espíritus' },
    { file: 'consumables.json', label: 'Consumibles' },
  ];

  const filtered = catArg
    ? categories.filter(c => c.file.startsWith(catArg))
    : categories;

  if (filtered.length === 0) {
    console.error(`Categoría inválida: ${catArg}. Opciones: weapons, armors, talismans, spells, shields, ashes, spirits, consumables`);
    process.exit(1);
  }

  let totalUpdated = 0;
  let totalNotFound = 0;
  let totalItems = 0;

  for (const cat of filtered) {
    console.log(`\n── ${cat.label} (${cat.file}) ──────────────────────────────`);
    try {
      const stats = await processCategory(cat.file, forceAll, dryRun);
      totalUpdated  += stats.updated;
      totalNotFound += stats.notFound;
      totalItems    += stats.total;
    } catch (err) {
      console.error(`  ERROR procesando ${cat.file}: ${err}`);
    }
  }

  console.log('\n' + '='.repeat(54));
  console.log('Resultados finales:');
  console.log(`  Ítems totales    : ${totalItems}`);
  console.log(`  Imágenes nuevas  : ${totalUpdated}`);
  console.log(`  Sin imagen wiki  : ${totalNotFound}`);
  if (dryRun) {
    console.log('\n  [DRY-RUN] No se modificaron archivos.');
  } else if (totalUpdated > 0) {
    console.log('\n  ✓ JSONs actualizados con URLs de Fandom wiki (static.wikia.nocookie.net)');
    console.log('  El frontend cargará las imágenes directamente desde el CDN de Wikia.');
  }
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
