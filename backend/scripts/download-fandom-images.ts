/**
 * download-fandom-images.ts — Descarga iconos faltantes desde la wiki de Fandom.
 *
 * Descarga imágenes para ammos, key items, cookbooks y multiplayer items
 * que no están cubiertos por fanapis.
 *
 * Uso:
 *   npx ts-node --project tsconfig.scripts.json scripts/download-fandom-images.ts
 *   npx ts-node --project tsconfig.scripts.json scripts/download-fandom-images.ts --force
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import sharp from 'sharp';

const DATA_DIR   = path.join(__dirname, '..', 'src', 'data');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const IMAGE_SIZE = 128;
const FORCE      = process.argv.includes('--force');

// ── Mapping: item key → wiki filename → local path ─────────────────────

interface ImageMapping {
  /** Key para FALLBACK_IMAGES (lowercase, normalizado) */
  key: string;
  /** Nombre del archivo en la wiki de Fandom (sin "File:" prefix) */
  wikiFile: string;
  /** Subcarpeta de imágenes (dentro de IMAGES_DIR) */
  category: string;
  /** Nombre del archivo local (sin extensión, se añade .webp) */
  localName: string;
}

const MAPPINGS: ImageMapping[] = [
  // ── Ammos ────────────────────────────────────────────────────
  { key: 'arrow',                          wikiFile: 'ER_Icon_ammo_Arrow.png',                          category: 'ammos', localName: 'arrow' },
  { key: 'fire arrow',                     wikiFile: 'ER_Icon_ammo_Fire_Arrow.png',                     category: 'ammos', localName: 'fire_arrow' },
  { key: 'serpent arrow',                   wikiFile: 'ER_Icon_ammo_Serpent_Arrow.png',                  category: 'ammos', localName: 'serpent_arrow' },
  { key: "st. trina's arrow",              wikiFile: "ER_Icon_ammo_Trina's_Arrow.png",                  category: 'ammos', localName: 'st_trinas_arrow' },
  { key: 'shattershard arrow (fletched)',   wikiFile: 'ER_Icon_ammo_Shattershard_Arrow_(Fletched).png',  category: 'ammos', localName: 'shattershard_arrow_fletched' },
  { key: 'bone arrow',                     wikiFile: 'ER_Icon_ammo_Bone_Arrow.png',                     category: 'ammos', localName: 'bone_arrow' },
  { key: 'great arrow',                    wikiFile: 'ER_Icon_ammo_Great_Arrow.png',                    category: 'ammos', localName: 'great_arrow' },
  { key: 'bolt',                           wikiFile: 'ER_Icon_ammo_Bolt.png',                           category: 'ammos', localName: 'bolt' },
  { key: "perfumer's bolt",                wikiFile: "ER_Icon_ammo_Perfumer's_Bolt.png",                category: 'ammos', localName: 'perfumers_bolt' },
  { key: 'black-key bolt',                 wikiFile: 'ER_Icon_ammo_Black-Key_Bolt.png',                 category: 'ammos', localName: 'black_key_bolt' },
  { key: 'burred bolt',                    wikiFile: 'ER_Icon_ammo_Burred_Bolt.png',                    category: 'ammos', localName: 'burred_bolt' },
  { key: 'meteor bolt',                    wikiFile: 'ER_Icon_ammo_Meteor_Bolt.png',                    category: 'ammos', localName: 'meteor_bolt' },
  { key: "lordsworn's bolt",               wikiFile: "ER_Icon_ammo_Lordsworn's_Bolt.png",               category: 'ammos', localName: 'lordsworns_bolt' },
  { key: 'ballista bolt',                  wikiFile: 'ER_Icon_ammo_Ballista_Bolt.png',                  category: 'ammos', localName: 'ballista_bolt' },

  // ── Key Items ────────────────────────────────────────────────
  { key: "rya's necklace",                 wikiFile: "ER_Icon_Key_Item_Rya's_Necklace.png",             category: 'keyitems', localName: 'ryas_necklace' },
  { key: 'volcano manor invitation',       wikiFile: "ER_Icon_Key_Item_Irina's_Letter.png",             category: 'keyitems', localName: 'letter_generic' },
  { key: "godrick's great rune",           wikiFile: "ER_Icon_Key_Item_Great_Rune_Godrick's.png",       category: 'keyitems', localName: 'godricks_great_rune' },
  { key: "lord of blood's favor",          wikiFile: "ER_Icon_Key_Item_Lord_of_Blood's_Favor_(Soaked).png", category: 'keyitems', localName: 'lord_of_bloods_favor' },
  { key: 'knifeprint clue',               wikiFile: 'ER_Icon_Key_Item_Black_Knifeprint.png',           category: 'keyitems', localName: 'black_knifeprint' },
  { key: 'meeting place map',             wikiFile: 'ER_Icon_Map_Meeting_Place.png',                    category: 'keyitems', localName: 'meeting_place_map' },
  { key: '"homing instinct" painting',     wikiFile: 'ER_Icon_Info_Painting_Homing_Instinct.png',       category: 'keyitems', localName: 'painting_homing_instinct' },
  { key: '"resurrection" painting',        wikiFile: 'ER_Icon_Info_Painting_Resurrection.png',          category: 'keyitems', localName: 'painting_resurrection' },
  { key: '"prophecy" painting',            wikiFile: 'ER_Icon_Info_Painting_Prophecy.png',              category: 'keyitems', localName: 'painting_prophecy' },

  // Maps
  { key: 'map:   limgrave, west',         wikiFile: 'ER_Icon_Map_(Limgrave,_West).png',                category: 'keyitems', localName: 'map_limgrave_west' },
  { key: 'map:   weeping peninsula',      wikiFile: 'ER_Icon_Map_(Weeping_Peninsula).png',             category: 'keyitems', localName: 'map_weeping_peninsula' },
  { key: 'map:   limgrave, east',         wikiFile: 'ER_Icon_Map_(Limgrave,_East).png',                category: 'keyitems', localName: 'map_limgrave_east' },
  { key: 'map:   liurnia, east',          wikiFile: 'ER_Icon_Map_(Liurnia,_East).png',                 category: 'keyitems', localName: 'map_liurnia_east' },
  { key: 'map:   liurnia, north',         wikiFile: 'ER_Icon_Map_(Liurnia,_North).png',                category: 'keyitems', localName: 'map_liurnia_north' },
  { key: 'map:   liurnia, west',          wikiFile: 'ER_Icon_Map_(Liurnia,_West).png',                 category: 'keyitems', localName: 'map_liurnia_west' },
  { key: 'map:   siofra river',           wikiFile: 'ER_Icon_Map_(Siofra_River).png',                  category: 'keyitems', localName: 'map_siofra_river' },

  // Notes (generic icon)
  { key: 'note:   flask of wondrous physick',   wikiFile: "ER_Icon_Info_Furnace_Keeper's_Note.png", category: 'keyitems', localName: 'note_generic' },
  { key: 'note:   stonedigger trolls',           wikiFile: "ER_Icon_Info_Furnace_Keeper's_Note.png", category: 'keyitems', localName: 'note_generic' },
  { key: 'note:   flame chariots',               wikiFile: "ER_Icon_Info_Furnace_Keeper's_Note.png", category: 'keyitems', localName: 'note_generic' },
  { key: 'note:   land squirts',                 wikiFile: "ER_Icon_Info_Furnace_Keeper's_Note.png", category: 'keyitems', localName: 'note_generic' },
  { key: 'note:   waypoint ruins',               wikiFile: "ER_Icon_Info_Furnace_Keeper's_Note.png", category: 'keyitems', localName: 'note_generic' },
  { key: 'note:   the lord of frenzied flame',   wikiFile: "ER_Icon_Info_Furnace_Keeper's_Note.png", category: 'keyitems', localName: 'note_generic' },

  // Prayerbook & Bell Bearings
  { key: 'godskin prayerbook',                    wikiFile: 'ER_Icon_Book_Godskin_Prayerbook.png',         category: 'keyitems', localName: 'godskin_prayerbook' },
  { key: "thops's bell bearing",                  wikiFile: "ER_Icon_Key_Item_Sorcerer's_Bell_Bearing.png", category: 'keyitems', localName: 'bell_bearing_sorcerer' },
  { key: "smithing-stone miner's bell bearing [1]", wikiFile: 'ER_Icon_Key_Item_Bell_Bearing_1.png',       category: 'keyitems', localName: 'bell_bearing_1' },

  // ── Cookbooks ────────────────────────────────────────────────
  { key: "nomadic warrior's cookbook",       wikiFile: "ER_Icon_Book_nomadic_warrior's_cookbook.png",       category: 'cookbooks', localName: 'nomadic_warriors_cookbook' },
  { key: "glintstone craftsman's cookbook",   wikiFile: "ER_Icon_Book_glintstone_craftsman's_cookbook.png", category: 'cookbooks', localName: 'glintstone_craftsmans_cookbook' },
  { key: "missionary's cookbook",            wikiFile: "ER_Icon_Book_missionary's_cookbook.png",           category: 'cookbooks', localName: 'missionarys_cookbook' },

  // ── Multiplayer ──────────────────────────────────────────────
  { key: 'phantom bloody finger',           wikiFile: 'ER_Icon_Tool_Phantom_Bloody_Finger.png',          category: 'multiplayer', localName: 'phantom_bloody_finger' },
  // "Godrick's Great Rune" in multiplayer category → reuse same key item icon
];

