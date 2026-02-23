/**
 * patch-armor-precision.ts — Reemplaza los valores enteros de defensa de armaduras
 * (provenientes de fanapis) con los valores float precisos extraídos directamente
 * del EquipParamProtector del juego, vía EldenRingArmorOptimizer.
 *
 * Fuente: https://github.com/jerpdoesgames/EldenRingArmorOptimizer
 * Datos: valores float reales del regulation.bin del juego (no redondeados)
 *
 * También agrega el campo `poise` a cada armadura, que fanapis no provee.
 *
 * Uso:
 *   npx ts-node --project tsconfig.scripts.json scripts/patch-armor-precision.ts
 *   npx ts-node --project tsconfig.scripts.json scripts/patch-armor-precision.ts --dry-run
 */

import * as fs   from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as vm   from 'vm';

const DRY_RUN = process.argv.includes('--dry-run');

const SOURCE_URL =
  'https://raw.githubusercontent.com/jerpdoesgames/EldenRingArmorOptimizer/main/armor/data/armor.js';

const ARMORS_PATH = path.join(__dirname, '..', 'src', 'data', 'armors.json');

// ── Tipo de la fuente ────────────────────────────────────────

interface OptEntry {
  name:       string;
  itemID:     number;
  setID:      number;
  slotType:   number;   // 1=Helm 2=Chest 3=Gauntlets 4=Greaves
  weight:     number;
  poise:      number;
  physical:   number;
  strike:     number;
  slash:      number;
  pierce:     number;
  magic:      number;
  fire:       number;
  lightning:  number;
  holy:       number;
  immunity:   number;
  robustness: number;
  focus:      number;
  vitality:   number;
}

// ── Tipo local de armors.json ────────────────────────────────

interface LocalArmor {
  id:     number;
  name:   string;
  type:   string;
  weight: number;
  poise?: number;
  defense: {
    physical:  number;
    strike:    number;
    slash:     number;
    pierce:    number;
    magic:     number;
    fire:      number;
    lightning: number;
    holy:      number;
  };
  image?: string;
}

// ── Helpers ──────────────────────────────────────────────────

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} al descargar ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    }).on('error', reject);
  });
}

/** Normaliza nombres para comparación: minúsculas, sin apóstrofos/especiales, espacios simples */
function norm(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc'`]/g, '')   // apóstrofos tipográficos y ASCII
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Intenta encontrar la entrada del optimizador para un nombre dado,
 * con varios fallbacks:
 *  1. Match exacto normalizado
 *  2. Sin sufijo " (altered)"
 *  3. Reemplazar variantes ortográficas conocidas
 */
function findEntry(name: string, byName: Map<string, OptEntry>): OptEntry | undefined {
  const key = norm(name);
  if (byName.has(key)) return byName.get(key);

  // Fallback: quitar " (altered)"
  const noAltered = key.replace(/\s*\(altered\)\s*$/, '').trim();
  if (noAltered !== key && byName.has(noAltered)) return byName.get(noAltered);

  // Fallback: variantes tipográficas/nomenclatura fanapis → optimizer
  const corrections: Record<string, string> = {
    // Typos de fanapis (Godksin → Godskin)
    'godksin noble robe':        'godskin noble robe',
    'godksin apostle robe':      'godskin apostle robe',
    'godksin noble hood':        'godskin noble hood',
    'godksin apostle hood':      'godskin apostle hood',
    'godksin noble trousers':    'godskin noble trousers',
    'godksin apostle trousers':  'godskin apostle trousers',
    'godksin noble bracelets':   'godskin noble bracelets',
    'godksin apostle bracelets': 'godskin apostle bracelets',
    // "Greave" (singular fanapis) → "Greaves" (plural optimizer/juego)
    'blackflame monk greave':    'blackflame monk greaves',
    // fanapis usa "Gauntlets", el juego real usa "Bracers"
    'champion gauntlets':        'champion bracers',
    // fanapis omite el genitivo: "Old Sorcerer" → "Old Sorcerer's"
    'old sorcerer legwraps':     'old sorcerers legwraps',
  };
  const corrected = corrections[key];
  if (corrected && byName.has(corrected)) return byName.get(corrected);

  return undefined;
}

// ── Main ─────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('⬇  Descargando datos de precisión de EldenRingArmorOptimizer…');
  const code = await fetchText(SOURCE_URL);

  // Ejecutar el JS en sandbox: el archivo declara `const armor = [...]`
  // Lo envolvemos en un IIFE para que `return armor` funcione.
  const optData = vm.runInNewContext(
    `(function() { ${code}\nreturn armor; })()`,
    {}
  ) as OptEntry[];

  console.log(`✔  ${optData.length} armaduras cargadas desde la fuente.`);

  // Mapa normalizado → entrada
  const byName = new Map<string, OptEntry>();
  for (const e of optData) byName.set(norm(e.name), e);

  // Cargar nuestro armors.json
  const armors: LocalArmor[] = JSON.parse(fs.readFileSync(ARMORS_PATH, 'utf-8'));

  let patched   = 0;
  let missed    = 0;
  const missedNames: string[] = [];

  for (const armor of armors) {
    const opt = findEntry(armor.name, byName);

    if (opt) {
      // Aplicar valores float precisos
      armor.defense.physical  = opt.physical;
      armor.defense.strike    = opt.strike;
      armor.defense.slash     = opt.slash;
      armor.defense.pierce    = opt.pierce;
      armor.defense.magic     = opt.magic;
      armor.defense.fire      = opt.fire;
      armor.defense.lightning = opt.lightning;
      armor.defense.holy      = opt.holy;
      armor.poise             = opt.poise;
      patched++;
    } else {
      missed++;
      missedNames.push(armor.name);
    }
  }

  // Reporte
  console.log('');
  console.log(`✅ Parcheadas: ${patched} / ${armors.length}`);
  console.log(`⚠️  Sin match:  ${missed}`);

  if (missedNames.length > 0) {
    console.log('');
    console.log('Armaduras sin datos de precisión (probablemente DLC o variantes):');
    for (const n of missedNames) console.log(`   - ${n}`);
  }

  if (DRY_RUN) {
    console.log('\n[DRY-RUN] No se escribió nada.');
    return;
  }

  fs.writeFileSync(ARMORS_PATH, JSON.stringify(armors, null, 2), 'utf-8');
  console.log(`\n✔  armors.json actualizado con ${patched} valores float precisos.`);
  if (missed > 0) {
    console.log(`   Las ${missed} armaduras sin match mantienen sus valores enteros de fanapis.`);
  }
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
