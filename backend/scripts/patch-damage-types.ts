/**
 * patch-damage-types.ts — Overlay physical damage types onto weapons.json and shields.json
 *
 * Source: damageTypes.json (manual map by weapon category + name exceptions)
 * Based on Fextralife wiki + community datamines.
 *
 * Usage:
 *   npm run patch-damage-types
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'src', 'data');

interface DamageTypesMap {
  byCategory: Record<string, string[]>;
  byName: Record<string, string[]>;
}

interface HasNameAndType {
  name: string;
  type?: string;
  category?: string;
  damageTypes?: string[];
  [key: string]: unknown;
}

function main(): void {
  const dtPath = path.join(DATA_DIR, 'damageTypes.json');
  if (!fs.existsSync(dtPath)) {
    console.error('damageTypes.json not found.');
    process.exit(1);
  }

  const dtMap: DamageTypesMap = JSON.parse(fs.readFileSync(dtPath, 'utf8'));

  // Patch weapons
  const weaponsPath = path.join(DATA_DIR, 'weapons.json');
  if (fs.existsSync(weaponsPath)) {
    const weapons: HasNameAndType[] = JSON.parse(fs.readFileSync(weaponsPath, 'utf8'));
    let patched = 0;
    for (const w of weapons) {
      const types = dtMap.byName[w.name] ?? dtMap.byCategory[w.type ?? ''];
      if (types) {
        w.damageTypes = types;
        patched++;
      }
    }
    fs.writeFileSync(weaponsPath, JSON.stringify(weapons, null, 2), 'utf-8');
    console.log(`[patch-damage-types] Patched ${patched}/${weapons.length} weapons.`);
  }

  // Patch shields
  const shieldsPath = path.join(DATA_DIR, 'shields.json');
  if (fs.existsSync(shieldsPath)) {
    const shields: HasNameAndType[] = JSON.parse(fs.readFileSync(shieldsPath, 'utf8'));
    let patched = 0;
    for (const s of shields) {
      const types = dtMap.byName[s.name] ?? dtMap.byCategory[s.category ?? ''];
      if (types) {
        s.damageTypes = types;
        patched++;
      }
    }
    fs.writeFileSync(shieldsPath, JSON.stringify(shields, null, 2), 'utf-8');
    console.log(`[patch-damage-types] Patched ${patched}/${shields.length} shields.`);
  }
}

main();
