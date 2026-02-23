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
import { INVENTORY, ITEM_CATEGORY } from './constants';
import { findStats } from '../parser/stats';
import type {
  RawInventoryItem,
  ResolvedInventoryItem,
  EquippedItems,
  EquippedWeapon,
  Inventory,
  InventoryScanResult,
  ItemCategory,
} from './types';

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
function getSpellNameSet(): Set<string> {
  if (!_spellNameSet) {
    const spells = loadJsonFile<{ name: string }[]>('spells.json');
    _spellNameSet = spells ? new Set(spells.map(s => s.name.toLowerCase())) : new Set();
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
  if (getSpellNameSet().has(name.toLowerCase())) return 'spell';

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

// ── Flechas y ballestas: nibble 0x0 (weapon), base ID >= 50_000_000 ──
const AMMO_BASE_ID_MIN = 50_000_000;
import { ItemStore } from '../items/store';

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

// ── API pública ──────────────────────────────────────────────

/**
 * Escanea el slot data y devuelve el equipo y el inventario del personaje.
 *
 * @param slotData  Buffer de 0x280000 bytes del slot del personaje
 * @param level     Nivel del personaje (necesario para localizar ChrAsm2)
 */
export function scanInventory(slotData: Buffer, level?: number): InventoryScanResult {
  const equipped = readEquippedItems(slotData, level);
  const inventory = readInventory(slotData, level);
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
  };
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
    const img = store.getWeaponByName(exactName)?.image;
    if (img) return img;
  }

  // 2. Intentar con el arma base (sin infusión): floor(baseId / 10000) * 10000
  const baseWeaponId = Math.floor(baseId / 10000) * 10000;
  if (baseWeaponId !== baseId) {
    const baseName = weaponIdName(baseWeaponId);
    if (baseName) {
      const img = store.getWeaponByName(baseName)?.image;
      if (img) return img;
    }
  }

  return '';
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

  return {
    rawId: handle,
    baseId,
    name,
    upgradeLevel,
    image,
    damage:  weaponData?.damage,
    scaling: weaponData?.scaling,
    weight:  weaponData?.weight,
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
    defense: armorData?.defense,
    weight:  armorData?.weight,
  };
}

/**
 * Resuelve un gaitem_handle de talismán (high byte 0xA0):
 *   talisman_id = handle ^ 0xA0000000 (EquipParamAccessory ID, sin ga_items lookup)
 */
function resolveTalismanHandle(handle: number): EquippedWeapon {
  if (isEmptyHandle(handle)) return { rawId: handle, baseId: 0, name: null, image: '' };
  if (handleHighByte(handle) !== 0xA0) return { rawId: handle, baseId: 0, name: null, image: '' };

  const baseId   = handle ^ 0xA0000000;
  // Talismanes: fanapis talismans.json tiene los IDs correctos de EquipParamAccessory
  const talisman = ItemStore.getInstance().getTalismanByBaseId(baseId);
  return {
    rawId: handle,
    baseId,
    name: talisman?.name ?? weaponIdName(baseId),
    image: talisman?.image ?? '',
  };
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

// ── Lectura del inventario completo ─────────────────────────

function readInventory(buf: Buffer, _level?: number): Inventory {
  const rawItems = scanItemArray(buf);
  const store = ItemStore.getInstance();

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
          ammos.push({ ...item, name, image: '' });
          break;
        }
        // El inventario almacena el ID base directamente (sin nivel de mejora).
        // Los IDs de mejora están solo en la sección ga_items (ítems equipados).
        const name = weaponIdName(item.baseId) ?? store.getWeaponByBaseId(item.baseId)?.name;
        if (!name) { other.push(item); break; }
        // Excluir entradas que son armaduras duplicadas (IDs 1M-3M en gameIds)
        // Solo IDs >= 3M son armas reales; menores son EquipParamProtector duplicados
        if (item.baseId > 0 && item.baseId < 3_000_000 && item.baseId >= 1_000_000) {
          // Estas son armaduras almacenadas bajo nibble 0x0 — ya están en armors
          other.push(item); break;
        }
        const image = resolveWeaponImage(item.baseId);
        weapons.push({ ...item, name, image });
        break;
      }
      case 'armor': {
        const armorName = armorIdName(item.baseId) ?? store.getArmorByBaseId(item.baseId)?.name;
        if (!armorName) { other.push(item); break; }
        const a = store.getArmorByName(armorName);
        armors.push({ ...item, name: armorName, image: a?.image ?? '' });
        break;
      }
      case 'talisman': {
        const t = store.getTalismanByBaseId(item.baseId);
        const name = t?.name ?? weaponIdName(item.baseId);
        if (!name) { other.push(item); break; }
        talismans.push({ ...item, name, image: t?.image ?? '' });
        break;
      }
      case 'consumable': {
        const name = weaponIdName(item.baseId);
        if (!name) { other.push(item); break; }
        // Subcategorizar por nombre y rango de base ID
        const subcat = classifyConsumable(item.baseId, name);
        const resolved: ResolvedInventoryItem = { ...item, category: subcat, name, image: '' };

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
        ashesOfWar.push({ ...item, name, image: '' });
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
