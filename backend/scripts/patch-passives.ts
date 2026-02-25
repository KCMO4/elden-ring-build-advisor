/**
 * patch-passives.ts — Overlay passive effects (status buildup) onto weapons.json
 *
 * Fuente: Community datamine de EquipParamWeapon + SpEffectParam.
 * Valores base (+0, sin upgrade) de buildup por arma.
 *
 * Uso:
 *   npm run patch-passives
 *
 * Los datos se aplican directamente al weapons.json existente.
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'src', 'data');

interface PassiveEffect {
  type: 'blood' | 'frost' | 'poison' | 'rot' | 'death' | 'sleep' | 'madness';
  buildup: number;
}

interface Weapon {
  id: number;
  name: string;
  passives: PassiveEffect[];
  [key: string]: unknown;
}

// ── Known weapon passives (base +0 values) ──────────────────────────
// Source: Fextralife wiki + community datamine
// Only weapons with innate (non-infusion) passives are listed.
const WEAPON_PASSIVES: Record<string, PassiveEffect[]> = {
  // ── Blood (Hemorrhage) ──────────────────────────────────────
  'Uchigatana':                  [{ type: 'blood', buildup: 45 }],
  'Nagakiba':                    [{ type: 'blood', buildup: 45 }],
  'Rivers of Blood':             [{ type: 'blood', buildup: 52 }],
  'Moonveil':                    [{ type: 'blood', buildup: 50 }],
  'Reduvia':                     [{ type: 'blood', buildup: 30 }],
  'Bloody Helice':               [{ type: 'blood', buildup: 55 }],
  'Eleonora\'s Poleblade':       [{ type: 'blood', buildup: 55 }],
  'Morgott\'s Cursed Sword':     [{ type: 'blood', buildup: 60 }],
  'Ghiza\'s Wheel':              [{ type: 'blood', buildup: 70 }],
  'Bloodhound\'s Fang':          [{ type: 'blood', buildup: 55 }],
  'Regalia of Eochaid':          [{ type: 'blood', buildup: 50 }],
  'Cross-Naginata':              [{ type: 'blood', buildup: 45 }],
  'Spiked Caestus':              [{ type: 'blood', buildup: 30 }],
  'Hookclaws':                   [{ type: 'blood', buildup: 35 }],
  'Venomous Fang':               [{ type: 'blood', buildup: 0 }], // only poison
  'Bloodstained Dagger':         [{ type: 'blood', buildup: 30 }],
  'Great Stars':                 [{ type: 'blood', buildup: 55 }],
  'Mohgwyn\'s Sacred Spear':     [{ type: 'blood', buildup: 73 }],
  'Scavenger\'s Curved Sword':   [{ type: 'blood', buildup: 45 }],
  'Shotel':                      [{ type: 'blood', buildup: 50 }],
  'Hoslow\'s Petal Whip':        [{ type: 'blood', buildup: 55 }],
  'Thorned Whip':                [{ type: 'blood', buildup: 50 }],
  'Godskin Peeler':              [{ type: 'blood', buildup: 55 }],
  'Winged Scythe':               [{ type: 'blood', buildup: 55 }],
  'Grave Scythe':                [{ type: 'blood', buildup: 55 }],
  'Halo Scythe':                 [{ type: 'blood', buildup: 55 }],
  'Spiked Spear':                [{ type: 'blood', buildup: 50 }],
  'Flamberge':                   [{ type: 'blood', buildup: 55 }],
  'Spiked Club':                 [{ type: 'blood', buildup: 50 }],
  'Morning Star':                [{ type: 'blood', buildup: 50 }],
  'Marais Executioner\'s Sword': [{ type: 'blood', buildup: 55 }],

  // ── Frost (Frostbite) ──────────────────────────────────────
  'Icerind Hatchet':             [{ type: 'frost', buildup: 60 }],
  'Death\'s Poker':              [{ type: 'frost', buildup: 75 }],
  'Helphen\'s Steeple':          [{ type: 'frost', buildup: 70 }],
  'Dark Moon Greatsword':        [{ type: 'frost', buildup: 55 }],
  'Bastard\'s Stars':            [{ type: 'frost', buildup: 65 }],
  'Zamor Curved Sword':          [{ type: 'frost', buildup: 60 }],
  'Frozen Needle':               [{ type: 'frost', buildup: 50 }],

  // ── Poison ──────────────────────────────────────────────────
  'Serpent Bow':                 [{ type: 'poison', buildup: 37 }],
  'Coil Shield':                 [{ type: 'poison', buildup: 80 }],
  'Antspur Rapier':              [{ type: 'rot', buildup: 50 }],
  'Venomous Fang ':              [{ type: 'poison', buildup: 45 }], // note: separate from blood entry

  // ── Scarlet Rot ─────────────────────────────────────────────
  'Rotten Crystal Sword':        [{ type: 'rot', buildup: 50 }],
  'Rotten Crystal Spear':        [{ type: 'rot', buildup: 50 }],
  'Rotten Battle Hammer':        [{ type: 'rot', buildup: 50 }],
  'Rotten Greataxe':             [{ type: 'rot', buildup: 50 }],
  'Rotten Staff':                [{ type: 'rot', buildup: 55 }],

  // ── Sleep ───────────────────────────────────────────────────
  'Sword of St Trina':           [{ type: 'sleep', buildup: 66 }],
  'St Trina\'s Torch':           [{ type: 'sleep', buildup: 72 }],

  // ── Madness ─────────────────────────────────────────────────
  'Vyke\'s War Spear':           [{ type: 'madness', buildup: 65 }],

  // ── Death (Instant Death) ──────────────────────────────────
  'Eclipse Shotel':              [{ type: 'death', buildup: 60 }],
  'Inseparable Sword':           [{ type: 'death', buildup: 60 }],
  'Rosus\' Axe':                 [{ type: 'death', buildup: 55 }],
  'Death Ritual Spear':          [{ type: 'death', buildup: 50 }],
  'Explosive Ghostflame':        [{ type: 'death', buildup: 48 }],
};

// Fix: Venomous Fang should have poison
WEAPON_PASSIVES['Venomous Fang'] = [{ type: 'poison', buildup: 45 }];

// ── Shield passives (very few shields have innate status buildup) ──────────
const SHIELD_PASSIVES: Record<string, PassiveEffect[]> = {
  'Shield Of The Guilty':   [{ type: 'blood', buildup: 50 }],
  'Spiked Palisade Shield': [{ type: 'blood', buildup: 50 }],
};

interface Shield {
  name: string;
  passives?: PassiveEffect[];
  [key: string]: unknown;
}

function main(): void {
  // Patch weapons
  const weaponsPath = path.join(DATA_DIR, 'weapons.json');
  if (!fs.existsSync(weaponsPath)) {
    console.error('weapons.json not found. Run npm run sync-data first.');
    process.exit(1);
  }

  const weapons: Weapon[] = JSON.parse(fs.readFileSync(weaponsPath, 'utf8'));
  let patched = 0;

  for (const w of weapons) {
    const passives = WEAPON_PASSIVES[w.name];
    if (passives && passives.length > 0 && passives[0].buildup > 0) {
      w.passives = passives;
      patched++;
    }
  }

  fs.writeFileSync(weaponsPath, JSON.stringify(weapons, null, 2), 'utf-8');
  console.log(`[patch-passives] Patched ${patched}/${weapons.length} weapons with passive effects.`);
  console.log(`  Saved: ${weaponsPath}`);

  // Patch shields
  const shieldsPath = path.join(DATA_DIR, 'shields.json');
  if (fs.existsSync(shieldsPath)) {
    const shields: Shield[] = JSON.parse(fs.readFileSync(shieldsPath, 'utf8'));
    let shieldPatched = 0;

    for (const s of shields) {
      const passives = SHIELD_PASSIVES[s.name];
      if (passives && passives.length > 0) {
        s.passives = passives;
        shieldPatched++;
      }
    }

    fs.writeFileSync(shieldsPath, JSON.stringify(shields, null, 2), 'utf-8');
    console.log(`[patch-passives] Patched ${shieldPatched}/${shields.length} shields with passive effects.`);
    console.log(`  Saved: ${shieldsPath}`);
  }
}

main();
