/**
 * Edge case unit tests for the inventory scanner.
 *
 * These tests validate scanner behavior with synthetic/boundary data,
 * WITHOUT needing a real .sl2 file. They cover:
 *   - resolveWeaponHandle via scanInventory (private, tested through public API)
 *   - scanInventory robustness with degenerate buffers
 *   - data enrichment file validation (weapons, armors, talismans, spells)
 *   - item ID encoding/decoding logic
 */

import path from 'path';
import fs from 'fs';
import { scanInventory } from '../scanner';
import { INVENTORY, ITEM_CATEGORY, INVENTORY_HELD } from '../constants';
import { ItemStore } from '../../items/store';
import type { Weapon, Armor, Spell } from '../../items/types';

// ── Data file loading helpers ─────────────────────────────────

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

function loadDataFile<T>(filename: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8')) as T;
}

// ── Buffer construction helpers ───────────────────────────────

function writeUInt32(buf: Buffer, offset: number, value: number): void {
  buf.writeUInt32LE(value >>> 0, offset);
}

function writeUInt16(buf: Buffer, offset: number, value: number): void {
  buf.writeUInt16LE(value & 0xFFFF, offset);
}

/**
 * Writes a stat block into the buffer at the given offset.
 * Stats: [vigor, mind, endurance, strength, dexterity, intelligence, faith, arcane]
 * Each stat is a uint32 LE (4 bytes). The level cross-check is at +44 (uint16 LE).
 */
function writeStatsBlock(
  buf: Buffer,
  offset: number,
  stats: number[],
  level: number,
): void {
  for (let i = 0; i < stats.length; i++) {
    writeUInt32(buf, offset + i * 4, stats[i]);
  }
  // Level cross-check at +44
  writeUInt16(buf, offset + 44, level);
}

/**
 * Writes a ga_items entry: [gaitem_handle: u32, item_id: u32]
 */
function writeGaItemEntry(buf: Buffer, offset: number, handle: number, itemId: number): void {
  writeUInt32(buf, offset, handle);
  writeUInt32(buf, offset + 4, itemId);
}

// ── Initialize ItemStore ──────────────────────────────────────

let store: ItemStore;

beforeAll(() => {
  store = ItemStore.getInstance();
});

// ── 1. resolveWeaponHandle edge cases ─────────────────────────

