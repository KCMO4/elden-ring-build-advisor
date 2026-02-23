/**
 * check-images.ts — Diagnóstico de cobertura de imágenes en los JSONs de ítems.
 *
 * Uso:
 *   npx ts-node --project tsconfig.scripts.json scripts/check-images.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'src', 'data');

interface Item { name: string; image?: string; }

function loadJson<T>(filename: string): T[] {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.warn(`  WARN: ${filename} no encontrado`);
    return [];
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T[];
}

function checkCategory(label: string, items: Item[]): number {
  const total = items.length;
  const withImage = items.filter(i => i.image && i.image.trim() !== '').length;
  const noImage = items.filter(i => !i.image || i.image.trim() === '');
  const pct = total > 0 ? ((withImage / total) * 100).toFixed(1) : '0.0';

  console.log(`\n[${label}] ${withImage}/${total} con imagen (${pct}%)`);

  if (noImage.length === 0) {
    console.log('  ✓ Todos tienen imagen');
  } else if (noImage.length <= 15) {
    noImage.forEach(i => console.log(`  - ${i.name}`));
  } else {
    console.log(`  (${noImage.length} sin imagen, mostrando los primeros 10):`);
    noImage.slice(0, 10).forEach(i => console.log(`  - ${i.name}`));
  }

  return withImage;
}

function main(): void {
  console.log('=== check-images: Diagnóstico de cobertura de imágenes ===');

  const weapons  = loadJson<Item>('weapons.json');
  const armors   = loadJson<Item>('armors.json');
  const talismans = loadJson<Item>('talismans.json');
  const spells   = loadJson<Item>('spells.json');

  const wImg = checkCategory('WEAPONS',   weapons);
  const aImg = checkCategory('ARMORS',    armors);
  const tImg = checkCategory('TALISMANS', talismans);
  const sImg = checkCategory('SPELLS',    spells);

  const total    = weapons.length + armors.length + talismans.length + spells.length;
  const withImg  = wImg + aImg + tImg + sImg;
  const pct = total > 0 ? ((withImg / total) * 100).toFixed(1) : '0.0';

  console.log(`\n${'='.repeat(54)}`);
  console.log(`TOTAL: ${withImg}/${total} con imagen (${pct}%)`);
  console.log(`${'='.repeat(54)}`);
}

main();
