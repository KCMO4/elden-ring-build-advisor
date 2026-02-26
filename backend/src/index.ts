import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

import { parseSl2, hexDump, summaryOffsetsForSlot, ParseError } from './parser/index';
import { findStats } from './parser/stats';
import { ItemStore, getAdvisorResult } from './items/index';
import { scanInventory } from './inventory/index';
import type { CharacterStatsForFilter } from './items/types';

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3001;

// ── Inicializar ItemStore al arrancar ───────────────────────
ItemStore.getInstance();

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(compression());
app.use(express.json());
app.use('/images', express.static(path.join(__dirname, 'data', 'images'), {
  maxAge: '1y',
  immutable: true,
}));

// ── Multer: acepta solo .sl2 en memoria (máx. 50 MB) ──────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.sl2') {
      cb(null, true);
    } else {
      cb(new Error('Solo se aceptan archivos .sl2'));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ── GET /health ─────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    items: ItemStore.getInstance().getStats(),
  });
});

// ── POST /api/parse ─────────────────────────────────────────────────────────
/**
 * Recibe un archivo .sl2, parsea todos los slots y devuelve:
 *   - Lista de personajes activos con nombre, nivel, playtime, atributos.
 *   - Ítems equipados y resumen de inventario (armas, armaduras, talismanes, hechizos).
 *
 * Body: multipart/form-data con campo "savefile" (archivo .sl2)
 *
 * Query param: inventory=true (default false) — incluye el inventario completo
 */
app.post('/api/parse', upload.single('savefile'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No se recibió ningún archivo .sl2' });
    return;
  }

  let result;
  try {
    result = parseSl2(req.file.buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido al parsear el archivo';
    res.status(422).json({ error: message });
    return;
  }

  const includeInventory = req.query['inventory'] === 'true';
  const buf    = req.file.buffer;

  const activeSlots = result.slots.filter(s => s.active);

  const characters = activeSlots.map(slot => {
    const char = slot.character!;

    // Extraer slot data para escanear inventario
    const slotOffset = 0x310 + slot.index * 0x280010;
    const slotEnd    = slotOffset + 0x280000;
    const slotData   = (slotEnd <= buf.length)
      ? buf.subarray(slotOffset, slotEnd)
      : undefined;

    const inventoryData = slotData ? scanInventory(slotData, char.level) : null;

    // Leer runas actuales: vigor_offset + 0x30 (uint32 LE)
    // Fuente: ClayAmore/ER-Save-Editor, campo `souls` en PlayerGameData
    let heldRunes = 0;
    if (slotData) {
      const statsResult = findStats(slotData, char.level);
      if (statsResult) {
        const runeOffset = statsResult.foundAtOffset + 0x30;
        if (runeOffset + 4 <= slotData.length) {
          heldRunes = slotData.readUInt32LE(runeOffset);
        }
      }
    }

    const base = {
      slot:      slot.index,
      name:      char.name,
      level:     char.level,
      playtime:  formatPlaytime(char.playtimeSeconds),
      heldRunes,
      stats:     char.stats,
      equipped: inventoryData
        ? {
            rightHand:       inventoryData.equipped.rightHand,
            leftHand:        inventoryData.equipped.leftHand,
            head:            inventoryData.equipped.head,
            chest:           inventoryData.equipped.chest,
            hands:           inventoryData.equipped.hands,
            legs:            inventoryData.equipped.legs,
            talismans:       inventoryData.equipped.talismans,
            quickItems:      inventoryData.equipped.quickItems,
            pouch:           inventoryData.equipped.pouch,
            greatRune:       inventoryData.equipped.greatRune,
            physickTears:    inventoryData.equipped.physickTears,
            spellSlots:      inventoryData.equipped.spellSlots,
            memorySlotCount: inventoryData.equipped.memorySlotCount,
          }
        : null,
    };

    if (includeInventory && inventoryData) {
      const inv = inventoryData.inventory;
      return {
        ...base,
        inventory: {
          weapons:      inv.weapons,
          ammos:        inv.ammos,
          armors:       inv.armors,
          talismans:    inv.talismans,
          spells:       inv.spells,
          spirits:      inv.spirits,
          ashesOfWar:   inv.ashesOfWar,
          consumables:  inv.consumables,
          materials:    inv.materials,
          upgrades:     inv.upgrades,
          crystalTears: inv.crystalTears,
          keyItems:     inv.keyItems,
          cookbooks:    inv.cookbooks,
          multiplayer:  inv.multiplayer,
        },
      };
    }

    return base;
  });

  res.json({
    fileSize:    result.fileSize,
    totalSlots:  result.slots.length,
    activeSlots: activeSlots.length,
    characters,
  });
});

