# AGENTS.md — Backend: Elden Ring Build Advisor

Reference guide for AI agents (and humans) working on the backend.
Describes architecture, conventions and working rules.

---

## Stack

| Layer       | Technology                     |
|-------------|--------------------------------|
| Runtime     | Node.js 22 (Alpine in Docker)  |
| Language    | TypeScript 5.7, target ES2022  |
| Framework   | Express 4                      |
| Upload      | Multer 2 (memory, max 50 MB)   |
| Tests       | Jest 30 + ts-jest              |
| Dev hot-reload | ts-node-dev               |

---

## Folder structure

```
backend/
├── scripts/
│   ├── sync-data.ts             # Download item JSONs from fanapis.com (npm run sync-data)
│   ├── patch-armor-precision.ts # Overlay float defense + poise from EldenRingArmorOptimizer
│   ├── audit-data.ts            # Data quality audit: duplicates, zero values, type errors
│   └── check-images.ts          # Diagnostic: image coverage per category
├── src/
│   ├── index.ts                 # Express server: routes, middleware, error handler
│   ├── data/                    # Static JSONs (committed, updated by sync-data — except builds.json)
│   │   ├── builds.json          # 30 curated community build templates (manually maintained)
│   │   ├── weapons.json         # 306 weapons with damage, scaling, weight, image
│   │   ├── armors.json          # 568 armors — 550 with float defense + poise + resistances (patch-armor)
│   │   ├── talismans.json       # 87 talismans with name, effect text, image
│   │   ├── spells.json          # 169 spells
│   │   ├── shields.json         # Shields with stability (Guard Boost), defense, weight
│   │   ├── ashes.json           # 90 Ashes of War with affinity + skill
│   │   ├── spirits.json         # 64 Spirit Ashes with fpCost, hpCost, effect
│   │   ├── consumables.json     # 462 consumables (flasks, boluses, food, etc.)
│   │   ├── gameIds.json         # Real weapon IDs (Deskete/EldenRingResources)
│   │   ├── armorIds.json        # EquipParamProtector IDs (623 entries)
│   │   ├── talismanIds.json     # EquipParamAccessory IDs (real game IDs)
│   │   └── gemIds.json          # Ash of War IDs (EquipParamGem)
│   ├── items/                   # In-memory item database + advisor
│   │   ├── types.ts             # Weapon, Armor, Talisman, Spell, Shield, Ash, Spirit, Consumable
│   │   ├── store.ts             # ItemStore singleton: loads JSON → typed queries
│   │   │                        # getWeaponByName/ByBaseId, getArmorByName, getTalismanByName,
│   │   │                        # getShieldByName, getAshByName, getSpiritByName, getConsumableByName
│   │   ├── advisor.ts           # getAdvisorResult(): recommendations by estimated AR
│   │   ├── index.ts             # Public re-exports
│   │   └── __tests__/
│   │       ├── store.test.ts
│   │       └── advisor.test.ts
│   ├── inventory/               # Inventory / equipped gear reader
│   │   ├── types.ts             # RawInventoryItem, ResolvedInventoryItem, EquippedWeapon,
│   │   │                        # EquippedItems, Inventory, InventoryScanResult, ItemCategory
│   │   ├── constants.ts         # Equipment and inventory offsets (relative to slot data)
│   │   ├── scanner.ts           # scanInventory(slotData): equipped + full inventory
│   │   │                        # resolveWeaponHandle, resolveArmorHandle, resolveTalismanHandle
│   │   ├── index.ts             # Public re-exports
│   │   └── __tests__/
│   │       └── scanner.test.ts
│   └── parser/                  # BND4 container reader + character stats
│       ├── types.ts
│       ├── constants.ts
│       ├── bnd4.ts
│       ├── summary.ts
│       ├── stats.ts             # findStats(): locates 8 attributes by pattern
│       ├── index.ts
│       └── __tests__/
│           └── parser.test.ts
├── Dockerfile                   # Multi-stage: base → deps → dev / production
├── .dockerignore
├── package.json
├── tsconfig.json
└── tsconfig.scripts.json        # Extends tsconfig.json, includes scripts/
```

