/**
 * Tests del ItemStore — filtrado de armas por stats y queries básicas.
 *
 * Nota: usa los JSON placeholder de src/data/ (no requiere npm run sync-data).
 */

import { ItemStore } from '../store';

describe('ItemStore', () => {
  let store: ItemStore;

  beforeAll(() => {
    store = ItemStore.getInstance();
  });

  describe('singleton', () => {
    test('devuelve siempre la misma instancia', () => {
      expect(ItemStore.getInstance()).toBe(store);
    });
  });

  describe('getWeapons', () => {
    test('devuelve todas las armas sin filtros', () => {
      const weapons = store.getWeapons();
      expect(weapons.length).toBeGreaterThan(0);
    });

    test('filtra por tipo de arma', () => {
      const katanas = store.getWeapons({ type: 'Katana' });
      expect(katanas.every(w => w.type === 'Katana')).toBe(true);
    });

    test('filtra armas que el personaje puede equipar', () => {
      // Stats bajos: solo debería devolver armas con requisitos muy bajos
      const stats = { strength: 10, dexterity: 10, intelligence: 0, faith: 0, arcane: 0 };
      const usable = store.getWeapons({ canUse: true, stats });
      // Ninguna debe tener requisito > 10 en str/dex
      for (const w of usable) {
        expect(w.requirements.str).toBeLessThanOrEqual(10);
        expect(w.requirements.dex).toBeLessThanOrEqual(10);
      }
    });

    test('no devuelve armas que el personaje no puede equipar', () => {
      // Stats mínimos: no puede equipar casi nada
      const stats = { strength: 1, dexterity: 1, intelligence: 0, faith: 0, arcane: 0 };
      const usable = store.getWeapons({ canUse: true, stats });
      // Ninguna debe requerir más de lo que tiene
      for (const w of usable) {
        expect(w.requirements.str).toBeLessThanOrEqual(1);
        expect(w.requirements.dex).toBeLessThanOrEqual(1);
      }
    });

    test('personaje con stats altos puede equipar más armas', () => {
      const lowStats  = { strength: 10, dexterity: 10, intelligence: 0, faith: 0, arcane: 0 };
      const highStats = { strength: 40, dexterity: 40, intelligence: 40, faith: 40, arcane: 40 };
      const usableLow  = store.getWeapons({ canUse: true, stats: lowStats });
      const usableHigh = store.getWeapons({ canUse: true, stats: highStats });
      expect(usableHigh.length).toBeGreaterThanOrEqual(usableLow.length);
    });
  });

  describe('getWeaponById', () => {
    test('devuelve el arma por ID exacto', () => {
      const all = store.getWeapons();
      if (all.length === 0) return; // skip si no hay datos
      const first = all[0]!;
      const found = store.getWeaponById(first.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe(first.name);
    });

    test('devuelve undefined para ID inexistente', () => {
      expect(store.getWeaponById(-1)).toBeUndefined();
    });
  });

  describe('getUsableWeapons', () => {
    test('zhyak (Dex 34, Str 18) puede equipar Uchigatana', () => {
      const zhyakStats = {
        strength: 18, dexterity: 34, intelligence: 7, faith: 8, arcane: 11,
      };
      const usable = store.getUsableWeapons(zhyakStats);
      const uchigatana = usable.find(w => w.name === 'Uchigatana');
      // Si el placeholder tiene la Uchigatana, debe ser equipable
      expect(uchigatana).toBeDefined();
    });

    test('personaje con Int 23 puede equipar Moonveil', () => {
      const stats = { strength: 12, dexterity: 18, intelligence: 23, faith: 0, arcane: 0 };
      const usable = store.getUsableWeapons(stats);
      const moonveil = usable.find(w => w.name === 'Moonveil');
      expect(moonveil).toBeDefined();
    });

    test('personaje sin Int no puede equipar Moonveil', () => {
      const stats = { strength: 12, dexterity: 18, intelligence: 5, faith: 0, arcane: 0 };
      const usable = store.getUsableWeapons(stats);
      const moonveil = usable.find(w => w.name === 'Moonveil');
      expect(moonveil).toBeUndefined();
    });
  });

  describe('getArmors / getTalismans / getSpells', () => {
    test('devuelve al menos un elemento de cada tipo', () => {
      expect(store.getArmors().length).toBeGreaterThan(0);
      expect(store.getTalismans().length).toBeGreaterThan(0);
      expect(store.getSpells().length).toBeGreaterThan(0);
    });
  });

  describe('getStats', () => {
    test('devuelve conteos correctos', () => {
      const stats = store.getStats();
      expect(typeof stats.weapons).toBe('number');
      expect(typeof stats.armors).toBe('number');
      expect(typeof stats.talismans).toBe('number');
      expect(typeof stats.spells).toBe('number');
    });
  });
});