// ── POST /api/debug ──────────────────────────────────────────────────────────
/**
 * Herramienta de diagnóstico: devuelve hex dumps de los offsets clave
 * para verificar que el parser lee en las posiciones correctas.
 *
 * Query params:
 *   slot   (0-9)     — slot a inspeccionar (default: 0)
 *   offset (hex/dec) — offset adicional para dump libre
 *   length (dec)     — bytes a mostrar (default: 64)
 */
app.post('/api/debug', upload.single('savefile'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No se recibió ningún archivo .sl2' });
    return;
  }

  const buf    = req.file.buffer;
  const slot   = Math.min(9, Math.max(0, Number(req.query['slot'] ?? 0)));
  const length = Number(req.query['length'] ?? 64);

  const offsets = summaryOffsetsForSlot(slot);

  const slotDataStart = 0x310 + slot * 0x280010;
  const slotData      = buf.subarray(slotDataStart, slotDataStart + 0x280000);

  const dumps: Record<string, string> = {
    bnd4Header:   hexDump(buf, 0x00, 64, 'BND4 Header'),
    activeStatus: hexDump(buf, offsets['activeStatus'], 10, `Estado activo (slots 0-9)`),
    nameRegion:   hexDump(buf, offsets['nameStart'], 48, `Nombre del slot ${slot}`),
    equipmentBase: hexDump(
      buf,
      slotDataStart + 0x370,
      80,
      `Equipo del slot ${slot} (offset 0x370 en slot data)`,
    ),
  };

  // Dump libre si se especifica un offset
  const rawOffset = req.query['offset'];
  if (rawOffset) {
    const customOffset = rawOffset.toString().startsWith('0x')
      ? parseInt(rawOffset.toString(), 16)
      : parseInt(rawOffset.toString(), 10);
    dumps['custom'] = hexDump(buf, customOffset, length, `Offset personalizado`);
  }

  // ── Dump de ChrAsm2 (equipamiento equipado) ─────────────────────────────────
  // ?level=N  → busca vigor con findStats, computa ChrAsm2 = vigor_offset + 0x310
  // y muestra los 22 gaitem_handles que contiene.
  let chrAsm2Dump: Record<string, string | number | null> | undefined;
  const rawLevel = req.query['level'];
  if (rawLevel !== undefined) {
    const level = parseInt(rawLevel.toString(), 10);
    if (!isNaN(level)) {
      const statsResult = findStats(slotData, level);
      if (statsResult) {
        const vigorOff   = statsResult.foundAtOffset;
        const chrAsm2Off = vigorOff + 0x310;

        // Leer los 22 campos de ChrAsm2 (orden: LH1,RH1, LH2,RH2, LH3,RH3,
        //  arrows[2], bolts[2], _unk0, _unk1, head, chest, arms, legs, _unk2,
        //  talismans[4], _unk3)
        const r = (rel: number) =>
          chrAsm2Off + rel < slotData.length
            ? `0x${slotData.readUInt32LE(chrAsm2Off + rel).toString(16).padStart(8, '0')}`
            : null;

        // Layout ChrAsm2 (96 bytes = 0x60):
        // +0x30/+0x34 son campos desconocidos (Rust los etiqueta como head/chest, INCORRECTO).
        // Los verdaderos slots de armadura están en +0x38..+0x44.
        // Talismanes en +0x4C..+0x58.
        chrAsm2Dump = {
          vigorOffset:   `slot+0x${vigorOff.toString(16)}`,
          chrAsm2Offset: `slot+0x${chrAsm2Off.toString(16)}`,
          LH1_handle:    r(0x00),
          RH1_handle:    r(0x04),
          LH2_handle:    r(0x08),
          RH2_handle:    r(0x0C),
          LH3_handle:    r(0x10),
          RH3_handle:    r(0x14),
          arrows1:       r(0x18),
          bolts1:        r(0x1C),
          arrows2:       r(0x20),
          bolts2:        r(0x24),
          _unk0:         r(0x28),
          _unk1:         r(0x2C),
          _unk2:         r(0x30),
          _unk3:         r(0x34),
          head:          r(0x38),
          chest:         r(0x3C),
          arms:          r(0x40),
          legs:          r(0x44),
          _unk4:         r(0x48),
          talisman1:     r(0x4C),
          talisman2:     r(0x50),
          talisman3:     r(0x54),
          talisman4:     r(0x58),
          _unk5:         r(0x5C),
          rawDump:       hexDump(
            buf,
            slotDataStart + chrAsm2Off,
            0x60,
            `ChrAsm2 (slot+0x${chrAsm2Off.toString(16)})`,
          ),
        };
      } else {
        chrAsm2Dump = { error: `No se encontraron stats con level=${level} en este slot` };
      }
    }
  }

  // ── Búsqueda de uint32 en el slot data ──────────────────────────────────────
  // ?search=0x00895440  busca Uchigatana en el slot
  // ?search=9000000     ídem en decimal
  // Retorna los primeros 30 offsets donde aparece el valor (relativos al slot data)
  const rawSearch = req.query['search'];
  let searchResults: { value: string; foundAt: string[]; nearbyDump: string[] } | undefined;
  if (rawSearch) {
    const searchVal = rawSearch.toString().startsWith('0x')
      ? parseInt(rawSearch.toString(), 16)
      : parseInt(rawSearch.toString(), 10);

    const found: number[] = [];
    for (let i = 0; i <= slotData.length - 4; i++) {
      if (slotData.readUInt32LE(i) === searchVal) {
        found.push(i);
        if (found.length >= 30) break;
      }
    }

    // Para los primeros 5 hits, muestra 32 bytes de contexto (relativos al archivo)
    const nearbyDump = found.slice(0, 5).map(localOff => {
      const absOff = slotDataStart + localOff;
      const start  = Math.max(0, absOff - 8);
      return hexDump(buf, start, 48, `Match en slot+0x${localOff.toString(16)} (abs 0x${absOff.toString(16)})`);
    });

    searchResults = {
      value:      `0x${searchVal.toString(16).padStart(8, '0')} (${searchVal})`,
      foundAt:    found.map(o => `slot+0x${o.toString(16).padStart(6, '0')} (abs 0x${(slotDataStart + o).toString(16)})`),
      nearbyDump,
    };
  }

  // ── Búsqueda de rango de IDs de armas reales de Elden Ring ──────────────────
  // ?scanWeapons=true  busca valores en el rango 9000000–9999999 dentro del slot
  // (Estos son los IDs reales de armas en el save file, sin bits de categoría)
  let weaponScan: { hits: Array<{ offset: string; value: string }> } | undefined;
  if (req.query['scanWeapons'] === 'true') {
    // Rangos de IDs reales de armas de Elden Ring en el save file
    // (verificados contra Deskete/EldenRingResources y ClayAmore/ER-Save-Editor)
    const WEAPON_RANGES: Array<[number, number, string]> = [
      [1000000,  1999999, 'Dagger'],
      [2000000,  2999999, 'Straight Sword'],
      [3000000,  3999999, 'Greatsword'],
      [4000000,  4999999, 'Colossal Sword'],
      [5000000,  5999999, 'Thrusting Sword'],
      [6000000,  6999999, 'Heavy Thrusting'],
      [7000000,  7999999, 'Curved Sword'],
      [8000000,  8999999, 'Curved Greatsword'],
      [9000000,  9999999, 'Katana'],
      [10000000, 10999999, 'Twinblade'],
      [11000000, 11999999, 'Hammer'],
      [12000000, 12999999, 'Great Hammer'],
      [13000000, 13999999, 'Flail'],
      [14000000, 14999999, 'Axe'],
      [15000000, 15999999, 'Greataxe'],
      [16000000, 16999999, 'Spear'],
      [17000000, 17999999, 'Great Spear'],
      [18000000, 18999999, 'Halberd'],
      [19000000, 19999999, 'Scythe'],
      [20000000, 20999999, 'Whip'],
      [21000000, 21999999, 'Fist'],
      [22000000, 22999999, 'Claw'],
      [24000000, 24999999, 'Torch'],
      [33000000, 33999999, 'Glintstone Staff'],
      [34000000, 34999999, 'Sacred Seal'],
      [40000000, 40999999, 'Light Bow'],
      [41000000, 41999999, 'Bow'],
      [42000000, 42999999, 'Greatbow'],
      [43000000, 43999999, 'Crossbow'],
    ];

    const isWeaponId = (v: number): string | null => {
      for (const [min, max, type] of WEAPON_RANGES) {
        if (v >= min && v <= max) return type;
      }
      return null;
    };

    const MIN_WEP = 1000000;
    const MAX_WEP = 43999999;
    const hits: Array<{ offset: string; value: string }> = [];
    for (let i = 0; i <= slotData.length - 4; i++) {
      const val = slotData.readUInt32LE(i);
      if (val >= MIN_WEP && val <= MAX_WEP) {
        const wepType = isWeaponId(val);
        if (!wepType) continue;
        hits.push({
          offset: `slot+0x${i.toString(16).padStart(6, '0')} (abs 0x${(slotDataStart + i).toString(16)})`,
          value:  `${val} (0x${val.toString(16)}) — ${wepType}`,
        });
        if (hits.length >= 50) break;
      }
    }
    weaponScan = { hits };
  }

  res.json({
    fileSize: buf.length,
    slot,
    slotDataStart: `0x${slotDataStart.toString(16)}`,
    knownOffsets: offsets,
    dumps,
    ...(chrAsm2Dump   ? { chrAsm2Dump }   : {}),
    ...(searchResults ? { searchResults } : {}),
    ...(weaponScan    ? { weaponScan }    : {}),
  });
});

