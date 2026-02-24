/**
 * Scanner de inventario de Elden Ring (.sl2)
 *
 * Lee los ítems equipados y el inventario completo desde los datos de un slot.
 *
 * Estructura verificada contra ClayAmore/ER-Save-Editor (Rust):
 *   - ChrAsm2 = vigor_offset + 0x310 (dentro del slot data)
 *   - ChrAsm2 almacena gaitem_handles (no item IDs directos)
 *   - Los gaitem_handles se resuelven contra la tabla ga_items del slot
 *
 * Codificación de gaitem_handles:
 *   - High byte 0x80 = arma   → item_id en ga_items, base_id = item_id/100*100
 *   - High byte 0x90 = armadura → item_id en ga_items, armor_id = item_id ^ 0x10000000
 *   - High byte 0xA0 = talismán → talisman_id = handle ^ 0xA0000000 (sin ga_items lookup)
 *
 * Layout de ChrAsm2 (intercalado, 96 bytes = 0x60):
 *   +0x00: LH[0], +0x04: RH[0], +0x08: LH[1], +0x0C: RH[1], +0x10: LH[2], +0x14: RH[2]
 *   +0x18: arrows[0], +0x1C: bolts[0], +0x20: arrows[1], +0x24: bolts[1]
 *   +0x28: _unk0, +0x2C: _unk1, +0x30: _unk2, +0x34: _unk3
 *   +0x38: head, +0x3C: chest, +0x40: arms, +0x44: legs
 *   +0x48: _unk4, +0x4C: talismans[0..3], +0x5C: _unk5
 *
 * NOTA: El ER-Save-Editor etiqueta los campos en +0x30/+0x34 como head/chest (error).
 *       Los verdaderos slots de armadura están 8 bytes más tarde (+0x38..+0x44).
 */

import path from 'path';
import fs from 'fs';
import { INVENTORY, ITEM_CATEGORY, INVENTORY_HELD } from './constants';
import { findStats } from '../parser/stats';
import type {
  RawInventoryItem,
  ResolvedInventoryItem,
  EquippedItems,
  EquippedWeapon,
  QuickSlotItem,
  Inventory,
  InventoryScanResult,
  ItemCategory,
} from './types';

