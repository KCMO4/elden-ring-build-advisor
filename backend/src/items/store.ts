/**
 * ItemStore — base de datos de ítems de Elden Ring en memoria.
 *
 * Carga los JSON estáticos (generados por scripts/sync-data.ts) una sola
 * vez al arrancar el servidor y expone queries tipadas sobre ellos.
 *
 * Uso:
 *   const store = ItemStore.getInstance();
 *   const weapons = store.getWeapons({ type: 'Katana' });
 */

import path from 'path';
import type { Weapon, Armor, Talisman, Spell, WeaponFilter, CharacterStatsForFilter } from './types';

// JSON estáticos en src/data/
const DATA_DIR = path.join(__dirname, '..', 'data');

function loadJson<T>(filename: string): T[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(path.join(DATA_DIR, filename)) as T[];
  } catch {
    console.warn(`[ItemStore] No se pudo cargar ${filename}. Ejecuta: npm run sync-data`);
    return [];
  }
}

export class ItemStore {
  private static instance: ItemStore | null = null;

  private readonly weapons:   Weapon[];
  private readonly armors:    Armor[];
  private readonly talismans: Talisman[];
  private readonly spells:    Spell[];

  private readonly weaponsByName:   Map<string, Weapon>;
  private readonly armorsByName:    Map<string, Armor>;
  private readonly talismansByName: Map<string, Talisman>;

  private constructor() {
    this.weapons   = loadJson<Weapon>('weapons.json');
    this.armors    = loadJson<Armor>('armors.json');
    this.talismans = loadJson<Talisman>('talismans.json');
    this.spells    = loadJson<Spell>('spells.json');

    this.weaponsByName   = new Map(this.weapons.map(w => [w.name.toLowerCase(), w]));
    this.armorsByName    = new Map(this.armors.map(a => [a.name.toLowerCase(), a]));
    this.talismansByName = new Map(this.talismans.map(t => [t.name.toLowerCase(), t]));

    console.log(
      `[ItemStore] Cargados: ${this.weapons.length} armas, ` +
      `${this.armors.length} armaduras, ` +
      `${this.talismans.length} talismanes, ` +
      `${this.spells.length} hechizos`,
    );
  }

  static getInstance(): ItemStore {
    if (!ItemStore.instance) {
      ItemStore.instance = new ItemStore();
    }
    return ItemStore.instance;
  }

  // ── Armas ───────────────────────────────────────────────────

  getWeapons(filter?: WeaponFilter): Weapon[] {
    let result = [...this.weapons];

    if (filter?.type) {
      result = result.filter(w => w.type === filter.type);
    }

    if (filter?.canUse && filter.stats) {
      result = result.filter(w => canEquipWeapon(w, filter.stats!));
    }

    return result;
  }

  getWeaponById(id: number): Weapon | undefined {
    return this.weapons.find(w => w.id === id);
  }

  /**
   * Busca un arma por ID base (bits 27:0 del itemId del .sl2).
   * Útil para resolver IDs leídos del inventario.
   */
  getWeaponByBaseId(baseId: number): Weapon | undefined {
    return this.weapons.find(w => w.id === baseId);
  }

  getWeaponByName(name: string): Weapon | undefined {
    return this.weaponsByName.get(name.toLowerCase());
  }

  // ── Armaduras ───────────────────────────────────────────────

  getArmors(): Armor[] {
    return [...this.armors];
  }

  getArmorById(id: number): Armor | undefined {
    return this.armors.find(a => a.id === id);
  }

  getArmorByBaseId(baseId: number): Armor | undefined {
    return this.armors.find(a => a.id === baseId);
  }

  getArmorByName(name: string): Armor | undefined {
    return this.armorsByName.get(name.toLowerCase());
  }

  // ── Talismanes ──────────────────────────────────────────────

  getTalismans(): Talisman[] {
    return [...this.talismans];
  }

  getTalismanById(id: number): Talisman | undefined {
    return this.talismans.find(t => t.id === id);
  }

  getTalismanByBaseId(baseId: number): Talisman | undefined {
    return this.talismans.find(t => t.id === baseId);
  }

  getTalismanByName(name: string): Talisman | undefined {
    return this.talismansByName.get(name.toLowerCase());
  }

  // ── Hechizos ────────────────────────────────────────────────

  getSpells(): Spell[] {
    return [...this.spells];
  }

  getSpellById(id: number): Spell | undefined {
    return this.spells.find(s => s.id === id);
  }

  getSpellByBaseId(baseId: number): Spell | undefined {
    return this.spells.find(s => s.id === baseId);
  }

  // ── Utilidades ──────────────────────────────────────────────

  /**
   * Devuelve todas las armas que el personaje puede equipar
   * dado su bloque de stats actual.
   */
  getUsableWeapons(stats: CharacterStatsForFilter): Weapon[] {
    return this.weapons.filter(w => canEquipWeapon(w, stats));
  }

  /** Stats de carga para debug */
  getStats(): { weapons: number; armors: number; talismans: number; spells: number } {
    return {
      weapons:   this.weapons.length,
      armors:    this.armors.length,
      talismans: this.talismans.length,
      spells:    this.spells.length,
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Devuelve true si el personaje cumple los requisitos de stats del arma.
 * En Elden Ring, si no cumples el requisito de Str/Dex el daño se penaliza;
 * si no cumples Int/Fai/Arc no puedes ni equiparla.
 */
function canEquipWeapon(weapon: Weapon, stats: CharacterStatsForFilter): boolean {
  const { str = 1, dex = 1, int = 1, fai = 1, arc = 1 } = {
    str: stats.strength,
    dex: stats.dexterity,
    int: stats.intelligence,
    fai: stats.faith,
    arc: stats.arcane,
  };

  return (
    str >= weapon.requirements.str &&
    dex >= weapon.requirements.dex &&
    int >= weapon.requirements.int &&
    fai >= weapon.requirements.fai &&
    arc >= weapon.requirements.arc
  );
}