// ── GET /api/items/weapons ───────────────────────────────────────────────────
/**
 * Lista armas con filtros opcionales vía query params:
 *   type     — tipo de arma (e.g. "Katana", "Greatsword")
 *   str, dex, int, fai, arc — stats del personaje (para filtrar por canUse)
 *   canUse   — "true" para devolver solo armas equipables con los stats dados
 */
app.get('/api/items/weapons', (req: Request, res: Response) => {
  const store = ItemStore.getInstance();

  const stats = parseStatsFromQuery(req.query);
  const canUse = req.query['canUse'] === 'true';

  const weapons = store.getWeapons({
    type: req.query['type'] as string | undefined as never,
    canUse: canUse && stats !== null,
    stats: stats ?? undefined,
  });

  res.json({ count: weapons.length, data: weapons });
});

// ── GET /api/items/weapons/:id ───────────────────────────────────────────────
app.get('/api/items/weapons/:id', (req: Request, res: Response) => {
  const id = parseInt(String(req.params['id'] ?? ''), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }
  const weapon = ItemStore.getInstance().getWeaponById(id);
  if (!weapon) {
    res.status(404).json({ error: `Arma con ID ${id} no encontrada` });
    return;
  }
  res.json(weapon);
});

// ── GET /api/items/armors ────────────────────────────────────────────────────
app.get('/api/items/armors', (_req: Request, res: Response) => {
  const armors = ItemStore.getInstance().getArmors();
  res.json({ count: armors.length, data: armors });
});

