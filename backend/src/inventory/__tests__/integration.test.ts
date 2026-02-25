/**
 * Golden integration test for the complete Elden Ring .sl2 save file parsing pipeline.
 *
 * Validates parseSl2() + scanInventory() against a real save file with known data.
 * Tests are skipped gracefully if the save file is not found on disk.
 *
 * Known character: Zhyak (Slot 2, Level 68)
 */

import fs from 'fs';
import { parseSl2 } from '../../parser';
import { SLOT } from '../../parser/constants';
import { scanInventory } from '../';
import { ItemStore } from '../../items';
import type { ParsedSave, CharacterSlot } from '../../parser';
import type { InventoryScanResult } from '../';

// ── Configuration ────────────────────────────────────────────

const SAVE_PATH = '/mnt/c/Users/pacho/AppData/Roaming/EldenRing/76561198241678230/ER0000.sl2';
const saveExists = fs.existsSync(SAVE_PATH);

// ── Known data for Zhyak (Slot 2, Level 68) ─────────────────

const ZHYAK_SLOT_INDEX = 2;
const ZHYAK_LEVEL = 68;
const ZHYAK_NAME = 'Zhyak';

const ZHYAK_STATS = {
  vigor: 34, mind: 17, endurance: 18, strength: 18,
  dexterity: 34, intelligence: 7, faith: 8, arcane: 11,
};

const EXPECTED_INVENTORY_COUNTS: Record<string, number> = {
  weapons: 94, armors: 70, talismans: 36, spells: 29,
  spirits: 25, ashesOfWar: 44, consumables: 68, materials: 55,
  upgrades: 16, crystalTears: 14, keyItems: 61, cookbooks: 29,
  multiplayer: 14, ammos: 14,
};

const VALID_PASSIVE_TYPES = ['blood', 'frost', 'poison', 'rot', 'death', 'sleep', 'madness'];

// ── Shared state loaded once in beforeAll ────────────────────

let parsed: ParsedSave;
let zhyakSlot: CharacterSlot;
let scanResult: InventoryScanResult;

// ── Tests ────────────────────────────────────────────────────

