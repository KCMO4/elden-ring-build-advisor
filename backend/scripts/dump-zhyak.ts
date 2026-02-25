/**
 * Dump Zhyak's save data for golden test reference.
 * Two-step process matching index.ts pipeline:
 *   1. parseSl2(buf) → slots with name/level/stats
 *   2. scanInventory(slotData, level) → equipped + inventory
 */
import * as fs from 'fs';
import { parseSl2 } from '../src/parser';
import { scanInventory } from '../src/inventory';
import { SLOT } from '../src/parser/constants';
import { ItemStore } from '../src/items';

// Initialize ItemStore (required by scanInventory)
ItemStore.getInstance();

const savePath = '/mnt/c/Users/pacho/AppData/Roaming/EldenRing/76561198241678230/ER0000.sl2';
const buf = Buffer.from(fs.readFileSync(savePath));
const result = parseSl2(buf);

// Find Zhyak's slot
const zhyakSlot = result.slots.find(s => s.active && s.character?.name === 'Zhyak');
if (!zhyakSlot || !zhyakSlot.character) {
  console.log('Zhyak not found! Active slots:');
  result.slots.filter(s => s.active).forEach(s =>
    console.log(`  Slot ${s.index}: ${s.character?.name} (Lv${s.character?.level})`)
  );
  process.exit(1);
}

const char = zhyakSlot.character;

// Extract slot data (same as index.ts line 79-83)
const slotOffset = SLOT.DATA_BASE + zhyakSlot.index * SLOT.DATA_STRIDE;
const slotEnd = slotOffset + SLOT.DATA_SIZE;
const slotData = buf.subarray(slotOffset, slotEnd);

// Scan inventory
const inventoryData = scanInventory(slotData, char.level);

console.log('=== ZHYAK BASIC ===');
console.log('Level:', char.level, 'Slot:', zhyakSlot.index);
console.log('Stats:', JSON.stringify(char.stats));

console.log('\n=== EQUIPPED WEAPONS (Right Hand) ===');
inventoryData.equipped.rightHand.forEach((w: any, i: number) => console.log(i, JSON.stringify({
  name: w.name, baseId: w.baseId, upgradeLevel: w.upgradeLevel,
  infusion: w.infusion, itemType: w.itemType,
  requirements: w.requirements,
  passives: w.passives,
  skill: w.skill,
  hasDefense: !!w.defense, hasDamage: !!w.damage,
})));

console.log('\n=== EQUIPPED WEAPONS (Left Hand) ===');
inventoryData.equipped.leftHand.forEach((w: any, i: number) => console.log(i, JSON.stringify({
  name: w.name, baseId: w.baseId, upgradeLevel: w.upgradeLevel,
  infusion: w.infusion, itemType: w.itemType,
  requirements: w.requirements,
  passives: w.passives,
  stability: w.stability,
  skill: w.skill,
})));

console.log('\n=== EQUIPPED ARMOR ===');
for (const slot of ['head', 'chest', 'hands', 'legs'] as const) {
  const a = (inventoryData.equipped as any)[slot];
  console.log(slot, JSON.stringify({
    name: a.name, baseId: a.baseId, itemType: a.itemType,
    poise: a.poise, weight: a.weight,
    defense: a.defense,
    immunity: a.immunity, robustness: a.robustness,
    focus: a.focus, vitality: a.vitality,
  }));
}

console.log('\n=== EQUIPPED TALISMANS ===');
inventoryData.equipped.talismans.forEach((t: any, i: number) => console.log(i, JSON.stringify({
  name: t.name, baseId: t.baseId,
  effect: t.effect ? t.effect.substring(0, 50) + '...' : null,
})));

console.log('\n=== INVENTORY COUNTS ===');
const inv = inventoryData.inventory;
console.log(JSON.stringify({
  weapons: inv.weapons.length,
  armors: inv.armors.length,
  talismans: inv.talismans.length,
  spells: inv.spells.length,
  spirits: inv.spirits.length,
  ashesOfWar: inv.ashesOfWar.length,
  consumables: inv.consumables.length,
  materials: inv.materials.length,
  upgrades: inv.upgrades.length,
  crystalTears: inv.crystalTears.length,
  keyItems: inv.keyItems.length,
  cookbooks: inv.cookbooks.length,
  multiplayer: inv.multiplayer.length,
  ammos: inv.ammos.length,
}));

console.log('\n=== INVENTORY - Weapons with passives ===');
inv.weapons.filter((w: any) => w.passives && w.passives.length > 0).forEach((w: any) =>
  console.log(JSON.stringify({ name: w.name, passives: w.passives, requirements: w.requirements, itemType: w.itemType }))
);

console.log('\n=== INVENTORY - Weapons with requirements ===');
inv.weapons.filter((w: any) => w.requirements).slice(0, 5).forEach((w: any) =>
  console.log(JSON.stringify({ name: w.name, requirements: w.requirements, itemType: w.itemType }))
);

console.log('\n=== INVENTORY - Armors with poise ===');
inv.armors.filter((a: any) => a.poise > 0).slice(0, 5).forEach((a: any) =>
  console.log(JSON.stringify({ name: a.name, poise: a.poise, immunity: a.immunity, robustness: a.robustness, focus: a.focus, vitality: a.vitality, itemType: a.itemType }))
);

console.log('\n=== INVENTORY - Spells with cost/slots ===');
inv.spells.filter((s: any) => s.cost !== undefined).slice(0, 5).forEach((s: any) =>
  console.log(JSON.stringify({ name: s.name, cost: s.cost, slots: s.slots, requirements: s.requirements, description: s.description?.substring(0, 80), itemType: s.itemType }))
);

console.log('\n=== INVENTORY - Talismans with weight ===');
inv.talismans.filter((t: any) => t.weight !== undefined).slice(0, 5).forEach((t: any) =>
  console.log(JSON.stringify({ name: t.name, weight: t.weight, effect: t.effect?.substring(0, 50) }))
);

console.log('\n=== SPELL SLOTS ===');
(inventoryData.equipped.spellSlots || []).forEach((s: any, i: number) =>
  console.log(i, JSON.stringify({ name: s.name, baseId: s.baseId }))
);

console.log('\n=== QUICK ITEMS (non-empty) ===');
inventoryData.equipped.quickItems.filter((q: any) => q.name).forEach((q: any, i: number) =>
  console.log(i, JSON.stringify({ name: q.name, quantity: q.quantity }))
);

console.log('\n=== MEMORY SLOT COUNT ===', inventoryData.equipped.memorySlotCount);

console.log('\n=== ALL CHARACTERS ===');
result.slots.filter(s => s.active).forEach(s =>
  console.log(`  Slot ${s.index}: ${s.character?.name} (Lv${s.character?.level})`)
);
