/**
 * sync-data.ts — Descarga y normaliza la base de datos de ítems de Elden Ring.
 *
 * Fuentes:
 *   - Armas, Armaduras, Talismanes, Hechizos: eldenring.fanapis.com
 *     → API REST pública, sin autenticación
 *
 * Uso:
 *   npm run sync-data
 *
 * Los JSON resultantes se guardan en src/data/ y se commitean al repo
 * para no depender de la disponibilidad de las APIs en runtime.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const DATA_DIR = path.join(__dirname, '..', 'src', 'data');

// ── Tipos internos del script ────────────────────────────────

interface FanApiResponse<T> {
  success: boolean;
  count: number;
  total: number;
  data: T[];
}

interface FanApiWeapon {
  id: string;
  name: string;
  category: string;
  weight: number;
  attack: Array<{ name: string; amount: number }>;
  requiredAttributes: Array<{ name: string; amount: number }>;
  scalesWith: Array<{ name: string; scaling: string }>;
  image?: string;
}

interface FanApiArmor {
  id: string;
  name: string;
  category: string;
  weight: number;
  dmgNegation: Array<{ name: string; amount: number }>;
  image?: string;
}

interface FanApiTalisman {
  id: string;
  name: string;
  effect: string;
  image?: string;
}

interface FanApiSpell {
  id: string;
  name: string;
  type?: string;
  requiresFaith?: number;
  requiresIntelligence?: number;
  requiresArcane?: number;
  image?: string;
}

// ── Nuestros tipos destino ────────────────────────────────────

import type {
  Weapon, Armor, Talisman, Spell,
  WeaponType, ArmorType, ScalingGrade,
} from '../src/items/types';

// ── Utilidades HTTP ──────────────────────────────────────────

function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'elden-ring-build-advisor/1.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchJson<T>(res.headers.location!).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} al GET ${url}`));
        return;
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data) as T); }
        catch (e) { reject(new Error(`JSON inválido desde ${url}: ${e}`)); }
      });
    }).on('error', reject);
  });
}

/** Descarga todas las páginas de un endpoint de fanapis con paginación */
async function fetchAllFanApi<T>(endpoint: string): Promise<T[]> {
  const base = `https://eldenring.fanapis.com/api/${endpoint}`;
  const first = await fetchJson<FanApiResponse<T>>(`${base}?limit=100&page=0`);
  const all: T[] = [...first.data];

  const totalPages = Math.ceil(first.total / 100);
  for (let page = 1; page < totalPages; page++) {
    try {
      const next = await fetchJson<FanApiResponse<T>>(`${base}?limit=100&page=${page}`);
      all.push(...next.data);
      process.stdout.write(`  página ${page + 1}/${totalPages}...\r`);
    } catch (err) {
      console.warn(`  WARN: falló página ${page}: ${err}`);
    }
  }
  return all;
}

// ── Sincronización de armas ──────────────────────────────────

async function syncWeapons(): Promise<void> {
  console.log('\n[1/4] Descargando armas...');
  try {
    const raw = await fetchAllFanApi<FanApiWeapon>('weapons');
    const weapons = raw.map((w, i) => normalizeFanApiWeapon(w, i));
    console.log(`  ${weapons.length} armas`);
    saveJson('weapons.json', weapons);
  } catch (err) {
    console.warn(`  WARN: fanapis weapons falló: ${err}`);
    console.warn('  Usando datos placeholder');
    saveJson('weapons.json', getPlaceholderWeapons());
  }
}