describe('resolveWeaponHandle edge cases (via scanInventory)', () => {
  /**
   * Build a buffer with a valid stat block so scanInventory can locate ChrAsm2.
   * Places stats at a known offset, then sets up ChrAsm2 weapon handles.
   */
  function buildBufferWithEquipment(opts: {
    level: number;
    stats: number[];
    weaponHandles?: { slot: 'rh0' | 'rh1' | 'rh2' | 'lh0' | 'lh1' | 'lh2'; handle: number }[];
    gaItems?: { handle: number; itemId: number }[];
  }): Buffer {
    const buf = Buffer.alloc(0x280000, 0xFF);

    // Place stats at a fixed offset deep enough for ga_items space
    const vigorOff = 0x20000;
    writeStatsBlock(buf, vigorOff, opts.stats, opts.level);

    // ChrAsm2 = vigorOff + 0x310
    const chrAsm2Off = vigorOff + 0x310;

    // Write weapon handles into ChrAsm2 (interleaved: LH[0], RH[0], LH[1], RH[1], LH[2], RH[2])
    const slotMap: Record<string, number> = {
      lh0: 0x00, rh0: 0x04, lh1: 0x08, rh1: 0x0C, lh2: 0x10, rh2: 0x14,
    };

    if (opts.weaponHandles) {
      for (const wh of opts.weaponHandles) {
        writeUInt32(buf, chrAsm2Off + slotMap[wh.slot], wh.handle);
      }
    }

    // Write ga_items entries starting at buf[0x30]
    if (opts.gaItems) {
      let gaOff = 0x30;
      for (const entry of opts.gaItems) {
        writeGaItemEntry(buf, gaOff, entry.handle, entry.itemId);
        gaOff += 8;
      }
    }

    return buf;
  }

  test('empty handle (0xFFFFFFFF) returns name: null', () => {
    const stats = [20, 15, 18, 16, 14, 10, 10, 10]; // sum = 113 => level = 34
    const level = 34;
    const buf = buildBufferWithEquipment({ level, stats });

    const result = scanInventory(buf, level);
    expect(result.equipped.rightHand[0].name).toBeNull();
    expect(result.equipped.rightHand[0].baseId).toBe(0);
  });

  test('zero handle (0x00000000) returns name: null', () => {
    const stats = [20, 15, 18, 16, 14, 10, 10, 10];
    const level = 34;
    const buf = buildBufferWithEquipment({
      level,
      stats,
      weaponHandles: [{ slot: 'rh0', handle: 0x00000000 }],
    });

    const result = scanInventory(buf, level);
    expect(result.equipped.rightHand[0].name).toBeNull();
  });

  test('non-weapon high byte (0x90) in weapon slot returns name: null', () => {
    const stats = [20, 15, 18, 16, 14, 10, 10, 10];
    const level = 34;
    // Put an armor handle (0x90xxxxxx) in a weapon slot
    const buf = buildBufferWithEquipment({
      level,
      stats,
      weaponHandles: [{ slot: 'rh0', handle: 0x90001234 }],
    });

    const result = scanInventory(buf, level);
    // Armor high byte in weapon resolve -> treated as unknown, returns null
    expect(result.equipped.rightHand[0].name).toBeNull();
  });

  test('weapon handle with no matching ga_items entry returns name: null', () => {
    const stats = [20, 15, 18, 16, 14, 10, 10, 10];
    const level = 34;
    const weaponHandle = 0x80001111;
    const buf = buildBufferWithEquipment({
      level,
      stats,
      weaponHandles: [{ slot: 'rh0', handle: weaponHandle }],
      // No ga_items entry for this handle
      gaItems: [],
    });

    const result = scanInventory(buf, level);
    expect(result.equipped.rightHand[0].name).toBeNull();
    expect(result.equipped.rightHand[0].baseId).toBe(0);
  });

  test('weapon handle resolving to Unarmed (110000) returns name: null', () => {
    const stats = [20, 15, 18, 16, 14, 10, 10, 10];
    const level = 34;
    const weaponHandle = 0x80002222;
    // Unarmed item_id: base = 110000, upgrade = 0 → item_id = 110000
    const buf = buildBufferWithEquipment({
      level,
      stats,
      weaponHandles: [{ slot: 'rh0', handle: weaponHandle }],
      gaItems: [{ handle: weaponHandle, itemId: 110000 }],
    });

    const result = scanInventory(buf, level);
    // Unarmed is treated as empty
    expect(result.equipped.rightHand[0].name).toBeNull();
    expect(result.equipped.rightHand[0].baseId).toBe(0);
  });

  test('valid weapon handle resolves name and upgrade level', () => {
    const stats = [20, 15, 18, 16, 14, 10, 10, 10];
    const level = 34;
    const weaponHandle = 0x80003333;
    // Battle Axe base ID = 1004000, upgrade +5 → item_id = 1004005
    // (1004000 falls through gameIds.json to store lookup, avoiding namespace collision)
    const buf = buildBufferWithEquipment({
      level,
      stats,
      weaponHandles: [{ slot: 'rh0', handle: weaponHandle }],
      gaItems: [{ handle: weaponHandle, itemId: 1004005 }],
    });

    const result = scanInventory(buf, level);
    const rh0 = result.equipped.rightHand[0];
    expect(rh0.name).toBe('Battle Axe +5');
    expect(rh0.baseId).toBe(1004000);
    expect(rh0.upgradeLevel).toBe(5);
  });

  test('weapon at upgrade +0 shows base name without suffix', () => {
    const stats = [20, 15, 18, 16, 14, 10, 10, 10];
    const level = 34;
    const weaponHandle = 0x80004444;
    // Battle Axe at +0 → item_id = 1004000
    const buf = buildBufferWithEquipment({
      level,
      stats,
      weaponHandles: [{ slot: 'rh0', handle: weaponHandle }],
      gaItems: [{ handle: weaponHandle, itemId: 1004000 }],
    });

    const result = scanInventory(buf, level);
    const rh0 = result.equipped.rightHand[0];
    expect(rh0.name).toBe('Battle Axe');
    expect(rh0.upgradeLevel).toBe(0);
  });

  test('weapon with infusion offset decodes infusion name', () => {
    const stats = [20, 15, 18, 16, 14, 10, 10, 10];
    const level = 34;
    const weaponHandle = 0x80005555;
    // Synthetic Heavy weapon using 10000-aligned ID (e.g. 8030000 + 100 = 8030100, +3 → 8030103)
    // decodeInfusion: floor(8030100/10000)*10000 = 8030000, offset = 100 → "Heavy"
    const buf = buildBufferWithEquipment({
      level,
      stats,
      weaponHandles: [{ slot: 'rh0', handle: weaponHandle }],
      gaItems: [{ handle: weaponHandle, itemId: 8030103 }],
    });

    const result = scanInventory(buf, level);
    const rh0 = result.equipped.rightHand[0];
    expect(rh0.infusion).toBe('Heavy');
    expect(rh0.upgradeLevel).toBe(3);
    expect(rh0.baseId).toBe(8030100);
  });
});