---

## npm scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | ts-node-dev with hot-reload at :3001 |
| `npm run build` | Compile to dist/ |
| `npm start` | Run dist/index.js (production) |
| `npm test` | Jest — 134 tests, all must pass |
| `npm run sync-data` | Regenerate all `src/data/*.json` from fanapis.com |
| `npm run patch-armor` | Overlay float defense + poise + resistances from EldenRingArmorOptimizer |
| `npm run patch-armor:dry` | Dry run — shows match stats without writing files |
| `npm run audit` | Data quality audit (exits 1 on critical bugs) |
| `npm run audit:save` | Same, writes report to audit-report.json |

---

## API REST

### `GET /health`
Healthcheck. Returns `{ status: "ok", timestamp, items: { weapons, armors, ... } }`.
Used by Docker Compose for `depends_on: condition: service_healthy`.

### `POST /api/parse`
**Body:** `multipart/form-data`, field `savefile` (`.sl2` file).
**Query:** `inventory=true` to include full inventory.

**Successful response:**
```json
{
  "fileSize": 28967888,
  "totalSlots": 10,
  "activeSlots": 1,
  "characters": [
    {
      "slot": 2,
      "name": "Zhyak",
      "level": 68,
      "playtime": "33h 14m 5s",
      "heldRunes": 42000,
      "stats": { "vigor": 34, "mind": 17, ... },
      "equipped": {
        "rightHand": [
          { "rawId": 123, "baseId": 3400000, "name": "Bloodhound's Fang", "upgradeLevel": 4,
            "image": "https://eldenring.fanapis.com/...", "damage": {...}, "scaling": {...} },
          ...
        ],
        "leftHand": [...],
        "head": { "name": "Banished Knight Helm (Altered)", "defense": {...}, ... },
        "chest": {...}, "hands": {...}, "legs": {...},
        "talismans": [
          { "name": "Erdtree's Favor", "effect": "Raises maximum HP, stamina and equip load", ... },
          ...
        ]
      },
      "inventory": { ... }  // only with ?inventory=true
    }
  ]
}
```

**Errors:**
- `400` — no file sent, not a `.sl2`, or wrong field name (must be `savefile`)
- `422` — valid file but not parseable (ParseError)

### `GET /api/items/weapons`

**Query params:**
| Param   | Description                                                    |
|---------|----------------------------------------------------------------|
| `type`  | Weapon type (`Katana`, `Greatsword`, `Straight Sword`, ...)   |
| `canUse`| `true` to filter by character stats                           |
| `str`, `dex`, `int`, `fai`, `arc` | Character stats (required if `canUse=true`) |

**Response:** `{ count: number, data: Weapon[] }`

### `GET /api/builds`
Returns 30 curated community build templates for the frontend build recommender.

**Response:** `BuildTemplate[]` — each template includes stat profiles, weapons, shields, armor suggestion, talismans, ashes of war, spells, difficulty, tags, and tips.

### `POST /api/advisor`
Given a stats block, returns weapon recommendations sorted by estimated AR.

**Body:** `application/json`
```json
{
  "vigor": 34, "mind": 17, "endurance": 18,
  "strength": 18, "dexterity": 34,
  "intelligence": 7, "faith": 8, "arcane": 11
}
```

**Response:**
```json
{
  "usable": [
    {
      "weapon": { "id": 1000000, "name": "Uchigatana", "type": "Katana", "estimatedAR": 312, ... },
      "estimatedAR": 312,
      "canEquip": true
    }
  ],
  "nearlyUsable": [...],
  "wastedStats": ["intelligence"]
}
```

**Optional query params:** `top` (default 10), `nearlyRange` (default 5).

---

## .sl2 file format

### BND4 container

```
0x000  BND4 header (0x40 bytes)
         ├─ 0x00: magic "BND4" (ASCII)
         ├─ 0x0C: fileCount (uint32 LE)  → usually 11
         ├─ 0x20: entryHeaderSize (uint32 LE) → 0x20 bytes/entry
         └─ 0x28: dataOffset (uint32 LE)

0x040  Entry directory (11 × 0x20 bytes)

0x310  Character slot data (entries 0-9)
         Each slot: 0x280000 bytes (2,621,440)
         Stride between slots: 0x280010 (data + 0x10 padding)

0x19003B0  System data (entry 10) — character summary
```