function normalizeFanApiWeapon(w: FanApiWeapon, idx: number): Weapon {
  const getAtk = (name: string): number =>
    w.attack?.find(a => a.name?.toLowerCase().startsWith(name))?.amount ?? 0;

  const getReq = (name: string): number =>
    w.requiredAttributes?.find(r => r.name?.toLowerCase().startsWith(name))?.amount ?? 0;

  const getScale = (name: string): ScalingGrade => {
    const entry = w.scalesWith?.find(s => s.name?.toLowerCase().startsWith(name));
    if (!entry) return '-';
    const g = entry.scaling?.toUpperCase();
    if (g === 'S' || g === 'A' || g === 'B' || g === 'C' || g === 'D' || g === 'E') return g;
    return '-';
  };

  return {
    id: 1000000 + idx * 1000,
    name: w.name,
    type: normalizeWeaponType(w.category ?? ''),
    weight: w.weight ?? 0,
    requirements: {
      str: getReq('str'),
      dex: getReq('dex'),
      int: getReq('int'),
      fai: getReq('fai'),
      arc: getReq('arc'),
    },
    scaling: {
      str: getScale('str'),
      dex: getScale('dex'),
      int: getScale('int'),
      fai: getScale('fai'),
      arc: getScale('arc'),
    },
    damage: {
      physical:  getAtk('phy'),
      magic:     getAtk('mag'),
      fire:      getAtk('fir'),
      lightning: getAtk('lig'),
      holy:      getAtk('hol'),
    },
    passives: [],
    image: w.image ?? '',
  };
}

function normalizeWeaponType(raw: string): WeaponType {
  const map: Record<string, WeaponType> = {
    'dagger': 'Dagger', 'straight sword': 'Straight Sword', 'greatsword': 'Greatsword',
    'colossal sword': 'Colossal Sword', 'thrusting sword': 'Thrusting Sword',
    'heavy thrusting sword': 'Heavy Thrusting Sword', 'curved sword': 'Curved Sword',
    'curved greatsword': 'Curved Greatsword', 'katana': 'Katana', 'twinblade': 'Twinblade',
    'hammer': 'Hammer', 'great hammer': 'Great Hammer', 'flail': 'Flail',
    'axe': 'Axe', 'greataxe': 'Greataxe', 'lance': 'Lance', 'great spear': 'Great Spear',
    'halberd': 'Halberd', 'scythe': 'Scythe', 'whip': 'Whip', 'fist': 'Fist',
    'claw': 'Claw', 'light bow': 'Light Bow', 'bow': 'Bow', 'greatbow': 'Greatbow',
    'crossbow': 'Crossbow', 'ballista': 'Ballista', 'small shield': 'Small Shield',
    'medium shield': 'Medium Shield', 'greatshield': 'Greatshield',
    'glintstone staff': 'Glintstone Staff', 'sacred seal': 'Sacred Seal',
    'colossal weapon': 'Colossal Weapon', 'spear': 'Spear',
  };
  return map[raw.toLowerCase()] ?? 'Other';
}

// ── Sincronización de armaduras ──────────────────────────────

async function syncArmors(): Promise<void> {
  console.log('\n[2/4] Descargando armaduras...');
  try {
    const raw = await fetchAllFanApi<FanApiArmor>('armors');
    const armors = raw.map((a, i) => normalizeArmor(a, i));
    console.log(`  ${armors.length} armaduras`);
    saveJson('armors.json', armors);
  } catch (err) {
    console.warn(`  WARN: fanapis armors falló: ${err}`);
    console.warn('  Usando datos placeholder');
    saveJson('armors.json', getPlaceholderArmors());
  }
}

function normalizeArmor(a: FanApiArmor, idx: number): Armor {
  // fanapis usa nombres abreviados/typo: "Phy", "Strike", "Slash", "Pierce",
  // "Magic", "Fire", "Ligt" (sic — typo de Lightning), "Holy"
  const getDef = (name: string): number =>
    a.dmgNegation?.find(d => d.name?.toLowerCase().includes(name))?.amount ?? 0;

  const type = normalizeArmorType(a.category ?? '');

  return {
    id: 10000000 + idx * 10000,
    name: a.name,
    type,
    weight: a.weight ?? 0,
    defense: {
      physical:  getDef('phy'),    // "Phy"
      strike:    getDef('strike'), // "Strike"
      slash:     getDef('slash'),  // "Slash"
      pierce:    getDef('pierce'), // "Pierce"
      magic:     getDef('magic'),  // "Magic"
      fire:      getDef('fire'),   // "Fire"
      lightning: getDef('ligt'),   // "Ligt" — typo en fanapis
      holy:      getDef('holy'),   // "Holy"
    },
    image: a.image ?? '',
  };
}