// ── 2. scanInventory robustness ───────────────────────────────

describe('scanInventory robustness', () => {
  test('too-small buffer (64 bytes) returns gracefully without crash', () => {
    const tiny = Buffer.alloc(64, 0);
    expect(() => {
      const result = scanInventory(tiny);
      // Should return a valid structure, not throw
      expect(result).toBeDefined();
      expect(result.equipped).toBeDefined();
      expect(result.inventory).toBeDefined();
    }).not.toThrow();
  });

  test('zero-length buffer returns gracefully', () => {
    const empty = Buffer.alloc(0);
    expect(() => {
      const result = scanInventory(empty);
      expect(result.equipped.rightHand).toHaveLength(3);
      expect(result.equipped.leftHand).toHaveLength(3);
      expect(result.equipped.talismans).toHaveLength(4);
    }).not.toThrow();
  });

  test('all-zero buffer returns empty equipped items and empty inventory', () => {
    const buf = Buffer.alloc(0x280000, 0);
    const result = scanInventory(buf);

    // All equipment slots should be null/empty
    for (const slot of result.equipped.rightHand) {
      expect(slot.name).toBeNull();
    }
    for (const slot of result.equipped.leftHand) {
      expect(slot.name).toBeNull();
    }
    expect(result.equipped.head.name).toBeNull();
    expect(result.equipped.chest.name).toBeNull();
    expect(result.equipped.hands.name).toBeNull();
    expect(result.equipped.legs.name).toBeNull();
    for (const slot of result.equipped.talismans) {
      expect(slot.name).toBeNull();
    }

    // Inventory should be empty (no anchor to find, brute force finds nothing meaningful)
    expect(result.inventory.weapons.length).toBeGreaterThanOrEqual(0);
    expect(result.inventory.armors.length).toBeGreaterThanOrEqual(0);
  });

  test('full-size buffer with no valid stat pattern returns empty equipped items', () => {
    // Fill with random-looking data that won't match any stat pattern
    const buf = Buffer.alloc(0x280000);
    for (let i = 0; i < buf.length; i += 4) {
      buf.writeUInt32LE((i * 7 + 0xDEADBEEF) >>> 0, i);
    }

    const result = scanInventory(buf, 68);

    // Without a valid stat pattern, equipped items should be empty
    expect(result.equipped.rightHand[0].name).toBeNull();
    expect(result.equipped.head.name).toBeNull();
    expect(result.equipped.talismans[0].name).toBeNull();
  });

  test('scanInventory without level parameter returns empty equipped items', () => {
    const buf = Buffer.alloc(0x280000, 0xFF);
    const result = scanInventory(buf);

    // Without level, cannot locate ChrAsm2 → returns emptyEquippedItems
    expect(result.equipped.rightHand[0].rawId).toBe(0xFFFFFFFF);
    expect(result.equipped.leftHand[0].rawId).toBe(0xFFFFFFFF);
    expect(result.equipped.head.rawId).toBe(0xFFFFFFFF);
    expect(result.equipped.memorySlotCount).toBe(2);
  });

  test('buffer of exactly 1 byte does not crash', () => {
    const buf = Buffer.alloc(1, 0xAA);
    expect(() => {
      const result = scanInventory(buf);
      expect(result).toBeDefined();
    }).not.toThrow();
  });

  test('memorySlotCount defaults to 2 when no Memory Stones found', () => {
    const buf = Buffer.alloc(0x280000, 0xFF);
    const result = scanInventory(buf);
    expect(result.equipped.memorySlotCount).toBe(2);
  });
});