### ChrAsm2 layout (equipped gear)

`ChrAsm2` is located at `vigor_offset + 0x310` within the slot data. Size: 96 bytes.

| Offset | Field |
|--------|-------|
| +0x00 | LH[0] gaitem_handle |
| +0x04 | RH[0] gaitem_handle |
| +0x08 | LH[1] gaitem_handle |
| +0x0C | RH[1] gaitem_handle |
| +0x10 | LH[2] gaitem_handle |
| +0x14 | RH[2] gaitem_handle |
| +0x18..+0x27 | arrows[0,1] + bolts[0,1] |
| +0x28..+0x37 | 4 unknown fields (_unk0..3) |
| +0x38 | HEAD gaitem_handle |
| +0x3C | CHEST gaitem_handle |
| +0x40 | ARMS gaitem_handle |
| +0x44 | LEGS gaitem_handle |
| +0x48 | _unk4 |
| +0x4C..+0x58 | talisman[0..3] gaitem_handles |
| +0x5C | _unk5 |

> **Warning**: ER-Save-Editor (Rust) labels +0x30/+0x34 as head/chest. This is wrong.
> The real armor slots are at +0x38..+0x44 (verified against real saves).

### gaitem_handle decoding

| High byte | Category | How to get the real ID |
|-----------|----------|------------------------|
| `0x80` | Weapon | look up in ga_items → `item_id`; `baseId = floor(id/100)*100`; `upgrade = id%100` |
| `0x90` | Armor | look up in ga_items → `item_id`; `armorId = item_id XOR 0x10000000` |
| `0xA0` | Talisman | no ga_items lookup; `talismanId = handle XOR 0xA0000000` |

### ID source table

| Category | Primary source | Fallback |
|----------|---------------|---------|
| Weapons | `gameIds.json` (Deskete/EldenRingResources) | `ItemStore.getWeaponByBaseId()` |
| Armors | `armorIds.json` (ER-Save-Editor armor_name.rs) | `ItemStore.getArmorByBaseId()` |
| Talismans | `talismanIds.json` (ER-Save-Editor accessory_name.rs) | — |
| Ashes of War | `gemIds.json` (ER-Save-Editor aow_name.rs) | — |

---

## Full inventory

`scanItemArray()` locates the item array in slot data using the anchor item
"Tarnished Wizened Finger" (ID `0x4003D`). Each entry is 8 bytes: `[itemId: u32, flag: u32]`.

Categories are derived from the high nibble of the itemId:

| Nibble | Category | Notes |
|--------|----------|-------|
| 0x0 | weapon / ammo | ammo: baseId >= 50M |
| 0x1 | armor | IDs XOR 0x10000000 |
| 0x2 | talisman | — |
| 0x4 | consumable (+ spells, spirits, etc.) | subcategorized by ID range and name |
| 0x8 | ash_of_war | EquipParamGem |

---

## Data scripts

### `sync-data.ts`
Downloads item data from `fanapis.com` and normalizes it into the `src/data/*.json` files.

- Handles `WEAPON_CORRECTIONS` — name mappings for fanapis inconsistencies
  (e.g. `"Godksin Peeler"` → `"Godskin Peeler"`)
- Adds Fextralife wiki URL as fallback `image` for items with no fanapis image
- Sets `poise: 0` on all armors — the real values come from `patch-armor-precision.ts`
- Writes `weapons.json` using real IDs from `gameIds.json` (fanapis IDs are sequential and wrong)

### `patch-armor-precision.ts`
Overlays float defense values, `poise` and resistances (`immunity`, `robustness`, `focus`, `vitality`)
from `jerpdoesgames/EldenRingArmorOptimizer` onto `armors.json`. The optimizer data is extracted
from `regulation.bin → EquipParamProtector`.

