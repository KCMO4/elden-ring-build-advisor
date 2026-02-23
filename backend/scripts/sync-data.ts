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

interface FanApiShield {
  id: string;
  name: string;
  category?: string;
  weight?: number;
  attack?: Array<{ name: string; amount: number }>;
  defence?: Array<{ name: string; amount: number }>;
  image?: string;
}

interface FanApiAsh {
  id: string;
  name: string;
  affinity?: string;
  skill?: string;
  image?: string;
}

interface FanApiSpirit {
  id: string;
  name: string;
  fpCost?: string | number;
  hpCost?: string | number;
  effect?: string;
  image?: string;
}

interface FanApiConsumable {
  id: string;
  name: string;
  type?: string;
  effect?: string;
  image?: string;
}

// ── Nuestros tipos destino ────────────────────────────────────

import type {
  Weapon, Armor, Talisman, Spell,
  WeaponType, ArmorType, ScalingGrade,
  Shield, Ash, Spirit, Consumable,
} from '../src/items/types';

// ── Fallback de imagen (Fextralife wiki) ─────────────────────

/**
 * Construye una URL de imagen de Fextralife wiki como fallback.
 * El frontend intenta cargar la URL; si da 404 muestra el SVG placeholder.
 */
function fextralifeFallback(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9 -]/g, '')
    .trim()
    .replace(/ +/g, '-');
  return `https://eldenring.wiki.fextralife.com/file/Elden-Ring/${slug}.png`;
}

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

// ── Correcciones manuales de datos erróneos de fanapis ───────
// Fuente: Fextralife wiki / community research.
// Se aplican después de normalizar, antes de guardar.

const WEAPON_CORRECTIONS: Partial<Record<string, Partial<Weapon>>> = {
  // fanapis devuelve damage todo 0; valor real en wiki: físico 86 base +0
  "Serpentbone Blade": {
    damage: { physical: 86, magic: 0, fire: 0, lightning: 0, holy: 0 },
    scaling: { str: 'E', dex: 'D', int: '-', fai: '-', arc: 'D' },
  },
  // weight=0 en fanapis; peso real: 20.5
  "Gargoyle's Great Axe": { weight: 20.5 },
  // Crossbows / Ballistas: fanapis no registra su escalado
  // Fuente: wiki Fextralife
  "Light Crossbow":                { scaling: { str: 'D', dex: 'D', int: '-', fai: '-', arc: '-' } },
  "Soldier's Crossbow":            { scaling: { str: 'E', dex: 'D', int: '-', fai: '-', arc: '-' } },
  "Heavy Crossbow":                { scaling: { str: 'D', dex: 'D', int: '-', fai: '-', arc: '-' } },
  "Arbalest":                      { scaling: { str: 'D', dex: 'D', int: '-', fai: '-', arc: '-' } },
  "Pulley Crossbow":               { scaling: { str: 'D', dex: 'D', int: '-', fai: '-', arc: '-' } },
  "Crepus's Black-key Crossbow":   { scaling: { str: 'D', dex: 'D', int: '-', fai: '-', arc: '-' } },
  "Full Moon Crossbow":            { scaling: { str: 'D', dex: 'D', int: 'E', fai: '-', arc: '-' } },
  "Hand Ballista":                 { scaling: { str: 'D', dex: 'E', int: '-', fai: '-', arc: '-' } },
  "Jar Cannon":                    { scaling: { str: 'D', dex: '-', int: '-', fai: '-', arc: '-' } },
};

function applyWeaponCorrections(w: Weapon): Weapon {
  const fix = WEAPON_CORRECTIONS[w.name];
  if (!fix) return w;
  return {
    ...w,
    weight:  fix.weight  ?? w.weight,
    damage:  fix.damage  ? { ...w.damage, ...fix.damage }   : w.damage,
    scaling: fix.scaling ? { ...w.scaling, ...fix.scaling } : w.scaling,
  };
}