// ── GET /api/items/talismans ─────────────────────────────────────────────────
app.get('/api/items/talismans', (_req: Request, res: Response) => {
  const talismans = ItemStore.getInstance().getTalismans();
  res.json({ count: talismans.length, data: talismans });
});

// ── GET /api/items/spells ────────────────────────────────────────────────────
app.get('/api/items/spells', (_req: Request, res: Response) => {
  const spells = ItemStore.getInstance().getSpells();
  res.json({ count: spells.length, data: spells });
});

// ── GET /api/items/shields ───────────────────────────────────────────────────
app.get('/api/items/shields', (_req: Request, res: Response) => {
  const shields = ItemStore.getInstance().getShields();
  res.json({ count: shields.length, data: shields });
});

// ── GET /api/items/ashes ─────────────────────────────────────────────────────
app.get('/api/items/ashes', (_req: Request, res: Response) => {
  const ashes = ItemStore.getInstance().getAshes();
  res.json({ count: ashes.length, data: ashes });
});

// ── GET /api/items/spirits ───────────────────────────────────────────────────
app.get('/api/items/spirits', (_req: Request, res: Response) => {
  const spirits = ItemStore.getInstance().getSpirits();
  res.json({ count: spirits.length, data: spirits });
});

// ── GET /api/items/consumables ───────────────────────────────────────────────
app.get('/api/items/consumables', (_req: Request, res: Response) => {
  const consumables = ItemStore.getInstance().getConsumables();
  res.json({ count: consumables.length, data: consumables });
});