function normalizeArmorType(raw: string): ArmorType {
  const lower = raw.toLowerCase();
  if (lower.includes('helm') || lower.includes('head')) return 'Helm';
  if (lower.includes('chest') || lower.includes('armor') || lower.includes('body')) return 'Chest Armor';
  if (lower.includes('gauntlet') || lower.includes('arm') || lower.includes('glove')) return 'Gauntlets';
  if (lower.includes('leg') || lower.includes('greave') || lower.includes('boot')) return 'Leg Armor';
  return 'Chest Armor';
}

// ── Sincronización de talismanes ─────────────────────────────

async function syncTalismans(): Promise<void> {
  console.log('\n[3/4] Descargando talismanes...');
  try {
    const raw = await fetchAllFanApi<FanApiTalisman>('talismans');
    const talismans: Talisman[] = raw.map((t, i) => ({
      id: 1000 + i,
      name: t.name,
      effect: t.effect ?? '',
      image: t.image ?? '',
    }));
    console.log(`  ${talismans.length} talismanes`);
    saveJson('talismans.json', talismans);
  } catch (err) {
    console.warn(`  WARN: fanapis talismans falló: ${err}`);
    console.warn('  Usando datos placeholder');
    saveJson('talismans.json', getPlaceholderTalismans());
  }
}

// ── Sincronización de hechizos ───────────────────────────────

async function syncSpells(): Promise<void> {
  console.log('\n[4/4] Descargando hechizos...');
  try {
    const [sorceries, incantations] = await Promise.all([
      fetchAllFanApi<FanApiSpell>('sorceries'),
      fetchAllFanApi<FanApiSpell>('incantations'),
    ]);

    const spells: Spell[] = [
      ...sorceries.map((s, i) => normalizeSpell(s, 'sorcery', 8000 + i)),
      ...incantations.map((s, i) => normalizeSpell(s, 'incantation', 9000 + i)),
    ];

    console.log(`  ${spells.length} hechizos (${sorceries.length} sorceries + ${incantations.length} incantations)`);
    saveJson('spells.json', spells);
  } catch (err) {
    console.warn(`  WARN: fanapis spells falló: ${err}`);
    console.warn('  Usando datos placeholder');
    saveJson('spells.json', getPlaceholderSpells());
  }
}

function normalizeSpell(s: FanApiSpell, type: 'sorcery' | 'incantation', id: number): Spell {
  return {
    id,
    name: s.name,
    type,
    requirements: {
      str: 0,
      dex: 0,
      int: s.requiresIntelligence ?? (type === 'sorcery' ? 10 : 0),
      fai: s.requiresFaith ?? (type === 'incantation' ? 10 : 0),
      arc: s.requiresArcane ?? 0,
    },
    image: s.image ?? '',
  };
}

// ── Datos placeholder (como los actuales en src/data) ────────

function getPlaceholderWeapons(): Weapon[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../src/data/weapons.json') as Weapon[];
}
function getPlaceholderArmors(): Armor[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../src/data/armors.json') as Armor[];
}
function getPlaceholderTalismans(): Talisman[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../src/data/talismans.json') as Talisman[];
}
function getPlaceholderSpells(): Spell[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../src/data/spells.json') as Spell[];
}

// ── Guardar JSON ─────────────────────────────────────────────

function saveJson(filename: string, data: unknown[]): void {
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`  Guardado: ${filePath} (${data.length} ítems)`);
}

// ── Punto de entrada ─────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== sync-data: Descargando base de datos de ítems de Elden Ring ===');
  fs.mkdirSync(DATA_DIR, { recursive: true });

  await syncWeapons();
  await syncArmors();
  await syncTalismans();
  await syncSpells();

  console.log('\n✓ sync-data completado. Archivos en src/data/');
}

main().catch(err => {
  console.error('[sync-data] Error fatal:', err);
  process.exit(1);
});