- Downloads `armor/data/armor.js` from GitHub raw (a JS file, not JSON)
- Parses it with `vm.runInNewContext('(function(){ ${code}\nreturn armor; })()', {})`
- Matches by normalized name with fallbacks:
  1. Exact match after normalization (lowercase + strip typographic apostrophes)
  2. Strip `(altered)` suffix
  3. `corrections` map for known fanapis ↔ optimizer name mismatches
- Coverage: **550 / 568** armors (96.8%)
- Unmatched (18): 6 DLC Brave's set items + 12 obscure/near-zero items
- Supports `--dry-run` flag (logs match stats without writing)

### `audit-data.ts`
Checks data quality across all item JSONs:
- Duplicate IDs and names
- Zero values in critical fields (damage, defense)
- Missing required fields
- Type validation
- Exits with code 1 if critical issues are found (for CI use)

---

## Item types — key interfaces

### `Weapon`
```typescript
interface Weapon {
  id: number;
  name: string;
  type: WeaponType;
  weight: number;
  damage: DamageStats;       // base damage at +0
  scaling: ScalingStats;     // STR/DEX/INT/FAI/ARC grades
  image?: string;
}
```

### `Armor`
```typescript
interface Armor {
  id: number;
  name: string;
  type: ArmorType;
  weight: number;
  poise: number;             // 0 if unavailable (18 unmatched items)
  immunity?: number;         // resistance to Poison/Scarlet Rot
  robustness?: number;       // resistance to Hemorrhage/Frostbite
  focus?: number;            // resistance to Sleep/Madness
  vitality?: number;         // resistance to Death Blight
  defense: Defense;          // float precision for 550/568 items
  image?: string;
}

interface Defense {
  physical: number;  strike: number; slash: number; pierce: number;
  magic: number;     fire: number;   lightning: number; holy: number;
}
```

---

## Code conventions

### TypeScript
- `strict: true` — no exceptions.
- Prefer `interface` for objects, `type` only for unions.
- No `any`. If unavoidable, use `unknown` + type guard.
- Binary offset constants in `SCREAMING_SNAKE_CASE`.
- Function names in `camelCase`, files in `kebab-case`.

### Binary offsets
- **Every numeric offset constant goes in `parser/constants.ts`**, never hardcoded elsewhere.
- Comment the source of each offset (reference project name).
- Use `0x` prefix for all offsets.

### Errors
- The parser throws `ParseError` (subclass of `Error`) for malformed files.
- Express returns `422` for `ParseError`, `400` for Multer errors.
- Do not catch errors to silence them; let them bubble to the error handler.

### Tests
- Each parser module must have tests in `__tests__/`.
- Use synthetic buffers (not real files) for unit tests.
- Command: `npm test` (134 tests, all must pass).

---

## Workflow

### Local development
```bash
cd backend
npm install
npm run dev          # ts-node-dev with hot-reload at :3001
npm test             # Jest
```

### With Docker
```bash
# From project root:
docker compose up    # starts backend (:3001) and frontend (:5173)
docker compose build backend   # rebuild backend only
```

### Sync and patch item data
```bash
cd backend
npm run sync-data    # download from fanapis.com + map with real game IDs
npm run patch-armor  # overlay float defense + poise from EldenRingArmorOptimizer
npm run audit        # verify data quality (exits 1 if critical bugs found)
npm test             # all 134 tests must pass after data changes
```

### Verify the parser with a real .sl2
```bash
# With the server running:
curl -X POST http://localhost:3001/api/parse \
  -F "savefile=@/path/to/ER0000.sl2"

# With full inventory:
curl -X POST "http://localhost:3001/api/parse?inventory=true" \
  -F "savefile=@/path/to/ER0000.sl2"
```

---

## Checklist for adding a new feature

1. If the feature touches binary format → update `constants.ts` first.
2. If it adds parsing logic → new module in `parser/` with its test.
3. If it adds an endpoint → document it here in the API section.
4. `npm test` must be green before committing.
5. `npx tsc --noEmit` with no errors.
6. Rebuild Docker image if needed: `docker compose build backend`.