// ── Utilidades ──────────────────────────────────────────────────

function fetchBuffer(url: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'elden-ring-build-advisor/1.0' } }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        fetchBuffer(res.headers.location).then(resolve);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        resolve(null);
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', () => resolve(null));
    }).on('error', () => resolve(null));
  });
}

interface ApiPage {
  title: string;
  imageinfo?: Array<{ url: string }>;
  missing?: string;
}

/**
 * Consulta la API de Fandom para resolver File: titles a CDN URLs.
 * Acepta hasta 50 titles por llamada.
 */
async function resolveWikiUrls(wikiFiles: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const titles = wikiFiles.map(f => `File:${f}`).join('|');
  const apiUrl = `https://eldenring.fandom.com/api.php?action=query&titles=${encodeURIComponent(titles)}&prop=imageinfo&iiprop=url&format=json`;

  const buf = await fetchBuffer(apiUrl);
  if (!buf) return result;

  try {
    const json = JSON.parse(buf.toString());
    const pages: Record<string, ApiPage> = json.query?.pages ?? {};
    for (const page of Object.values(pages)) {
      if (page.missing !== undefined) continue;
      const url = page.imageinfo?.[0]?.url;
      if (url) {
        // API returns title with spaces: "File:ER Icon ammo Arrow.png"
        // Normalize to underscores to match our wikiFile keys
        const filename = page.title.replace(/^File:/, '').replace(/ /g, '_');
        result.set(filename, url);
      }
    }
  } catch {
    console.error('  Error parsing API response');
  }

  return result;
}