// ── GET /api/scaling ─────────────────────────────────────────────────────────
/**
 * Serves exact weapon scaling data (CalcCorrectGraph, per-weapon scaling, reinforce params).
 * Generated by `npm run sync-scaling`. Returns empty {} if data files not yet generated.
 */
app.get('/api/scaling', (_req: Request, res: Response) => {
  try {
    const dataDir = path.join(__dirname, 'data');
    const graphsPath = path.join(dataDir, 'calcCorrectGraphs.json');
    const weaponPath = path.join(dataDir, 'weaponScaling.json');
    const reinforcePath = path.join(dataDir, 'reinforceParams.json');

    if (!fs.existsSync(graphsPath) || !fs.existsSync(weaponPath) || !fs.existsSync(reinforcePath)) {
      res.json({ available: false });
      return;
    }

    const graphs = JSON.parse(fs.readFileSync(graphsPath, 'utf8'));
    const weapons = JSON.parse(fs.readFileSync(weaponPath, 'utf8'));
    const reinforce = JSON.parse(fs.readFileSync(reinforcePath, 'utf8'));

    res.json({ available: true, graphs, weapons, reinforce });
  } catch {
    res.json({ available: false });
  }
});

// ── GET /api/builds ──────────────────────────────────────────────────────────
/**
 * Returns curated community build templates for the build recommender.
 */
app.get('/api/builds', (_req: Request, res: Response) => {
  const buildsPath = path.join(__dirname, 'data', 'builds.json');
  if (!fs.existsSync(buildsPath)) {
    res.json([]);
    return;
  }
  const builds = JSON.parse(fs.readFileSync(buildsPath, 'utf8'));
  res.json(builds);
});

// ── POST /api/advisor ────────────────────────────────────────────────────────
/**
 * Dadas las stats de un personaje, devuelve:
 *   - usable:       top armas que puede equipar ordenadas por AR estimado
 *   - nearlyUsable: armas a ≤5 puntos de poder equipar
 *   - wastedStats:  stats altos que ningún arma del top aprovecha
 *
 * Body: { vigor?, mind?, endurance?, strength, dexterity, intelligence, faith, arcane }
 */
app.post('/api/advisor', (req: Request, res: Response) => {
  const stats = parseStatsFromBody(req.body);
  if (!stats) {
    res.status(400).json({
      error: 'Body inválido. Se requieren: strength, dexterity, intelligence, faith, arcane (y opcionalmente vigor, mind, endurance)',
    });
    return;
  }

  const topN        = Number(req.query['top'] ?? 10);
  const nearlyRange = Number(req.query['nearlyRange'] ?? 5);

  const result = getAdvisorResult(stats, topN, nearlyRange);
  res.json(result);
});

// ── Error handler ───────────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof ParseError ? 422 : 400;
  console.error(`[${err.name}] ${err.message}`);
  res.status(status).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatPlaytime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

/** Parsea stats desde query params (GET /api/items/weapons?str=18&dex=34...) */
function parseStatsFromQuery(
  query: Record<string, unknown>,
): CharacterStatsForFilter | null {
  const str = Number(query['str'] ?? query['strength']);
  const dex = Number(query['dex'] ?? query['dexterity']);
  const int = Number(query['int'] ?? query['intelligence']);
  const fai = Number(query['fai'] ?? query['faith']);
  const arc = Number(query['arc'] ?? query['arcane']);

  if ([str, dex, int, fai, arc].some(v => isNaN(v))) return null;

  return {
    strength: str, dexterity: dex, intelligence: int, faith: fai, arcane: arc,
  };
}

/** Parsea stats desde el body JSON (POST /api/advisor) */
function parseStatsFromBody(body: Record<string, unknown>): CharacterStatsForFilter | null {
  if (!body || typeof body !== 'object') return null;

  const required = ['strength', 'dexterity', 'intelligence', 'faith', 'arcane'];
  for (const key of required) {
    if (typeof body[key] !== 'number' && typeof body[key] !== 'string') return null;
  }

  const n = (key: string): number => Number(body[key] ?? 1);

  return {
    vigor:        n('vigor'),
    mind:         n('mind'),
    endurance:    n('endurance'),
    strength:     n('strength'),
    dexterity:    n('dexterity'),
    intelligence: n('intelligence'),
    faith:        n('faith'),
    arcane:       n('arcane'),
  };
}