/** Normaliza nombre: lowercase + colapsar whitespace */
function norm(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

// ── Carga de JSON estática (evita caché de require()) ────────────────────────
function loadJsonFile<T>(relativePath: string): T | null {
  try {
    const absPath = path.join(__dirname, '..', 'data', relativePath);
    return JSON.parse(fs.readFileSync(absPath, 'utf8')) as T;
  } catch {
    return null;
  }
}

// ── Set de nombres de hechizos conocidos (de fanapis spells.json) ──────────
// Se carga una sola vez y se usa para distinguir hechizos de consumibles.
// Los hechizos están en nibble 0x4 con IDs mezclados con consumibles (rango ~4000-8000).
let _spellNameSet: Set<string> | null = null;
// Hechizos que existen en el juego pero no están en fanapis spells.json
const EXTRA_SPELLS = ['flame, cleanse me'];

function getSpellNameSet(): Set<string> {
  if (!_spellNameSet) {
    const spells = loadJsonFile<{ name: string }[]>('spells.json');
    _spellNameSet = spells ? new Set(spells.map(s => norm(s.name))) : new Set();
    for (const s of EXTRA_SPELLS) _spellNameSet.add(s);
  }
  return _spellNameSet;
}

// ── Clasificación de ítems de tipo consumible (nibble 0x4) ───────────────
//
// Fuente: EldenRingResources (Deskete) — EquipParamGoods ID ranges.
//
// Los hechizos se verifican por nombre contra spells.json (fanapis) para evitar
// falsos positivos donde talisman/consumable IDs solapan con el rango de hechizos.
//
function classifyConsumable(baseId: number, name: string): ItemCategory {
  // ── Hechizos: verificar por nombre contra el set de hechizos conocidos ──
  if (getSpellNameSet().has(norm(name))) return 'spell';

  // ── Spirit Ashes (EquipParamGoods, range 200000-299000) ──
  if (baseId >= 200000 && baseId < 300000) return 'spirit';

  // ── Recetas de crafteo ──
  if (baseId >= 9300 && baseId < 9500) return 'cookbook';

  // ── Lágrimas del Flask of Wondrous Physick ──
  if (baseId >= 11000 && baseId < 12000) return 'crystal_tear';

  // ── Materiales de mejora (Smithing Stones, Somber Stones, Glovewort) ──
  if (baseId >= 10100 && baseId < 11000) return 'upgrade';

  // ── Materiales de crafteo (monster drops, plantas, hongos, flora) ──
  if (baseId >= 14000 && baseId < 22000) return 'material';

  // ── Gestos (omitir del inventario de ítems) ──
  if (baseId >= 9000 && baseId < 9300) return 'gesture';

  // ── Ítems clave (Stonesword Keys, mapas, notas, scrolls, prayerbooks,
  //    Bell Bearings, Whetblades, medallones, cartas, llave runa) ──
  if (baseId >= 8000 && baseId < 9000) return 'key_item';
  if (baseId >= 10000 && baseId < 10100) return 'key_item'; // Golden Seed, Sacred Tear, Memory Stone

  // ── Ítems multijugador (Fingers, Rings, Effigies, Steed Whistle, etc.) ──
  if (baseId >= 100 && baseId < 250) return 'multiplayer';

  // ── Resto: consumibles (flasks, food, grease, boluses, throwables, pots, runes...) ──
  return 'consumable';
}

// ── Mapa de infusiones (EquipParamWeapon offset % 10000) ─────────────────────
const INFUSION_MAP: Record<number, string> = {
  100:  'Heavy',
  200:  'Keen',
  300:  'Quality',
  400:  'Fire',
  500:  'Flame Art',
  600:  'Lightning',
  700:  'Sacred',
  800:  'Magic',
  900:  'Cold',
  1000: 'Poison',
  1100: 'Blood',
  1200: 'Occult',
};

function decodeInfusion(baseId: number): string | undefined {
  const baseWeaponId = Math.floor(baseId / 10000) * 10000;
  const offset = baseId - baseWeaponId;
  return offset > 0 ? INFUSION_MAP[offset] : undefined;
}

// ── Flechas y ballestas: nibble 0x0 (weapon), base ID >= 50_000_000 ──
const AMMO_BASE_ID_MIN = 50_000_000;
import { ItemStore } from '../items/store';

// ── Fallback images para ítems que no están en fanapis ──────────────────────
// Imágenes servidas localmente desde /images/ (descargadas por sync-data + download-fandom-images)
const FALLBACK_IMAGES: Record<string, string> = {
  // Armors (sync-data fallbacks from Fextralife)
  'champion gaiters':                           '/images/armors/champion_gaiters_elden_ring_wiki_guide_200px.webp',
  'karolos glintstone crown':                   '/images/armors/karolos_glintstone_crown_elden_ring_wiki_guide_200px.webp',
  'roar medallion':                             '/images/talismans/roar_medallion_talisman_elden_ring_wiki_guide_200px.webp',
  'flame, cleanse me':                          '/images/spells/flame_cleanse_me_incantation_elden_ring_wiki_guide_200px.webp',

  // ── Ammos (Fandom wiki) ───────────────────────────────────────
  'arrow':                                      '/images/ammos/arrow.webp',
  'fire arrow':                                 '/images/ammos/fire_arrow.webp',
  'serpent arrow':                              '/images/ammos/serpent_arrow.webp',
  "st. trina's arrow":                          '/images/ammos/st_trinas_arrow.webp',
  'shattershard arrow (fletched)':              '/images/ammos/shattershard_arrow_fletched.webp',
  'bone arrow':                                 '/images/ammos/bone_arrow.webp',
  'great arrow':                                '/images/ammos/great_arrow.webp',
  'bolt':                                       '/images/ammos/bolt.webp',
  "perfumer's bolt":                            '/images/ammos/perfumers_bolt.webp',
  'black-key bolt':                             '/images/ammos/black_key_bolt.webp',
  'burred bolt':                                '/images/ammos/burred_bolt.webp',
  'meteor bolt':                                '/images/ammos/meteor_bolt.webp',
  "lordsworn's bolt":                           '/images/ammos/lordsworns_bolt.webp',
  'ballista bolt':                              '/images/ammos/ballista_bolt.webp',

  // ── Key Items (Fandom wiki) ───────────────────────────────────
  "rya's necklace":                             '/images/keyitems/ryas_necklace.webp',
  'volcano manor invitation':                   '/images/keyitems/letter_generic.webp',
  "godrick's great rune":                       '/images/keyitems/godricks_great_rune.webp',
  "lord of blood's favor":                      '/images/keyitems/lord_of_bloods_favor.webp',
  'knifeprint clue':                            '/images/keyitems/black_knifeprint.webp',
  'meeting place map':                          '/images/keyitems/meeting_place_map.webp',
  '"homing instinct" painting':                 '/images/keyitems/painting_homing_instinct.webp',
  '"resurrection" painting':                    '/images/keyitems/painting_resurrection.webp',
  '"prophecy" painting':                        '/images/keyitems/painting_prophecy.webp',
  'godskin prayerbook':                         '/images/keyitems/godskin_prayerbook.webp',
  "thops's bell bearing":                       '/images/keyitems/bell_bearing_sorcerer.webp',
  "smithing-stone miner's bell bearing":        '/images/keyitems/bell_bearing_1.webp',

  // Maps
  'map: limgrave, west':                        '/images/keyitems/map_limgrave_west.webp',
  'map: weeping peninsula':                     '/images/keyitems/map_weeping_peninsula.webp',
  'map: limgrave, east':                        '/images/keyitems/map_limgrave_east.webp',
  'map: liurnia, east':                         '/images/keyitems/map_liurnia_east.webp',
  'map: liurnia, north':                        '/images/keyitems/map_liurnia_north.webp',
  'map: liurnia, west':                         '/images/keyitems/map_liurnia_west.webp',
  'map: siofra river':                          '/images/keyitems/map_siofra_river.webp',

  // Notes (generic icon)
  'note: flask of wondrous physick':            '/images/keyitems/note_generic.webp',
  'note: stonedigger trolls':                   '/images/keyitems/note_generic.webp',
  'note: flame chariots':                       '/images/keyitems/note_generic.webp',
  'note: land squirts':                         '/images/keyitems/note_generic.webp',
  'note: waypoint ruins':                       '/images/keyitems/note_generic.webp',
  'note: the lord of frenzied flame':           '/images/keyitems/note_generic.webp',

  // ── Cookbooks (Fandom wiki — shared per type) ────────────────
  "nomadic warrior's cookbook":                  '/images/cookbooks/nomadic_warriors_cookbook.webp',
  "glintstone craftsman's cookbook":             '/images/cookbooks/glintstone_craftsmans_cookbook.webp',
  "missionary's cookbook":                       '/images/cookbooks/missionarys_cookbook.webp',

  // ── Multiplayer (Fandom wiki) ─────────────────────────────────
  'phantom bloody finger':                      '/images/multiplayer/phantom_bloody_finger.webp',
};

/**
 * Busca imagen fallback para un ítem por nombre.
 * Normaliza: lowercase, colapsa whitespace, strip [N] sufijos.
 */
function getFallbackImage(name: string): string {
  const normalized = name.toLowerCase().replace(/\s+/g, ' ').trim();
  // Intento exacto
  if (FALLBACK_IMAGES[normalized]) return FALLBACK_IMAGES[normalized];
  // Strip [N] suffix (cookbooks, bell bearings)
  const withoutBracket = normalized.replace(/ \[\d+\]$/, '');
  if (FALLBACK_IMAGES[withoutBracket]) return FALLBACK_IMAGES[withoutBracket];
  return '';
}

// ── Lookup de nombres de ítems por ID del juego (EquipParamGoods/Weapon) ─────
// gameIds.json mapea {id: name} — Fuente: Deskete/EldenRingResources
let _gameIds: Record<string, string> | null = null;
function getGameIds(): Record<string, string> {
  if (!_gameIds) {
    _gameIds = loadJsonFile<Record<string, string>>('gameIds.json') ?? {};
  }
  return _gameIds;
}

function weaponIdName(id: number): string | null {
  return getGameIds()[String(id)] ?? null;
}

// ── Lookup de nombres de Cenizas de Guerra (EquipParamGem) ───────────────────
// gemIds.json mapea {id: name} — Fuente: ClayAmore/ER-Save-Editor (aow_name.rs)
let _gemIds: Record<string, string> | null = null;
function getGemIds(): Record<string, string> {
  if (!_gemIds) {
    _gemIds = loadJsonFile<Record<string, string>>('gemIds.json') ?? {};
  }
  return _gemIds;
}

function gemIdName(id: number): string | null {
  return getGemIds()[String(id)] ?? null;
}

// ── Lookup de nombres de armaduras por EquipParamProtector ID ─────────────────
// armorIds.json mapea {id: name} — Fuente: ClayAmore/ER-Save-Editor armor_name.rs
// Con IDs reales de EquipParamProtector (diferentes del namespace de Deskete)
let _armorIds: Record<string, string> | null = null;
function getArmorIds(): Record<string, string> {
  if (!_armorIds) {
    _armorIds = loadJsonFile<Record<string, string>>('armorIds.json') ?? {};
  }
  return _armorIds;
}

function armorIdName(id: number): string | null {
  return getArmorIds()[String(id)] ?? null;
}

// ── Lookup de nombres de talismanes por EquipParamAccessory ID ────────────────
// talismanIds.json mapea {id: name} — Fuente: ClayAmore/ER-Save-Editor accessory_name.rs
// Los IDs de fanapis (talismans.json) son SECUENCIALES y no coinciden con el juego.
// Los IDs reales son los que se almacenan en ChrAsm2 y en el item array del .sl2.
let _talismanIds: Record<string, string> | null = null;
function getTalismanIds(): Record<string, string> {
  if (!_talismanIds) {
    _talismanIds = loadJsonFile<Record<string, string>>('talismanIds.json') ?? {};
  }
  return _talismanIds;
}

function talismanIdName(id: number): string | null {
  return getTalismanIds()[String(id)] ?? null;
}

// ── API pública ──────────────────────────────────────────────

/**
 * Escanea el slot data y devuelve el equipo y el inventario del personaje.
 *
 * @param slotData  Buffer de 0x280000 bytes del slot del personaje
 * @param level     Nivel del personaje (necesario para localizar ChrAsm2)
 */
export function scanInventory(slotData: Buffer, level?: number): InventoryScanResult {
  const quantityMap = level !== undefined ? buildQuantityMap(slotData, level) : undefined;
  const equipped = readEquippedItems(slotData, level);
  const inventory = readInventory(slotData, level, quantityMap);

  // Apply quantities to quick items (flasks show charges)
  if (quantityMap) {
    for (const item of equipped.quickItems) {
      const qty = quantityMap.get(item.rawId);
      if (qty !== undefined && qty > 1) item.quantity = qty;
    }
  }

  // Count Memory Stones (baseId 10030) in keyItems to compute total spell slots.
  // Base = 2 slots; each Memory Stone adds 1 (max 10 stones → 12 total).
  const memoryStoneCount = inventory.keyItems
    .filter(item => item.baseId === 10030)
    .reduce((sum, item) => sum + item.quantity, 0);
  equipped.memorySlotCount = 2 + memoryStoneCount;

  return { equipped, inventory };
}

// ── Lectura de ítems equipados ───────────────────────────────

function readEquippedItems(buf: Buffer, level?: number): EquippedItems {
  if (level !== undefined) {
    const result = tryReadEquippedItemsViaChrAsm2(buf, level);
    if (result) return result;
  }
  return emptyEquippedItems();
}

/**
 * Lee los ítems equipados usando la estructura ChrAsm2, cuyo offset se calcula
 * como vigor_offset + 0x310. Requiere conocer el nivel del personaje para
 * localizar el vigor_offset mediante búsqueda de patrón en el slot data.
 *
 * Retorna null si no se puede localizar el vigor (nivel incorrecto o slot vacío).
 */
function tryReadEquippedItemsViaChrAsm2(buf: Buffer, level: number): EquippedItems | null {
  const statsResult = findStats(buf, level);
  if (!statsResult) return null;

  const vigorOff   = statsResult.foundAtOffset;
  const chrAsm2Off = vigorOff + 0x310;

  if (chrAsm2Off + 0x58 > buf.length) return null;

  // ga_items comienzan en slotData+0x30 (SaveSlot header = 0x10 checksum + 0x20)
  // y terminan antes de PlayerGameData. Límite de búsqueda = vigorOff - 0x34.
  const gaItemsSearchLimit = vigorOff - 0x34;

  const readHandle = (rel: number): number =>
    buf.readUInt32LE(chrAsm2Off + rel);

  // Lectura intercalada: LH[0], RH[0], LH[1], RH[1], LH[2], RH[2]
  const lhHandles = [readHandle(0x00), readHandle(0x08), readHandle(0x10)];
  const rhHandles = [readHandle(0x04), readHandle(0x0C), readHandle(0x14)];

  // Los slots de armadura empiezan en +0x38 (no +0x30).
  // Los offsets +0x30/+0x34 son campos desconocidos (siempre 0x00000000).
  // Verificado con save file real: head=+0x38, chest=+0x3C, arms=+0x40, legs=+0x44.
  const headHandle  = readHandle(0x38);
  const chestHandle = readHandle(0x3C);
  const armsHandle  = readHandle(0x40);
  const legsHandle  = readHandle(0x44);

  // Talismanes en +0x4C..+0x58 (4 slots × 4 bytes)
  // Los offsets +0x44..+0x50 contienen armadura/unk, no talismanes.
  const talismanHandles = [
    readHandle(0x4C), readHandle(0x50), readHandle(0x54), readHandle(0x58),
  ];

  // Quick items, pouch, great rune, physick tears y spell slots
  const { quickItems, pouch, greatRune, physickTears, spellSlots } = readQuickSlotsAndGreatRune(buf, vigorOff, chrAsm2Off);

  return {
    rightHand: rhHandles.map(h =>
      resolveWeaponHandle(h, buf, gaItemsSearchLimit),
    ) as [EquippedWeapon, EquippedWeapon, EquippedWeapon],
    leftHand: lhHandles.map(h =>
      resolveWeaponHandle(h, buf, gaItemsSearchLimit),
    ) as [EquippedWeapon, EquippedWeapon, EquippedWeapon],
    head:  resolveArmorHandle(headHandle,  buf, gaItemsSearchLimit),
    chest: resolveArmorHandle(chestHandle, buf, gaItemsSearchLimit),
    hands: resolveArmorHandle(armsHandle,  buf, gaItemsSearchLimit),
    legs:  resolveArmorHandle(legsHandle,  buf, gaItemsSearchLimit),
    talismans: talismanHandles.map(h =>
      resolveTalismanHandle(h),
    ) as [EquippedWeapon, EquippedWeapon, EquippedWeapon, EquippedWeapon],
    quickItems,
    pouch,
    greatRune,
    physickTears,
    spellSlots,
    memorySlotCount: 2, // Updated by scanInventory with Memory Stone count
  };
}

/** Slot vacío estándar */
function emptySlot(): EquippedWeapon {
  return { rawId: 0xFFFFFFFF, baseId: 0, name: null, image: '' };
}

function emptyEquippedItems(): EquippedItems {
  return {
    rightHand: [emptySlot(), emptySlot(), emptySlot()],
    leftHand:  [emptySlot(), emptySlot(), emptySlot()],
    head:      emptySlot(),
    chest:     emptySlot(),
    hands:     emptySlot(),
    legs:      emptySlot(),
    talismans: [emptySlot(), emptySlot(), emptySlot(), emptySlot()],
    quickItems: [],
    pouch: [],
    greatRune: null,
    physickTears: [],
    spellSlots: [],
    memorySlotCount: 2,
  };
}

// ── Quick Items, Pouch y Great Rune desde EquippedItems struct ──────────

/**
 * Busca el struct EquippedItems en el slot data y lee quick items (10),
 * pouch (6) y la Great Rune equipada.
 *
 * EquippedItems es la 4ª copia de datos de equipo en el SaveSlot. Se encuentra
 * DESPUÉS de EquipInventoryData (ga_items) + EquipMagicData + EquipItemData +
 * gesture data + EquipProjectileData. Usa IDs de inventario con nibble de categoría:
 *   0x0xxxxxxx = weapon, 0x1xxxxxxx = armor, 0x2xxxxxxx = talisman, 0x4xxxxxxx = goods
 *
 * Layout (verificado con save real + ClayAmore/ER-Save-Editor):
 *   +0x00..+0x14: 6 weapons (LH/RH interleaved, item IDs)
 *   +0x18..+0x24: arrows/bolts
 *   +0x28..+0x2C: unknown
 *   +0x30..+0x3C: head, chest, arms, legs (0x10xxxxxx)
 *   +0x40: unknown
 *   +0x44..+0x50: talismans (0x20xxxxxx)
 *   +0x54: great rune / covenant (0x40xxxxxx o 0xFFFFFFFF = vacío)
 *   +0x58..+0x7C: quickitems[10] (0x40xxxxxx goods IDs)
 *   +0x80..+0x94: pouch[6] (0x40xxxxxx goods IDs)
 *   +0x98..+0xA8: physick crystal tears (0x40xxxxxx goods IDs, up to 5 slots)
 */
function readQuickSlotsAndGreatRune(
  buf: Buffer,
  vigorOff: number,
  chrAsm2Off: number,
): { quickItems: QuickSlotItem[]; pouch: QuickSlotItem[]; greatRune: QuickSlotItem | null; physickTears: QuickSlotItem[]; spellSlots: QuickSlotItem[] } {
  const empty = { quickItems: [] as QuickSlotItem[], pouch: [] as QuickSlotItem[], greatRune: null, physickTears: [] as QuickSlotItem[], spellSlots: [] as QuickSlotItem[] };

  const structOff = findEquippedItemsStruct(buf, vigorOff, chrAsm2Off);
  if (structOff === null) return empty;

  const quickItems: QuickSlotItem[] = [];
  for (let i = 0; i < 10; i++) {
    quickItems.push(resolveInventorySlotItem(buf.readUInt32LE(structOff + 0x58 + i * 4)));
  }

  const pouch: QuickSlotItem[] = [];
  for (let i = 0; i < 6; i++) {
    pouch.push(resolveInventorySlotItem(buf.readUInt32LE(structOff + 0x80 + i * 4)));
  }

  const grRaw = buf.readUInt32LE(structOff + 0x54);
  const greatRune = (grRaw === 0xFFFFFFFF || grRaw === 0) ? null : resolveInventorySlotItem(grRaw);

  // Flask of Wondrous Physick crystal tears: up to 5 uint32 at +0x98
  const physickTears: QuickSlotItem[] = [];
  for (let i = 0; i < 5; i++) {
    const raw = buf.readUInt32LE(structOff + 0x98 + i * 4);
    if (raw === 0xFFFFFFFF || raw === 0) continue;
    const resolved = resolveInventorySlotItem(raw);
    if (resolved.name) physickTears.push(resolved);
  }

  // EquipMagicData (spell/memory slots): 14 entries × 8 bytes each,
  // located right after EquipInventoryData (ga_items).
  // Each entry: [spell_id: u32, unk: u32]. spell_id is a raw goods ID (no nibble).
  const gaItemsStart = chrAsm2Off + 0x64;
  const equipMagicOff = gaItemsStart + 0x9000 + 0x08; // +8 for header
  const spellSlots: QuickSlotItem[] = [];
  for (let i = 0; i < 14; i++) {
    const off = equipMagicOff + i * 8; // 8 bytes per entry
    if (off + 4 > buf.length) break;
    const rawSpellId = buf.readUInt32LE(off);
    if (rawSpellId === 0xFFFFFFFF || rawSpellId === 0) continue;
    // EquipMagicData stores raw goods IDs (no 0x40 nibble prefix)
    const withNibble = 0x40000000 | rawSpellId;
    const resolved = resolveInventorySlotItem(withNibble);
    if (resolved.name) spellSlots.push(resolved);
  }

  return { quickItems, pouch, greatRune, physickTears, spellSlots };
}

/**
 * Busca el EquippedItems struct en el slot data.
 *
 * Estrategia: escanear desde después del EquipInventoryData (ga_items end)
 * hasta +0x4000 bytes más adelante. Validar con 3 checks:
 *   1. +0x30 debe ser armor (nibble 0x1) o vacío (0xFFFFFFFF)
 *   2. +0x44 debe ser talisman (nibble 0x2) o vacío (0xFFFFFFFF)
 *   3. +0x00 debe ser un weapon ID válido, Unarmed (110000), o vacío (0xFFFFFFFF)
 */
function findEquippedItemsStruct(buf: Buffer, vigorOff: number, chrAsm2Off: number): number | null {
  // ga_items: starts at ChrAsm2+0x64, count at ChrAsm2+0x60
  // EquipInventoryData = 0xa80 common × 12 + 0x180 key × 12 = 0x9000 bytes
  const gaItemsStart = chrAsm2Off + 0x64;
  const searchStart = gaItemsStart + 0x9000; // After EquipInventoryData
  const searchEnd = Math.min(searchStart + 0x4000, buf.length - 0xA0);

  for (let off = searchStart; off < searchEnd; off += 4) {
    // Check 1: +0x30 = armor (high nibble 0x1) or empty
    const armorVal = buf.readUInt32LE(off + 0x30);
    if (armorVal !== 0xFFFFFFFF && ((armorVal >>> 28) & 0xF) !== 1) continue;

    // Check 2: +0x44 = talisman (high nibble 0x2) or empty
    const talismanVal = buf.readUInt32LE(off + 0x44);
    if (talismanVal !== 0xFFFFFFFF && ((talismanVal >>> 28) & 0xF) !== 2) continue;

    // Check 3: +0x00 = weapon ID, Unarmed, or empty
    const lh0 = buf.readUInt32LE(off);
    const weaponOk = lh0 === 0xFFFFFFFF || lh0 === 110000 ||
      (lh0 >= 1000000 && lh0 < 50000000);
    if (!weaponOk) continue;

    // Check 4: +0x34 also armor or empty (second armor slot)
    const armorVal2 = buf.readUInt32LE(off + 0x34);
    if (armorVal2 !== 0xFFFFFFFF && ((armorVal2 >>> 28) & 0xF) !== 1) continue;

    return off;
  }

  return null;
}

/**
 * Resuelve un item de inventario (con nibble de categoría) a QuickSlotItem.
 * Formato: 0x0xxxxxxx=weapon, 0x1xxxxxxx=armor, 0x2xxxxxxx=talisman, 0x4xxxxxxx=goods
 */
function resolveInventorySlotItem(rawId: number): QuickSlotItem {
  if (rawId === 0xFFFFFFFF || rawId === 0) {
    return { rawId, baseId: 0, name: null };
  }

  const nibble = (rawId >>> 28) & 0xF;
  const baseId = rawId & 0x0FFFFFFF;

  switch (nibble) {
    case 0x0: { // Weapon
      const name = weaponIdName(baseId);
      const image = name ? resolveWeaponImage(baseId) : '';
      return { rawId, baseId, name, image };
    }
    case 0x1: { // Armor
      const name = armorIdName(baseId);
      const image = name ? resolveArmorImage(name) : '';
      return { rawId, baseId, name, image };
    }
    case 0x2: { // Talisman
      const name = talismanIdName(baseId);
      const image = name ? resolveTalismanImage(name) : '';
      return { rawId, baseId, name, image };
    }
    case 0x4: { // Goods (consumables, flasks, spells, spirits, etc.)
      const name = getGameIds()[String(baseId)] ?? null;
      const image = name ? resolveGoodsImage(baseId, name) : '';
      return { rawId, baseId, name, image };
    }
    default: {
      const name = getGameIds()[String(baseId)] ?? null;
      return { rawId, baseId, name };
    }
  }
}

// ── Helper: resolver imagen de arma ──────────────────────────

/**
 * Busca la imagen de un arma en weapons.json usando el baseId (con o sin infusión).
 *
 * weapons.json (fanapis) solo tiene armas base (sin variantes de infusión).
 * Para obtener la imagen de "Heavy Uchigatana" hay que buscar "Uchigatana":
 *   - Infusion offset = baseId % 10000 (rango 0–1200 según tipo de infusión)
 *   - Base weapon ID  = Math.floor(baseId / 10000) * 10000
 *
 * Ejemplo: baseId=9000200 (Keen Uchigatana) → base=9000000 → "Uchigatana" → imagen OK
 */
function resolveWeaponImage(baseId: number): string {
  const store = ItemStore.getInstance();

  // 1. Intentar con el nombre exacto (p.ej. arma sin infusión)
  const exactName = weaponIdName(baseId);
  if (exactName) {
    const img = store.getWeaponByName(exactName)?.image
             ?? store.getShieldByName(exactName)?.image;
    if (img) return img;
  }

  // 2. Intentar con el arma base (sin infusión): floor(baseId / 10000) * 10000
  const baseWeaponId = Math.floor(baseId / 10000) * 10000;
  if (baseWeaponId !== baseId) {
    const baseName = weaponIdName(baseWeaponId);
    if (baseName) {
      const img = store.getWeaponByName(baseName)?.image
               ?? store.getShieldByName(baseName)?.image;
      if (img) return img;
    }
  }

  return '';
}

function resolveArmorImage(name: string): string {
  const store = ItemStore.getInstance();
  return store.getArmorByName(name)?.image ?? getFallbackImage(name);
}

function resolveTalismanImage(name: string): string {
  const store = ItemStore.getInstance();
  return store.getTalismanByName(name)?.image ?? getFallbackImage(name);
}

/**
 * Resuelve imagen para goods (consumables, spirits, spells, etc.).
 * Busca en varias colecciones del store por nombre.
 * Quita sufijo de nivel (+N) para matchear contra el store.
 */
function resolveGoodsImage(baseId: number, name: string): string {
  const store = ItemStore.getInstance();
  const baseName = name.replace(/ \+\d+$/, '');

  // Spirits (200000-299000)
  if (baseId >= 200000 && baseId < 300000) {
    return store.getSpiritByName(baseName)?.image ?? getFallbackImage(baseName);
  }

  // Spells
  if (getSpellNameSet().has(norm(baseName))) {
    return store.getSpellByName(baseName)?.image ?? getFallbackImage(baseName);
  }

  // Consumables, flasks, key items, multiplayer items, etc.
  return store.getConsumableByName(baseName)?.image ?? getFallbackImage(baseName);
}

// ── Decodificación de gaitem_handles ────────────────────────

/**
 * High byte del gaitem_handle indica el tipo de ítem:
 *   0x80 → arma, 0x90 → armadura, 0xA0 → talismán/accesorio
 */
function handleHighByte(handle: number): number {
  return (handle >>> 24) & 0xFF;
}

function isEmptyHandle(handle: number): boolean {
  return handle === 0 || handle === 0xFFFFFFFF;
}

/**
 * Busca la ceniza de guerra (gem) equipada en un arma.
 *
 * Estructura de ga_items: cada entrada de arma tiene un gem_gaitem_handle en offset +0x14
 * desde el inicio de la entrada. Este handle referencia la ceniza equipada.
 *
 * Flujo: weapon_handle → buscar en ga_items → leer +0x14 → gem_gaitem_handle
 *        → buscar ESE handle en ga_items → gem_item_id → gemIds.json → ashes.json → skill
 */
function findGemSkillForWeapon(
  buf: Buffer,
  weaponHandle: number,
  searchLimit: number,
): string | null {
  const GA_ITEMS_START = 0x30;
  const limit = Math.min(searchLimit, buf.length) - 0x20;

  // Find the weapon handle in ga_items to get its entry offset
  for (let off = GA_ITEMS_START; off <= limit; off++) {
    if (buf.readUInt32LE(off) !== weaponHandle) continue;

    // Found the weapon entry. The gem gaitem_handle is at +0x14 from entry start.
    const gemHandle = buf.readUInt32LE(off + 0x14);
    if (gemHandle === 0 || gemHandle === 0xFFFFFFFF) return null;

    // Gem handles have high byte 0xC0
    if (((gemHandle >>> 24) & 0xFF) !== 0xC0) return null;

    // Look up the gem handle in ga_items to get the gem item_id
    const gemItemId = findGaItemId(buf, gemHandle, searchLimit);
    if (gemItemId === undefined) return null;

    // gemItemId is an EquipParamGem ID — look up in gemIds.json
    const gemName = gemIdName(gemItemId);
    if (!gemName) return null;

    // Look up in ashes.json for the skill name
    const store = ItemStore.getInstance();
    const ashData = store.getAshByName(gemName);
    return ashData?.skill ?? gemName.replace(/^Ash of War:\s*/i, '');
  }

  return null;
}

/**
 * Resuelve un gaitem_handle de arma (high byte 0x80):
 *   1. Busca el handle en la tabla ga_items del slot para obtener el item_id
 *   2. item_id codifica: base_id (con infusión) = Math.floor(id/100)*100, upgrade = id%100
 *   3. base_id se usa para buscar el nombre en gameIds.json (IDs reales de EquipParamWeapon)
 */
function resolveWeaponHandle(
  handle: number,
  buf: Buffer,
  searchLimit: number,
): EquippedWeapon {
  if (isEmptyHandle(handle)) return { rawId: handle, baseId: 0, name: null, image: '' };
  if (handleHighByte(handle) !== 0x80) return { rawId: handle, baseId: 0, name: null, image: '' };

  const itemId = findGaItemId(buf, handle, searchLimit);
  if (itemId === undefined) return { rawId: handle, baseId: 0, name: null, image: '' };

  const baseId       = Math.floor(itemId / 100) * 100;

  // Unarmed (110000) es un estado, no un arma real — tratar como vacío
  if (baseId === 110000) return { rawId: handle, baseId: 0, name: null, image: '' };

  const upgradeLevel = itemId % 100;

  // Buscar nombre usando los IDs reales del juego (EquipParamWeapon)
  const store = ItemStore.getInstance();
  const baseName = weaponIdName(baseId) ?? store.getWeaponByBaseId(baseId)?.name ?? null;
  const name = baseName !== null && upgradeLevel > 0
    ? `${baseName} +${upgradeLevel}`
    : baseName;

  const image = resolveWeaponImage(baseId);

  // Enriquecer con stats del arma (damage, scaling, weight)
  const baseWeaponId = Math.floor(baseId / 10000) * 10000;
  const weaponData = (baseName ? store.getWeaponByName(baseName) : undefined)
    ?? store.getWeaponByBaseId(baseId)
    ?? store.getWeaponByBaseId(baseWeaponId);

  // Check if this is actually a shield (not in weapons.json)
  const shieldData = !weaponData ? store.getShieldByName(baseName ?? '') : undefined;

  // Try to resolve the Ash of War skill from the gem gaitem_handle
  const skillName = findGemSkillForWeapon(buf, handle, searchLimit);

  return {
    rawId: handle,
    baseId,
    name,
    upgradeLevel,
    image,
    infusion:  decodeInfusion(baseId),
    damage:    weaponData?.damage,
    scaling:   weaponData?.scaling,
    weight:    weaponData?.weight ?? shieldData?.weight,
    stability: shieldData?.stability,
    skill:     skillName ?? undefined,
  };
}

/**
 * Resuelve un gaitem_handle de armadura (high byte 0x90):
 *   1. Busca el handle en la tabla ga_items del slot para obtener item_id
 *   2. armor_id = item_id ^ 0x10000000 (EquipParamProtector ID)
 *   3. armor_id se busca en gameIds.json
 */
function resolveArmorHandle(
  handle: number,
  buf: Buffer,
  searchLimit: number,
): EquippedWeapon {
  if (isEmptyHandle(handle)) return { rawId: handle, baseId: 0, name: null, image: '' };
  if (handleHighByte(handle) !== 0x90) return { rawId: handle, baseId: 0, name: null, image: '' };

  const itemId = findGaItemId(buf, handle, searchLimit);
  if (itemId === undefined) return { rawId: handle, baseId: 0, name: null, image: '' };

  const baseId = itemId ^ 0x10000000;
  // Usar armorIds.json (EquipParamProtector IDs reales) — NO gameIds.json (namespace diferente)
  const store = ItemStore.getInstance();
  const name = armorIdName(baseId) ?? store.getArmorByBaseId(baseId)?.name ?? null;
  const armorData = name ? store.getArmorByName(name) : undefined;
  const image = armorData?.image ?? '';
  return {
    rawId: handle,
    baseId,
    name,
    image,
    defense:    armorData?.defense,
    weight:     armorData?.weight,
    poise:      armorData?.poise,
    immunity:   armorData?.immunity,
    robustness: armorData?.robustness,
    focus:      armorData?.focus,
    vitality:   armorData?.vitality,
  };
}

/**
 * Resuelve un gaitem_handle de talismán (high byte 0xA0):
 *   talisman_id = handle ^ 0xA0000000 (EquipParamAccessory ID real, sin ga_items lookup)
 *
 * Los IDs de fanapis (talismans.json) son SECUENCIALES y NO coinciden con EquipParamAccessory.
 * Usar talismanIds.json (ClayAmore/ER-Save-Editor) que tiene los IDs reales del juego.
 * Las imágenes y efectos se resuelven por nombre desde talismans.json (fanapis).
 */
function resolveTalismanHandle(handle: number): EquippedWeapon {
  if (isEmptyHandle(handle)) return { rawId: handle, baseId: 0, name: null, image: '' };
  if (handleHighByte(handle) !== 0xA0) return { rawId: handle, baseId: 0, name: null, image: '' };

  const baseId = handle ^ 0xA0000000;
  const store  = ItemStore.getInstance();

  // 1. talismanIds.json tiene los EquipParamAccessory IDs reales del juego
  const name = talismanIdName(baseId) ?? null;

  // 2. Buscar imagen y efecto por nombre en talismans.json (fanapis)
  const talData = name ? store.getTalismanByName(name) : undefined;
  const image  = talData?.image ?? '';
  const effect = talData?.effect;
  return { rawId: handle, baseId, name, image, effect };
}

/**
 * Busca un gaitem_handle en la sección ga_items del slot data y devuelve
 * el item_id inmediatamente siguiente (offset+4).
 *
 * ga_items empieza en slotData[0x30]:
 *   slotData[0x00..0x0F] = MD5 checksum (PCSaveSlot)
 *   slotData[0x10..0x2F] = SaveSlot header (ver + map_id + _0x18)
 *   slotData[0x30..]     = ga_items array
 *
 * Cada entrada de ga_items: [gaitem_handle: u32, item_id: u32, ...]
 * El tamaño de cada entrada es variable, pero el handle y el item_id
 * son siempre los primeros 8 bytes. Buscamos el handle alineado a 4 bytes.
 */
/**
 * Busca un gaitem_handle en la sección ga_items del slot data y devuelve
 * el item_id inmediatamente siguiente (offset+4).
 *
 * ga_items empieza en slotData[0x30]:
 *   slotData[0x00..0x0F] = MD5 checksum (PCSaveSlot)
 *   slotData[0x10..0x2F] = SaveSlot header (ver + map_id + _0x18)
 *   slotData[0x30..]     = ga_items array
 *
 * Las entradas de ga_items tienen tamaño variable (depende del tipo de ítem),
 * por lo que buscamos el handle escaneando byte a byte en lugar de cada 4 bytes.
 */
function findGaItemId(buf: Buffer, handle: number, searchLimit: number): number | undefined {
  const GA_ITEMS_START = 0x30;
  const limit = Math.min(searchLimit, buf.length) - 8;

  for (let off = GA_ITEMS_START; off <= limit; off++) {
    if (buf.readUInt32LE(off) === handle) {
      return buf.readUInt32LE(off + 4);
    }
  }
  return undefined;
}

// ── Upgrade levels desde ga_items ────────────────────────────

/**
 * Escanea la sección ga_items buscando todos los handles de arma (0x80xxxxxx).
 * Para cada uno lee el item_id y extrae upgradeLevel = itemId % 100.
 * Retorna un Map<baseWeaponId, upgradeLevel[]> para cruzar con el inventario.
 */
function scanWeaponUpgradeLevels(buf: Buffer, level?: number): Map<number, number[]> {
  const map = new Map<number, number[]>();
  if (level === undefined) return map;

  const statsResult = findStats(buf, level);
  if (!statsResult) return map;

  const vigorOff = statsResult.foundAtOffset;
  const searchLimit = vigorOff - 0x34;
  const GA_ITEMS_START = 0x30;
  const limit = Math.min(searchLimit, buf.length) - 8;

  for (let off = GA_ITEMS_START; off <= limit; off++) {
    const val = buf.readUInt32LE(off);
    if (((val >>> 24) & 0xFF) === 0x80) {
      const itemId = buf.readUInt32LE(off + 4);
      if (itemId > 0 && itemId < 0x10000000) {
        const baseId = Math.floor(itemId / 100) * 100;
        const upgradeLevel = itemId % 100;
        if (upgradeLevel > 0 && upgradeLevel <= 25) {
          const list = map.get(baseId) ?? [];
          list.push(upgradeLevel);
          map.set(baseId, list);
        }
      }
    }
  }

  return map;
}

// ── Mapa de cantidades reales ────────────────────────────────

/**
 * Construye un Map<inventoryItemId, quantity> a partir de inventory_held.
 * Incluye aliases para flasks: las variantes con upgrade (+1..+12) también
 * apuntan al ID base para que el inventario compacto las encuentre.
 */
function buildQuantityMap(buf: Buffer, level: number): Map<number, number> | undefined {
  const statsResult = findStats(buf, level);
  if (!statsResult) return undefined;

  const vigorOff = statsResult.foundAtOffset;
  const gaItemsSearchLimit = vigorOff - 0x34;
  const quantityMap = readInventoryHeld(buf, vigorOff, gaItemsSearchLimit);

  // Flask aliases: the compact inventory stores the base flask ID (1001/1051)
  // but inventory_held stores the upgraded variant (e.g. 1013 = Crimson +6).
  // Add aliases so both the quick item (exact ID) and inventory (base ID) match.
  for (const [id, qty] of [...quantityMap.entries()]) {
    if (((id >>> 28) & 0xF) !== 4) continue; // only goods
    const baseId = id & 0x0FFFFFFF;
    if (baseId > 1001 && baseId <= 1013) {
      quantityMap.set(0x40000000 | 1001, qty);  // Crimson Tears base
    } else if (baseId > 1051 && baseId <= 1063) {
      quantityMap.set(0x40000000 | 1051, qty);  // Cerulean Tears base
    }
  }

  return quantityMap;
}

// ── Lectura de cantidades reales (inventory_held) ───────────

/**
 * Lee la sección inventory_held y construye un Map<inventoryItemId, quantity>.
 *
 * inventory_held almacena entradas de 12 bytes: [gaitem_handle, quantity, acquisition_index].
 * Se divide en common_items (2688 slots) y key_items (384 slots), cada sección
 * precedida por un u32 count.
 *
 * Fuente: ClayAmore/ER-Save-Lib (Rust) — InventoryHeld struct.
 */
function readInventoryHeld(
  buf: Buffer,
  vigorOff: number,
  gaItemsSearchLimit: number,
): Map<number, number> {
  const quantityMap = new Map<number, number>();

  const heldStart = vigorOff + INVENTORY_HELD.VIGOR_TO_HELD_OFFSET;
  if (heldStart + 4 > buf.length) return quantityMap;

  // Common items section
  const commonCount = buf.readUInt32LE(heldStart);
  const commonDataStart = heldStart + 4;

  readHeldEntries(buf, commonDataStart, commonCount, gaItemsSearchLimit, quantityMap);

  // Skip past all common item slots (fixed capacity) to reach key items
  const keyStart = commonDataStart + INVENTORY_HELD.COMMON_CAPACITY * INVENTORY_HELD.ENTRY_SIZE;
  if (keyStart + 4 > buf.length) return quantityMap;

  // Key items section
  const keyCount = buf.readUInt32LE(keyStart);
  readHeldEntries(buf, keyStart + 4, keyCount, gaItemsSearchLimit, quantityMap);

  return quantityMap;
}

function readHeldEntries(
  buf: Buffer,
  startOffset: number,
  count: number,
  gaItemsSearchLimit: number,
  quantityMap: Map<number, number>,
): void {
  for (let i = 0; i < count; i++) {
    const off = startOffset + i * INVENTORY_HELD.ENTRY_SIZE;
    if (off + 12 > buf.length) break;

    const gaitemHandle = buf.readUInt32LE(off);
    const quantity = buf.readUInt32LE(off + 4);

    if (gaitemHandle === 0 || quantity === 0) continue;

    const inventoryId = resolveGaitemToInventoryId(buf, gaitemHandle, gaItemsSearchLimit);
    if (inventoryId !== undefined) {
      quantityMap.set(inventoryId, (quantityMap.get(inventoryId) ?? 0) + quantity);
    }
  }
}

/**
 * Convierte un gaitem_handle (prefijo 0x8/0x9/0xA/0xB/0xC) al inventory item ID
 * que usa la sección compacta del inventario (nibble 0x0/0x1/0x2/0x4/0x8).
 *
 * Para items (0xB) y accessories (0xA) el item_id se extrae directamente del handle.
 * Para weapons (0x8), armor (0x9) y AoW (0xC) se necesita buscar en ga_items.
 */
function resolveGaitemToInventoryId(
  buf: Buffer,
  gaitemHandle: number,
  gaItemsSearchLimit: number,
): number | undefined {
  const type = (gaitemHandle >>> 28) & 0xF;

  switch (type) {
    case 0xB: { // Item/goods → inventory nibble 0x4
      const baseId = gaitemHandle & 0x0FFFFFFF;
      return 0x40000000 | baseId;
    }
    case 0xA: { // Accessory/talisman → inventory nibble 0x2
      const baseId = gaitemHandle & 0x0FFFFFFF;
      return 0x20000000 | baseId;
    }
    case 0x8: { // Weapon → inventory nibble 0x0, needs ga_items lookup
      const itemId = findGaItemId(buf, gaitemHandle, gaItemsSearchLimit);
      if (itemId === undefined) return undefined;
      // Weapons in the compact inventory use the base ID (floor to 100) with nibble 0x0
      const baseId = Math.floor(itemId / 100) * 100;
      return baseId; // weapon nibble = 0x0
    }
    case 0x9: { // Armor → inventory nibble 0x1
      const itemId = findGaItemId(buf, gaitemHandle, gaItemsSearchLimit);
      if (itemId === undefined) return undefined;
      // Armor item_id in ga_items has 0x10000000 prefix; compact inventory also uses 0x1 nibble
      // but with the EquipParamProtector ID (= item_id ^ 0x10000000)
      const armorId = itemId ^ 0x10000000;
      return 0x10000000 | armorId;
    }
    case 0xC: { // Ash of War → inventory nibble 0x8
      const itemId = findGaItemId(buf, gaitemHandle, gaItemsSearchLimit);
      if (itemId === undefined) return undefined;
      return 0x80000000 | (itemId & 0x0FFFFFFF);
    }
    default:
      return undefined;
  }
}

// ── Lectura del inventario completo ─────────────────────────

function readInventory(buf: Buffer, _level?: number, quantityMap?: Map<number, number>): Inventory {
  const rawItems = scanItemArray(buf);
  const store = ItemStore.getInstance();
  const weaponUpgrades = scanWeaponUpgradeLevels(buf, _level);

  // Aplicar cantidades reales desde inventory_held
  if (quantityMap) {
    for (const item of rawItems) {
      const qty = quantityMap.get(item.itemId);
      if (qty !== undefined && qty > 0) {
        item.quantity = qty;
      }
    }
  }

  const weapons:      ResolvedInventoryItem[] = [];
  const ammos:        ResolvedInventoryItem[] = [];
  const armors:       ResolvedInventoryItem[] = [];
  const talismans:    ResolvedInventoryItem[] = [];
  const spells:       ResolvedInventoryItem[] = [];
  const spirits:      ResolvedInventoryItem[] = [];
  const ashesOfWar:   ResolvedInventoryItem[] = [];
  const consumables:  ResolvedInventoryItem[] = [];
  const materials:    ResolvedInventoryItem[] = [];
  const upgrades:     ResolvedInventoryItem[] = [];
  const crystalTears: ResolvedInventoryItem[] = [];
  const keyItems:     ResolvedInventoryItem[] = [];
  const cookbooks:    ResolvedInventoryItem[] = [];
  const multiplayer:  ResolvedInventoryItem[] = [];
  const other:        RawInventoryItem[] = [];

  for (const item of rawItems) {
    switch (item.category) {
      case 'weapon': {
        // Flechas y ballestas: nibble 0x0 pero base ID >= 50M
        if (item.baseId >= AMMO_BASE_ID_MIN) {
          const name = weaponIdName(item.baseId);
          if (!name) { other.push(item); break; }
          ammos.push({ ...item, name, image: getFallbackImage(name) });
          break;
        }
        // El inventario almacena el ID base directamente (sin nivel de mejora).
        // Los upgrade levels se cruzan con la sección ga_items.
        const baseName = weaponIdName(item.baseId) ?? store.getWeaponByBaseId(item.baseId)?.name;
        if (!baseName) { other.push(item); break; }
        // Excluir entradas que son armaduras duplicadas (IDs 1M-3M en gameIds)
        // Solo IDs >= 3M son armas reales; menores son EquipParamProtector duplicados
        if (item.baseId > 0 && item.baseId < 3_000_000 && item.baseId >= 1_000_000) {
          // Estas son armaduras almacenadas bajo nibble 0x0 — ya están en armors
          other.push(item); break;
        }
        // Filtrar placeholder "Unarmed" (baseId 110000) — no es un arma real
        if (item.baseId === 110000) { other.push(item); break; }
        // Upgrade level desde ga_items (pop para manejar duplicados)
        const upgrades = weaponUpgrades.get(item.baseId);
        const upgradeLevel = upgrades?.shift();
        const name = upgradeLevel ? `${baseName} +${upgradeLevel}` : baseName;
        const image = resolveWeaponImage(item.baseId);
        // Enriquecer con stats (weapon o shield según donde se encuentre)
        const baseWeaponId = Math.floor(item.baseId / 10000) * 10000;
        const wData = store.getWeaponByName(baseName)
          ?? store.getWeaponByBaseId(item.baseId)
          ?? store.getWeaponByBaseId(baseWeaponId);
        const shData = !wData ? store.getShieldByName(baseName) : undefined;
        weapons.push({
          ...item, name, image,
          upgradeLevel,
          itemType:  wData?.type ?? shData?.category,
          damage:    wData?.damage,
          scaling:   wData?.scaling,
          weight:    wData?.weight ?? shData?.weight,
          stability: shData?.stability,
        });
        break;
      }
      case 'armor': {
        // Filtrar placeholders de armadura: Head/Body/Arms/Legs (IDs 10000-10300)
        if (item.baseId >= 10000 && item.baseId <= 10300) { other.push(item); break; }
        const armorName = armorIdName(item.baseId) ?? store.getArmorByBaseId(item.baseId)?.name;
        if (!armorName) { other.push(item); break; }
        const a = store.getArmorByName(armorName);
        armors.push({
          ...item, name: armorName, image: a?.image || getFallbackImage(armorName),
          itemType: a?.type,
          defense:  a?.defense,
          weight:   a?.weight,
        });
        break;
      }
      case 'talisman': {
        // talismanIds.json tiene los IDs reales (EquipParamAccessory).
        // talismans.json (fanapis) tiene imágenes y efectos, buscados por nombre.
        const name = talismanIdName(item.baseId) ?? null;
        if (!name) { other.push(item); break; }
        const talData = store.getTalismanByName(name);
        const image   = talData?.image || getFallbackImage(name);
        const effect  = talData?.effect;
        talismans.push({ ...item, name, image, effect });
        break;
      }
      case 'consumable': {
        const name = weaponIdName(item.baseId);
        if (!name) { other.push(item); break; }
        // Subcategorizar por nombre y rango de base ID
        const subcat = classifyConsumable(item.baseId, name);

        // Resolver imagen y datos extra según subcategoría
        let consumableImage = '';
        let extra: Partial<ResolvedInventoryItem> = {};

        if (subcat === 'spell') {
          const spData = store.getSpellByName(name);
          consumableImage = spData?.image || getFallbackImage(name);
          extra = { itemType: spData?.type };
        } else if (subcat === 'spirit') {
          const spData = store.getSpiritByName(name)
            ?? store.getSpiritByName(name + ' Ashes');
          consumableImage = spData?.image || getFallbackImage(name);
          extra = { fpCost: spData?.fpCost, hpCost: spData?.hpCost, effect: spData?.effect };
        } else {
          const cData = store.getConsumableByName(name);
          consumableImage = cData?.image || getFallbackImage(name);
          extra = { itemType: cData?.type, effect: cData?.effect };
        }

        const resolved: ResolvedInventoryItem = { ...item, category: subcat, name, image: consumableImage, ...extra };

        switch (subcat) {
          case 'spell':        spells.push(resolved);      break;
          case 'spirit':       spirits.push(resolved);     break;
          case 'cookbook':     cookbooks.push(resolved);   break;
          case 'crystal_tear': crystalTears.push(resolved); break;
          case 'upgrade':      upgrades.push(resolved);    break;
          case 'material':     materials.push(resolved);   break;
          case 'key_item':     keyItems.push(resolved);    break;
          case 'multiplayer':  multiplayer.push(resolved); break;
          case 'gesture':      /* gestos — omitir del inventario */ break;
          default:             consumables.push(resolved); break;
        }
        break;
      }
      case 'ash_of_war': {
        // EquipParamGem IDs — gemIds.json (fuente: ER-Save-Editor aow_name.rs)
        const name = gemIdName(item.baseId);
        if (!name) { other.push(item); break; }
        const ashData = store.getAshByName(name);
        const ashImage = ashData?.image ?? '';
        ashesOfWar.push({
          ...item, name, image: ashImage,
          affinity: ashData?.affinity,
          skill:    ashData?.skill,
        });
        break;
      }
      default:
        other.push(item);
    }
  }

  return {
    weapons, ammos, armors, talismans, spells,
    spirits, ashesOfWar, consumables, materials, upgrades,
    crystalTears, keyItems, cookbooks, multiplayer, other,
  };
}

/**
 * Busca el array de ítems del inventario en el slot data.
 *
 * Estrategia: buscar el ancla (Tarnished Wizened Finger, ID 0x4003D) en
 * la ventana de búsqueda, retroceder hasta el inicio del array y leer
 * hacia adelante hasta encontrar 20 entradas vacías consecutivas.
 */
function scanItemArray(buf: Buffer): RawInventoryItem[] {
  const anchorOffset = findAnchorOffset(buf);

  if (anchorOffset === -1) {
    return bruteForceItemScan(buf);
  }

  const arrayStart = findArrayStart(buf, anchorOffset);
  return readItemArray(buf, arrayStart);
}

function findAnchorOffset(buf: Buffer): number {
  const searchEnd = Math.min(INVENTORY.SEARCH_WINDOW, buf.length - INVENTORY.ITEM_ENTRY_SIZE);

  for (let offset = 0; offset < searchEnd; offset += 4) {
    const id = safeReadUInt32LE(buf, offset);
    if (id === INVENTORY.ANCHOR_ITEM_ID) {
      return offset;
    }
  }
  return -1;
}

function findArrayStart(buf: Buffer, anchorOffset: number): number {
  let cursor = anchorOffset;

  while (cursor >= INVENTORY.ITEM_ENTRY_SIZE) {
    const prevOffset = cursor - INVENTORY.ITEM_ENTRY_SIZE;
    const prevId = safeReadUInt32LE(buf, prevOffset);
    if (isEmpty(prevId)) break;
    cursor = prevOffset;
  }

  return cursor;
}

function readItemArray(buf: Buffer, start: number): RawInventoryItem[] {
  const CONSECUTIVE_EMPTY = 20;
  const items: RawInventoryItem[] = [];
  let consecutiveEmpty = 0;
  let offset = start;
  let count = 0;

  while (
    count < INVENTORY.MAX_ITEMS &&
    offset + INVENTORY.ITEM_ENTRY_SIZE <= buf.length
  ) {
    const itemId = safeReadUInt32LE(buf, offset);
    // El segundo campo (flag) vale 1 si el ítem está poseído, 0 si no.
    // No hay campo uid ni quantity separados en las entradas de 8 bytes.
    const flag   = safeReadUInt32LE(buf, offset + 4);

    if (isEmpty(itemId)) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= CONSECUTIVE_EMPTY) break;
    } else {
      consecutiveEmpty = 0;
      const category = decodeCategory(itemId);
      const baseId   = decodeBaseId(itemId);
      // uid=0 (no existe en este formato), quantity=flag (1=poseído)
      items.push({ itemId, uid: 0, quantity: flag, category, baseId });
    }

    offset += INVENTORY.ITEM_ENTRY_SIZE;
    count++;
  }

  return items;
}