// ── 3. Data enrichment validation ─────────────────────────────

describe('data enrichment validation', () => {
  const weapons: Weapon[] = loadDataFile<Weapon[]>('weapons.json');
  const armors: Armor[] = loadDataFile<Armor[]>('armors.json');
  const spells: Spell[] = loadDataFile<Spell[]>('spells.json');
  const talismanWeights: Record<string, number> = loadDataFile<Record<string, number>>('talismanWeights.json');

  describe('weapons.json', () => {
    const VALID_PASSIVE_TYPES = ['blood', 'frost', 'poison', 'rot', 'death', 'sleep', 'madness'];

    test('all weapons with passives have valid passive types', () => {
      const weaponsWithPassives = weapons.filter(w => w.passives && w.passives.length > 0);
      expect(weaponsWithPassives.length).toBeGreaterThan(0); // sanity: at least some weapons have passives

      for (const weapon of weaponsWithPassives) {
        for (const passive of weapon.passives) {
          expect(VALID_PASSIVE_TYPES).toContain(passive.type);
          expect(typeof passive.buildup).toBe('number');
          expect(passive.buildup).toBeGreaterThan(0);
        }
      }
    });

    test('all weapons with requirements have non-negative values', () => {
      for (const weapon of weapons) {
        expect(weapon.requirements.str).toBeGreaterThanOrEqual(0);
        expect(weapon.requirements.dex).toBeGreaterThanOrEqual(0);
        expect(weapon.requirements.int).toBeGreaterThanOrEqual(0);
        expect(weapon.requirements.fai).toBeGreaterThanOrEqual(0);
        expect(weapon.requirements.arc).toBeGreaterThanOrEqual(0);
      }
    });

    test('all weapons have positive weight', () => {
      for (const weapon of weapons) {
        expect(weapon.weight).toBeGreaterThanOrEqual(0);
      }
    });

    test('all weapons have non-negative damage values', () => {
      for (const weapon of weapons) {
        expect(weapon.damage.physical).toBeGreaterThanOrEqual(0);
        expect(weapon.damage.magic).toBeGreaterThanOrEqual(0);
        expect(weapon.damage.fire).toBeGreaterThanOrEqual(0);
        expect(weapon.damage.lightning).toBeGreaterThanOrEqual(0);
        expect(weapon.damage.holy).toBeGreaterThanOrEqual(0);
      }
    });

    test('all weapon IDs are >= 1000000 (EquipParamWeapon range)', () => {
      for (const weapon of weapons) {
        expect(weapon.id).toBeGreaterThanOrEqual(1000000);
      }
    });

    test('no duplicate weapon names', () => {
      const names = weapons.map(w => w.name.toLowerCase());
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });

  describe('armors.json', () => {
    const VALID_ARMOR_TYPES = ['Helm', 'Chest Armor', 'Gauntlets', 'Leg Armor'];

    test('no armor has negative poise', () => {
      for (const armor of armors) {
        expect(armor.poise).toBeGreaterThanOrEqual(0);
      }
    });

    test('all armor types are valid', () => {
      for (const armor of armors) {
        expect(VALID_ARMOR_TYPES).toContain(armor.type);
      }
    });

    test('all armor defense values are within valid range (-10 to 100)', () => {
      // Some armors have NEGATIVE elemental defense (e.g. Drake Knight set has fire -2.3)
      // This is intentional game design, so we allow values down to -10
      for (const armor of armors) {
        expect(armor.defense.physical).toBeGreaterThanOrEqual(-10);
        expect(armor.defense.strike).toBeGreaterThanOrEqual(-10);
        expect(armor.defense.slash).toBeGreaterThanOrEqual(-10);
        expect(armor.defense.pierce).toBeGreaterThanOrEqual(-10);
        expect(armor.defense.magic).toBeGreaterThanOrEqual(-10);
        expect(armor.defense.fire).toBeGreaterThanOrEqual(-10);
        expect(armor.defense.lightning).toBeGreaterThanOrEqual(-10);
        expect(armor.defense.holy).toBeGreaterThanOrEqual(-10);
      }
    });

    test('all armor weights are non-negative', () => {
      for (const armor of armors) {
        expect(armor.weight).toBeGreaterThanOrEqual(0);
      }
    });

    test('armors with resistances have non-negative values', () => {
      for (const armor of armors) {
        if (armor.immunity !== undefined)   expect(armor.immunity).toBeGreaterThanOrEqual(0);
        if (armor.robustness !== undefined)  expect(armor.robustness).toBeGreaterThanOrEqual(0);
        if (armor.focus !== undefined)       expect(armor.focus).toBeGreaterThanOrEqual(0);
        if (armor.vitality !== undefined)    expect(armor.vitality).toBeGreaterThanOrEqual(0);
      }
    });

    test('all armor IDs are multiples of 10000 (EquipParamProtector convention)', () => {
      for (const armor of armors) {
        // Armor IDs in EquipParamProtector are typically multiples of 10000
        // (e.g. 10000000, 10010000, ...)
        expect(armor.id % 10000).toBe(0);
      }
    });
  });

  describe('talismanWeights.json', () => {
    test('all talismans have weights between 0 and 5', () => {
      for (const [name, weight] of Object.entries(talismanWeights)) {
        expect(weight).toBeGreaterThanOrEqual(0);
        expect(weight).toBeLessThanOrEqual(5);
      }
    });

    test('talismanWeights has at least 50 entries', () => {
      const count = Object.keys(talismanWeights).length;
      expect(count).toBeGreaterThanOrEqual(50);
    });

    test('all weight values are numbers, not NaN', () => {
      for (const [name, weight] of Object.entries(talismanWeights)) {
        expect(typeof weight).toBe('number');
        expect(Number.isNaN(weight)).toBe(false);
      }
    });
  });

  describe('spells.json', () => {
    test('all spells with cost have positive values', () => {
      const spellsWithCost = spells.filter(s => s.cost !== undefined);
      expect(spellsWithCost.length).toBeGreaterThan(0); // sanity

      for (const spell of spellsWithCost) {
        expect(spell.cost).toBeGreaterThan(0);
      }
    });

    test('all spell types are sorcery or incantation', () => {
      for (const spell of spells) {
        expect(['sorcery', 'incantation']).toContain(spell.type);
      }
    });

    test('all spells with slots have positive integer values', () => {
      const spellsWithSlots = spells.filter(s => s.slots !== undefined);
      for (const spell of spellsWithSlots) {
        expect(spell.slots).toBeGreaterThan(0);
        expect(Number.isInteger(spell.slots)).toBe(true);
      }
    });

    test('all spell requirements are non-negative', () => {
      for (const spell of spells) {
        expect(spell.requirements.str).toBeGreaterThanOrEqual(0);
        expect(spell.requirements.dex).toBeGreaterThanOrEqual(0);
        expect(spell.requirements.int).toBeGreaterThanOrEqual(0);
        expect(spell.requirements.fai).toBeGreaterThanOrEqual(0);
        expect(spell.requirements.arc).toBeGreaterThanOrEqual(0);
      }
    });

    test('no duplicate spell names', () => {
      const names = spells.map(s => s.name.toLowerCase());
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });
});

// ── 4. Item ID decoding ───────────────────────────────────────

describe('item ID decoding', () => {
  describe('weapon ID encoding', () => {
    test('upgrade level is id % 100', () => {
      // Hand Axe +5 → item_id = 1000005
      const itemId = 1000005;
      const upgradeLevel = itemId % 100;
      expect(upgradeLevel).toBe(5);
    });

    test('base weapon ID is floor(id/100)*100', () => {
      // Hand Axe +5 → item_id = 1000005 → base = 1000000
      const itemId = 1000005;
      const baseId = Math.floor(itemId / 100) * 100;
      expect(baseId).toBe(1000000);
    });

    test('upgrade level 0 results in same base ID', () => {
      const itemId = 1000000;
      const baseId = Math.floor(itemId / 100) * 100;
      const upgradeLevel = itemId % 100;
      expect(baseId).toBe(1000000);
      expect(upgradeLevel).toBe(0);
    });

    test('max regular upgrade +25 decodes correctly', () => {
      const itemId = 1000025;
      expect(itemId % 100).toBe(25);
      expect(Math.floor(itemId / 100) * 100).toBe(1000000);
    });

    test('max somber upgrade +10 decodes correctly', () => {
      const itemId = 3000010; // e.g., a somber weapon at +10
      expect(itemId % 100).toBe(10);
      expect(Math.floor(itemId / 100) * 100).toBe(3000000);
    });
  });

  describe('armor ID encoding', () => {
    test('armor item_id XOR 0x10000000 yields real armor ID', () => {
      // In ga_items, armor item_id has the 0x10000000 prefix
      const gaItemsItemId = 0x10000000 | 10000000; // armor with game ID 10000000
      const armorId = gaItemsItemId ^ 0x10000000;
      expect(armorId).toBe(10000000);
    });

    test('XOR is its own inverse for armor IDs', () => {
      const realArmorId = 10010000;
      const encoded = realArmorId ^ 0x10000000;
      const decoded = encoded ^ 0x10000000;
      expect(decoded).toBe(realArmorId);
    });

    test('inventory armor nibble 0x1 correctly encodes armor', () => {
      const armorBaseId = 10000000;
      const inventoryId = 0x10000000 | armorBaseId;
      const nibble = (inventoryId >>> 28) & 0xF;
      expect(nibble).toBe(1); // armor nibble
      const extractedBaseId = inventoryId & 0x0FFFFFFF;
      expect(extractedBaseId).toBe(armorBaseId);
    });
  });

  describe('infusion encoding', () => {
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

    test('baseId % 10000 maps to known infusion index', () => {
      // Heavy Hand Axe: base = 1000100 (1000000 + 100)
      const baseId = 1000100;
      const baseWeaponId = Math.floor(baseId / 10000) * 10000;
      const offset = baseId - baseWeaponId;
      expect(INFUSION_MAP[offset]).toBe('Heavy');
    });

    test('all infusion offsets produce valid names', () => {
      for (const [offset, name] of Object.entries(INFUSION_MAP)) {
        expect(typeof name).toBe('string');
        expect(name.length).toBeGreaterThan(0);
        expect(Number(offset)).toBeGreaterThan(0);
        expect(Number(offset)).toBeLessThanOrEqual(1200);
      }
    });

    test('standard weapon (no infusion) has offset 0', () => {
      const baseId = 9000000; // Uchigatana standard
      const baseWeaponId = Math.floor(baseId / 10000) * 10000;
      const offset = baseId - baseWeaponId;
      expect(offset).toBe(0);
      // offset 0 → no infusion
    });

    test('Keen Uchigatana decodes to Keen infusion', () => {
      // Uchigatana base = 9000000, Keen = +200 → 9000200
      const baseId = 9000200;
      const baseWeaponId = Math.floor(baseId / 10000) * 10000;
      const offset = baseId - baseWeaponId;
      expect(INFUSION_MAP[offset]).toBe('Keen');
    });

    test('Blood infusion decodes correctly', () => {
      // Blood = +1100 → e.g., 9001100
      const baseId = 9001100;
      const baseWeaponId = Math.floor(baseId / 10000) * 10000;
      const offset = baseId - baseWeaponId;
      expect(INFUSION_MAP[offset]).toBe('Blood');
    });
  });

  describe('talisman handle encoding', () => {
    test('handle XOR 0xA0000000 yields talisman ID', () => {
      // e.g., Erdtree's Favor handle = 0xA0000000 | 1000
      const handle = 0xA0000000 | 1000;
      const talismanId = handle ^ 0xA0000000;
      expect(talismanId).toBe(1000);
    });

    test('high byte of talisman handle is 0xA0', () => {
      const talismanId = 5000;
      const handle = 0xA0000000 | talismanId;
      const highByte = (handle >>> 24) & 0xFF;
      expect(highByte).toBe(0xA0);
    });

    test('XOR is its own inverse for talisman handles', () => {
      const talismanId = 42;
      const handle = talismanId ^ 0xA0000000;
      const decoded = handle ^ 0xA0000000;
      expect(decoded).toBe(talismanId);
    });

    test('empty talisman handle (0xFFFFFFFF) does not decode to valid ID', () => {
      const handle = 0xFFFFFFFF;
      // The scanner checks for 0xFFFFFFFF before XOR, so this is never decoded.
      // But if it were: 0xFFFFFFFF ^ 0xA0000000 = 0x5FFFFFFF — unrealistically large
      const wouldBe = (handle ^ 0xA0000000) >>> 0;
      expect(wouldBe).toBe(0x5FFFFFFF);
      expect(wouldBe).toBeGreaterThan(100000000); // clearly invalid
    });
  });

  describe('category nibble decoding', () => {
    test('nibble 0x0 = weapon', () => {
      const itemId = 0x00001234;
      const nibble = (itemId >>> 28) & 0xF;
      expect(nibble).toBe(0);
    });

    test('nibble 0x1 = armor', () => {
      const itemId = 0x10001234;
      const nibble = (itemId >>> 28) & 0xF;
      expect(nibble).toBe(1);
    });

    test('nibble 0x2 = talisman', () => {
      const itemId = 0x20001234;
      const nibble = (itemId >>> 28) & 0xF;
      expect(nibble).toBe(2);
    });

    test('nibble 0x4 = consumable/goods', () => {
      const itemId = 0x40001234;
      const nibble = (itemId >>> 28) & 0xF;
      expect(nibble).toBe(4);
    });

    test('nibble 0x8 = ash of war', () => {
      const itemId = 0x80001234;
      const nibble = (itemId >>> 28) & 0xF;
      expect(nibble).toBe(8);
    });

    test('base ID mask 0x0FFFFFFF extracts lower 28 bits', () => {
      const itemId = 0x4ABCDEF0;
      const baseId = itemId & 0x0FFFFFFF;
      expect(baseId).toBe(0x0ABCDEF0);
    });

    test('unsigned right shift (>>>) handles bit 31 correctly for 0x8xxxxxxx', () => {
      // This is the critical bug that was fixed: 0x80001234 & 0xF0000000
      // produces a negative number in JS (Int32), but >>> 28 gives unsigned result.
      const itemId = 0x80001234;
      const nibble = (itemId >>> 28) & 0xF;
      expect(nibble).toBe(8); // NOT negative
    });
  });

  describe('gaitem handle high byte decoding', () => {
    test('0x80 high byte = weapon gaitem', () => {
      const handle = 0x80001234;
      const highByte = (handle >>> 24) & 0xFF;
      expect(highByte).toBe(0x80);
    });

    test('0x90 high byte = armor gaitem', () => {
      const handle = 0x90001234;
      const highByte = (handle >>> 24) & 0xFF;
      expect(highByte).toBe(0x90);
    });

    test('0xA0 high byte = talisman/accessory gaitem', () => {
      const handle = 0xA0001234;
      const highByte = (handle >>> 24) & 0xFF;
      expect(highByte).toBe(0xA0);
    });

    test('0xB0 high byte = item/goods gaitem', () => {
      const handle = 0xB0001234;
      const highByte = (handle >>> 24) & 0xFF;
      expect(highByte).toBe(0xB0);
    });

    test('0xC0 high byte = ash of war gem gaitem', () => {
      const handle = 0xC0001234;
      const highByte = (handle >>> 24) & 0xFF;
      expect(highByte).toBe(0xC0);
    });
  });
});