async function syncWeapons(): Promise<void> {
  console.log('\n[1/8] Descargando armas...');
  try {
    const raw = await fetchAllFanApi<FanApiWeapon>('weapons');
    // Normalizar y aplicar correcciones manuales
    const all = raw.map((w, i) => applyWeaponCorrections(normalizeFanApiWeapon(w, i)));
    // Eliminar duplicados por nombre (conservar el primero)
    const seen = new Set<string>();
    const weapons = all.filter(w => {
      if (seen.has(w.name)) { console.warn(`  WARN: duplicado eliminado: ${w.name}`); return false; }
      seen.add(w.name);
      return true;
    });
    console.log(`  ${weapons.length} armas (${raw.length - weapons.length} duplicados eliminados)`);
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
    image: w.image || fextralifeFallback(w.name),
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
  console.log('\n[2/8] Descargando armaduras...');
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
  // fanapis es MUY inconsistente con los nombres de tipos de negación.
  // Nombres observados en la API real:
  //   Physical : "Phy", "Physical"
  //   Strike   : "Strike", "Str", "StrEldenike"   ← la principal causa de 0s
  //   Slash    : "Slash"
  //   Pierce   : "Pierce"
  //   Magic    : "Magic", "Mag"
  //   Fire     : "Fire", "Fire:"
  //   Lightning: "Ligt", "Light"
  //   Holy     : "Holy"
  //
  // Estrategia: por cada tipo buscamos todos los entries cuyo nombre
  // (lowercased) comience con alguno de los prefijos conocidos.
  // startsWith('str') cubre 'Str', 'Strike' y 'StrEldenike'.
  // startsWith('mag') cubre 'Mag' y 'Magic'.
  // startsWith('phy') cubre 'Phy' y 'Physical'.
  const getDef = (prefixes: string[]): number => {
    const items = a.dmgNegation ?? [];
    for (const item of items) {
      const n = (item.name ?? '').toLowerCase().trim();
      if (prefixes.some(p => n.startsWith(p))) {
        return item.amount ?? 0;
      }
    }
    return 0;
  };

  const type = normalizeArmorType(a.category ?? '');

  return {
    id: 10000000 + idx * 10000,
    name: a.name,
    type,
    weight: a.weight ?? 0,
    poise: 0,  // fanapis no provee poise; se actualiza con patch-armor
    defense: {
      physical:  getDef(['phy']),           // Phy / Physical
      strike:    getDef(['str']),           // Str / Strike / StrEldenike
      slash:     getDef(['slash']),         // Slash
      pierce:    getDef(['pierce']),        // Pierce
      magic:     getDef(['mag']),           // Mag / Magic
      fire:      getDef(['fire']),          // Fire / Fire:
      lightning: getDef(['ligt', 'light']), // Ligt / Light
      holy:      getDef(['holy']),          // Holy
    },
    image: a.image || fextralifeFallback(a.name),
  };
}

function normalizeArmorType(raw: string): ArmorType {
  const lower = raw.toLowerCase().trim();
  // Matches exactos de los valores que devuelve fanapis
  if (lower === 'leg armor')    return 'Leg Armor';
  if (lower === 'gauntlets')    return 'Gauntlets';
  if (lower === 'helm')         return 'Helm';
  if (lower === 'chest armor')  return 'Chest Armor';
  // Fallbacks fuzzy — ORDEN CRÍTICO: 'leg' y 'greave' ANTES de cualquier
  // check que contenga 'armor', porque "Leg Armor".includes('armor') = true.
  if (lower.includes('leg') || lower.includes('greave') || lower.includes('boot')) return 'Leg Armor';
  if (lower.includes('helm') || lower.includes('head') || lower.includes('hat') ||
      lower.includes('hood') || lower.includes('crown') || lower.includes('mask'))  return 'Helm';
  if (lower.includes('gauntlet') || lower.includes('glove') || lower.includes('bracelet') ||
      lower.includes('manchette'))                                                   return 'Gauntlets';
  return 'Chest Armor';
}

// ── Sincronización de talismanes ─────────────────────────────

async function syncTalismans(): Promise<void> {
  console.log('\n[3/8] Descargando talismanes...');
  try {
    const raw = await fetchAllFanApi<FanApiTalisman>('talismans');
    const talismans: Talisman[] = raw.map((t, i) => ({
      id: 1000 + i,
      name: t.name,
      effect: t.effect ?? '',
      image: t.image || fextralifeFallback(t.name),
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
  console.log('\n[4/8] Descargando hechizos...');
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
    image: s.image || fextralifeFallback(s.name),
  };
}

// ── Sincronización de escudos ─────────────────────────────────

async function syncShields(): Promise<void> {
  console.log('\n[5/8] Descargando escudos...');
  try {
    const raw = await fetchAllFanApi<FanApiShield>('shields');
    const shields: Shield[] = raw.map(s => {
      const getAtk = (name: string): number =>
        s.attack?.find(a => a.name?.toLowerCase().startsWith(name))?.amount ?? 0;
      const getDef = (name: string): number =>
        s.defence?.find(d => d.name?.toLowerCase().includes(name))?.amount ?? 0;

      const cat = (s.category ?? '').toLowerCase();
      const category: Shield['category'] =
        cat.includes('great') ? 'Greatshield' :
        cat.includes('medium') ? 'Medium Shield' : 'Small Shield';

      return {
        id: s.id,
        name: s.name,
        category,
        weight: s.weight ?? 0,
        physicalAttack: getAtk('phy'),
        stability: getDef('boost'),
        image: s.image || fextralifeFallback(s.name),
      };
    });
    console.log(`  ${shields.length} escudos`);
    saveJson('shields.json', shields);
  } catch (err) {
    console.warn(`  WARN: fanapis shields falló: ${err}`);
  }
}

// ── Sincronización de cenizas de guerra ──────────────────────

async function syncAshes(): Promise<void> {
  console.log('\n[6/8] Descargando cenizas de guerra...');
  try {
    const raw = await fetchAllFanApi<FanApiAsh>('ashes');
    const ashes: Ash[] = raw.map(a => ({
      id: a.id,
      name: a.name,
      affinity: a.affinity ?? '',
      skill: a.skill ?? '',
      image: a.image || fextralifeFallback(a.name),
    }));
    console.log(`  ${ashes.length} cenizas de guerra`);
    saveJson('ashes.json', ashes);
  } catch (err) {
    console.warn(`  WARN: fanapis ashes falló: ${err}`);
  }
}

// ── Sincronización de espíritus ───────────────────────────────

async function syncSpirits(): Promise<void> {
  console.log('\n[7/8] Descargando espíritus invocables...');
  try {
    const raw = await fetchAllFanApi<FanApiSpirit>('spirits');
    const spirits: Spirit[] = raw.map(s => ({
      id: s.id,
      name: s.name,
      fpCost: Number(s.fpCost ?? 0),
      hpCost: Number(s.hpCost ?? 0),
      effect: s.effect ?? '',
      image: s.image || fextralifeFallback(s.name),
    }));
    console.log(`  ${spirits.length} espíritus`);
    saveJson('spirits.json', spirits);
  } catch (err) {
    console.warn(`  WARN: fanapis spirits falló: ${err}`);
  }
}

// ── Sincronización de consumibles ────────────────────────────

async function syncConsumables(): Promise<void> {
  console.log('\n[8/8] Descargando consumibles...');
  try {
    const raw = await fetchAllFanApi<FanApiConsumable>('items');
    const consumables: Consumable[] = raw.map(i => ({
      id: i.id,
      name: i.name,
      type: i.type ?? '',
      effect: i.effect ?? '',
      image: i.image || fextralifeFallback(i.name),
    }));
    console.log(`  ${consumables.length} consumibles`);
    saveJson('consumables.json', consumables);
  } catch (err) {
    console.warn(`  WARN: fanapis items falló: ${err}`);
  }
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
  await syncShields();
  await syncAshes();
  await syncSpirits();
  await syncConsumables();

  console.log('\n✓ sync-data completado. Archivos en src/data/');
}

main().catch(err => {
  console.error('[sync-data] Error fatal:', err);
  process.exit(1);
});