async function downloadAndOptimize(url: string, destPath: string): Promise<boolean> {
  if (!FORCE && fs.existsSync(destPath)) return true;

  const buf = await fetchBuffer(url);
  if (!buf) return false;

  try {
    await sharp(buf)
      .resize(IMAGE_SIZE, IMAGE_SIZE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(destPath);
    return true;
  } catch (e) {
    console.error(`  Error processing ${destPath}:`, e);
    return false;
  }
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('=== Download Fandom Images ===\n');

  // Deduplicate: multiple items can map to the same file (e.g. notes → note_generic)
  const uniqueDownloads = new Map<string, { wikiFile: string; category: string; localName: string }>();
  for (const m of MAPPINGS) {
    const destKey = `${m.category}/${m.localName}`;
    if (!uniqueDownloads.has(destKey)) {
      uniqueDownloads.set(destKey, { wikiFile: m.wikiFile, category: m.category, localName: m.localName });
    }
  }

  // Collect unique wiki files to query
  const wikiFiles = [...new Set([...uniqueDownloads.values()].map(d => d.wikiFile))];
  console.log(`Resolving ${wikiFiles.length} wiki file URLs...\n`);

  // Batch query API (max 50 per call)
  const urlMap = new Map<string, string>();
  for (let i = 0; i < wikiFiles.length; i += 50) {
    const batch = wikiFiles.slice(i, i + 50);
    const resolved = await resolveWikiUrls(batch);
    for (const [k, v] of resolved) urlMap.set(k, v);
  }

  console.log(`  Resolved: ${urlMap.size}/${wikiFiles.length}\n`);

  // Ensure directories exist
  const categories = [...new Set([...uniqueDownloads.values()].map(d => d.category))];
  for (const cat of categories) {
    const dir = path.join(IMAGES_DIR, cat);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`  Created directory: ${dir}`);
    }
  }

  // Download
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const [destKey, download] of uniqueDownloads) {
    const destPath = path.join(IMAGES_DIR, download.category, `${download.localName}.webp`);
    const url = urlMap.get(download.wikiFile);

    if (!url) {
      console.log(`  ✗ ${destKey} — wiki file not found: ${download.wikiFile}`);
      failed++;
      continue;
    }

    if (!FORCE && fs.existsSync(destPath)) {
      skipped++;
      continue;
    }

    const success = await downloadAndOptimize(url, destPath);
    if (success) {
      console.log(`  ✓ ${destKey}`);
      ok++;
    } else {
      console.log(`  ✗ ${destKey} — download failed`);
      failed++;
    }
  }

  console.log(`\n=== Done: ${ok} downloaded, ${skipped} skipped, ${failed} failed ===`);

  // Print FALLBACK_IMAGES entries for copy-paste
  console.log('\n// ── FALLBACK_IMAGES entries ──\n');
  for (const m of MAPPINGS) {
    const localPath = `/images/${m.category}/${m.localName}.webp`;
    const padKey = `'${m.key}'`.padEnd(52);
    console.log(`  ${padKey} ${localPath},`);
  }
}

main().catch(console.error);