function bruteForceItemScan(buf: Buffer): RawInventoryItem[] {
  const items: RawInventoryItem[] = [];
  const seen = new Set<number>();
  const searchEnd = Math.min(INVENTORY.SEARCH_WINDOW, buf.length - INVENTORY.ITEM_ENTRY_SIZE);

  for (let offset = 0; offset < searchEnd; offset += INVENTORY.ITEM_ENTRY_SIZE) {
    const itemId = safeReadUInt32LE(buf, offset);
    if (isEmpty(itemId) || seen.has(itemId)) continue;

    const category = decodeCategory(itemId);
    if (category === 'unknown') continue;

    const flag   = safeReadUInt32LE(buf, offset + 4);
    const baseId = decodeBaseId(itemId);

    seen.add(itemId);
    items.push({ itemId, uid: 0, quantity: flag, category, baseId });
  }

  return items;
}

// ── Decodificación de IDs (inventario) ──────────────────────

function decodeCategory(itemId: number): ItemCategory {
  // IMPORTANTE: usar >>> 28 (unsigned right shift) para extraer el nibble alto.
  // El operador & con 0xF0000000 produce un Int32 negativo en JS cuando el bit 31
  // está activo (0x8xxxxxxx), lo que rompe el switch para hechizos.
  const nibble = (itemId >>> 28) & 0xF;
  switch (nibble) {
    case 0x0: return 'weapon';
    case 0x1: return 'armor';
    case 0x2: return 'talisman';
    case 0x4: return 'consumable';
    case 0x8: return 'ash_of_war';  // EquipParamGem — Cenizas de Guerra
    default:  return 'unknown';
  }
}

function decodeBaseId(itemId: number): number {
  return itemId & ITEM_CATEGORY.BASE_ID_MASK;
}

function isEmpty(itemId: number): boolean {
  return itemId === INVENTORY.EMPTY_ITEM_ID || itemId === 0;
}

function safeReadUInt32LE(buf: Buffer, offset: number): number {
  if (offset < 0 || offset + 4 > buf.length) return 0;
  return buf.readUInt32LE(offset);
}