(saveExists ? describe : describe.skip)('Golden integration tests', () => {
  beforeAll(() => {
    // Initialize ItemStore (required by scanInventory for name resolution)
    ItemStore.getInstance();

    // Step 1: Parse the full .sl2 file
    const buf = fs.readFileSync(SAVE_PATH);
    parsed = parseSl2(buf);

    // Step 2: Get Zhyak's slot
    zhyakSlot = parsed.slots[ZHYAK_SLOT_INDEX];

    // Step 3: Extract slot data and run inventory scan
    const slotDataOffset = SLOT.DATA_BASE + ZHYAK_SLOT_INDEX * SLOT.DATA_STRIDE;
    const slotData = buf.subarray(slotDataOffset, slotDataOffset + SLOT.DATA_SIZE);
    scanResult = scanInventory(slotData, ZHYAK_LEVEL);
  });

  // ────────────────────────────────────────────────────────────
  // 1. parseSl2
  // ────────────────────────────────────────────────────────────

  describe('Golden integration: parseSl2', () => {
    test('only Zhyak (slot 2) is active', () => {
      const activeSlots = parsed.slots.filter(s => s.active);
      expect(activeSlots).toHaveLength(1);
      expect(activeSlots[0].index).toBe(ZHYAK_SLOT_INDEX);
    });

    test('Zhyak has correct level (68) and name', () => {
      expect(zhyakSlot.active).toBe(true);
      expect(zhyakSlot.character).toBeDefined();
      expect(zhyakSlot.character!.name).toBe(ZHYAK_NAME);
      expect(zhyakSlot.character!.level).toBe(ZHYAK_LEVEL);
    });

    test('stats match exactly', () => {
      expect(zhyakSlot.character!.stats).toEqual(ZHYAK_STATS);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 2. Equipped items
  // ────────────────────────────────────────────────────────────

  describe('Golden integration: equipped items', () => {
    test('rightHand[1] is Bloodhound\'s Fang +4 with correct baseId, upgradeLevel, itemType', () => {
      const weapon = scanResult.equipped.rightHand[1];
      expect(weapon.name).toBe("Bloodhound's Fang +4");
      expect(weapon.baseId).toBe(8030000);
      expect(weapon.upgradeLevel).toBe(4);
      expect(weapon.itemType).toBe('Curved Greatsword');
    });

    test('rightHand[1] has blood passive with buildup 55', () => {
      const weapon = scanResult.equipped.rightHand[1];
      expect(weapon.passives).toBeDefined();
      expect(weapon.passives!.length).toBeGreaterThanOrEqual(1);

      const bloodPassive = weapon.passives!.find(p => p.type === 'blood');
      expect(bloodPassive).toBeDefined();
      expect(bloodPassive!.buildup).toBe(55);
    });

    test('rightHand[1] has correct requirements', () => {
      const weapon = scanResult.equipped.rightHand[1];
      expect(weapon.requirements).toBeDefined();
      expect(weapon.requirements).toEqual({ str: 18, dex: 17, int: 0, fai: 0, arc: 0 });
    });

    test('leftHand[1] is Torch', () => {
      const weapon = scanResult.equipped.leftHand[1];
      expect(weapon.name).toBe('Torch');
      expect(weapon.baseId).toBe(24000000);
      expect(weapon.upgradeLevel).toBe(0);
    });

    test('head is Banished Knight Helm (Altered) with poise 11', () => {
      const head = scanResult.equipped.head;
      expect(head.name).toBe('Banished Knight Helm (Altered)');
      expect(head.baseId).toBe(201000);
      expect(head.poise).toBe(11);
    });

    test('all 4 armor pieces have defense.physical > 0', () => {
      const armorPieces = [
        scanResult.equipped.head,
        scanResult.equipped.chest,
        scanResult.equipped.hands,
        scanResult.equipped.legs,
      ];

      for (const piece of armorPieces) {
        expect(piece.defense).toBeDefined();
        expect(piece.defense!.physical).toBeGreaterThan(0);
      }
    });

    test('all 4 armor pieces have immunity, robustness, focus, vitality > 0', () => {
      const armorPieces = [
        scanResult.equipped.head,
        scanResult.equipped.chest,
        scanResult.equipped.hands,
        scanResult.equipped.legs,
      ];

      for (const piece of armorPieces) {
        expect(piece.immunity).toBeDefined();
        expect(piece.immunity).toBeGreaterThan(0);
        expect(piece.robustness).toBeDefined();
        expect(piece.robustness).toBeGreaterThan(0);
        expect(piece.focus).toBeDefined();
        expect(piece.focus).toBeGreaterThan(0);
        expect(piece.vitality).toBeDefined();
        expect(piece.vitality).toBeGreaterThan(0);
      }
    });

    test('all 4 armor pieces have itemType set', () => {
      const armorPieces = [
        scanResult.equipped.head,
        scanResult.equipped.chest,
        scanResult.equipped.hands,
        scanResult.equipped.legs,
      ];

      for (const piece of armorPieces) {
        expect(piece.itemType).toBeDefined();
        expect(typeof piece.itemType).toBe('string');
        expect(piece.itemType!.length).toBeGreaterThan(0);
      }
    });

    test('talismans[0] is Erdtree\'s Favor', () => {
      const talisman = scanResult.equipped.talismans[0];
      expect(talisman.name).toBe("Erdtree's Favor");
      expect(talisman.baseId).toBe(1040);
    });

    test('talismans[2] and [3] are empty (baseId 0)', () => {
      expect(scanResult.equipped.talismans[2].name).toBeNull();
      expect(scanResult.equipped.talismans[2].baseId).toBe(0);
      expect(scanResult.equipped.talismans[3].name).toBeNull();
      expect(scanResult.equipped.talismans[3].baseId).toBe(0);
    });

    test('memorySlotCount is 7', () => {
      expect(scanResult.equipped.memorySlotCount).toBe(7);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 3. Inventory enrichment
  // ────────────────────────────────────────────────────────────

  describe('Golden integration: inventory enrichment', () => {
    test('inventory counts within +/-5 of expected', () => {
      const inv = scanResult.inventory;
      const actual: Record<string, number> = {
        weapons:      inv.weapons.length,
        armors:       inv.armors.length,
        talismans:    inv.talismans.length,
        spells:       inv.spells.length,
        spirits:      inv.spirits.length,
        ashesOfWar:   inv.ashesOfWar.length,
        consumables:  inv.consumables.length,
        materials:    inv.materials.length,
        upgrades:     inv.upgrades.length,
        crystalTears: inv.crystalTears.length,
        keyItems:     inv.keyItems.length,
        cookbooks:    inv.cookbooks.length,
        multiplayer:  inv.multiplayer.length,
        ammos:        inv.ammos.length,
      };

      for (const [category, expected] of Object.entries(EXPECTED_INVENTORY_COUNTS)) {
        const count = actual[category] ?? 0;
        expect(count).toBeGreaterThanOrEqual(expected - 5);
        expect(count).toBeLessThanOrEqual(expected + 5);
      }
    });

    test('at least 5 weapons have requirements field', () => {
      const withReqs = scanResult.inventory.weapons.filter(w => w.requirements !== undefined);
      expect(withReqs.length).toBeGreaterThanOrEqual(5);
    });

    test('at least 3 weapons have passives field', () => {
      const withPassives = scanResult.inventory.weapons.filter(w => w.passives !== undefined);
      expect(withPassives.length).toBeGreaterThanOrEqual(3);
    });

    test('at least 5 armors have poise > 0', () => {
      const withPoise = scanResult.inventory.armors.filter(a => a.poise !== undefined && a.poise > 0);
      expect(withPoise.length).toBeGreaterThanOrEqual(5);
    });

    test('at least 5 armors have immunity > 0', () => {
      const withImmunity = scanResult.inventory.armors.filter(a => a.immunity !== undefined && a.immunity > 0);
      expect(withImmunity.length).toBeGreaterThanOrEqual(5);
    });

    test('at least 3 spells have cost defined', () => {
      const withCost = scanResult.inventory.spells.filter(s => s.cost !== undefined);
      expect(withCost.length).toBeGreaterThanOrEqual(3);
    });

    test('at least 3 spells have description defined', () => {
      const withDesc = scanResult.inventory.spells.filter(s => s.description !== undefined);
      expect(withDesc.length).toBeGreaterThanOrEqual(3);
    });

    test('at least 3 talismans have weight defined', () => {
      const withWeight = scanResult.inventory.talismans.filter(t => t.weight !== undefined);
      expect(withWeight.length).toBeGreaterThanOrEqual(3);
    });

    test('all weapons with passives have valid types (blood/frost/poison/rot/death/sleep/madness)', () => {
      const weaponsWithPassives = scanResult.inventory.weapons.filter(w => w.passives !== undefined);
      for (const weapon of weaponsWithPassives) {
        for (const passive of weapon.passives!) {
          expect(VALID_PASSIVE_TYPES).toContain(passive.type);
        }
      }
    });
  });

  // ────────────────────────────────────────────────────────────
  // 4. Edge cases
  // ────────────────────────────────────────────────────────────

  describe('Golden integration: edge cases', () => {
    test('empty weapon slots have name null and baseId 0', () => {
      const allWeaponSlots = [
        ...scanResult.equipped.rightHand,
        ...scanResult.equipped.leftHand,
      ];

      const emptySlots = allWeaponSlots.filter(s => s.name === null);
      expect(emptySlots.length).toBeGreaterThanOrEqual(1); // at least some slots are empty

      for (const slot of emptySlots) {
        expect(slot.baseId).toBe(0);
      }
    });

    test('empty talisman slots have name null and baseId 0', () => {
      const emptyTalismans = scanResult.equipped.talismans.filter(t => t.name === null);
      expect(emptyTalismans.length).toBeGreaterThanOrEqual(1);

      for (const talisman of emptyTalismans) {
        expect(talisman.baseId).toBe(0);
      }
    });

    test('quickItems includes Flask of Crimson Tears +6 with quantity 10', () => {
      const crimsonFlask = scanResult.equipped.quickItems.find(
        q => q.name !== null && q.name.includes('Flask of Crimson Tears')
      );
      expect(crimsonFlask).toBeDefined();
      expect(crimsonFlask!.name).toContain('+6');
      expect(crimsonFlask!.quantity).toBe(10);
    });

    test('no equipped items have undefined where null is expected', () => {
      // Weapon slots: name should be string or null, never undefined
      const allWeapons = [
        ...scanResult.equipped.rightHand,
        ...scanResult.equipped.leftHand,
      ];
      for (const w of allWeapons) {
        expect(w.name === null || typeof w.name === 'string').toBe(true);
        expect(typeof w.baseId).toBe('number');
      }

      // Armor slots: name should be string or null, never undefined
      const armorSlots = [
        scanResult.equipped.head,
        scanResult.equipped.chest,
        scanResult.equipped.hands,
        scanResult.equipped.legs,
      ];
      for (const a of armorSlots) {
        expect(a.name === null || typeof a.name === 'string').toBe(true);
        expect(typeof a.baseId).toBe('number');
      }

      // Talisman slots: name should be string or null, never undefined
      for (const t of scanResult.equipped.talismans) {
        expect(t.name === null || typeof t.name === 'string').toBe(true);
        expect(typeof t.baseId).toBe('number');
      }

      // Quick items: name should be string or null, never undefined
      for (const q of scanResult.equipped.quickItems) {
        expect(q.name === null || typeof q.name === 'string').toBe(true);
        expect(typeof q.baseId).toBe('number');
      }
    });
  });
});
