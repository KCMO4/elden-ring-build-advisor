# Elden Ring Build Advisor

Web tool for analyzing Elden Ring builds directly from a save file (`.sl2`).
Reads the binary save, displays character stats and equipped gear with images and detailed tooltips,
and shows accurate derived stats using exact game formulas — HP, FP, Stamina, Equip Load, Attack Rating,
Damage Negation, Poise, Resistances, Flat Defense, Rune Level Calculator, and more.

---

## Features

- **Save file upload** — drag & drop or file picker for `.sl2` (PC Steam only)
- **Character selection** — card picker when the save has multiple active characters
- **Attributes panel** — all 8 stats (VIG/MND/END/STR/DEX/INT/FAI/ARC) with proportional bars and softcap ticks
- **Derived stats (sub-tabbed: Body | Attack | Defense)** —
  - **Body**: HP, FP, Stamina, Equip Load with exact piecewise interpolation formulas; Rune Level Calculator (exact game formula: `floor((max(0, (L-11)*0.02) + 0.1) * (L+81)^2 + 1)`)
  - **Attack**: Estimated AR per weapon with 2H STR toggle (×1.5), off-hand AR, spell scaling (staves/seals), weapon passives with ARC scaling, configurable buffs (Golden Vow, Flame Grant Me Strength, etc.)
  - **Defense**: Damage Negation % for equipped armor (with buff indicators), Guard Boost for shields, Poise (color breakpoints), Resistances (Immunity, Robustness, Focus, Vitality — flat values, exact game formulas), Discovery
- **Talisman effects** — ~35 talismans with numeric effects: HP/FP/Stamina/Equip Load bonuses, elemental damage %, defense %, skill/spell power, guard boost, poise, resistances, discovery
- **Great Rune & Physick** — toggle Rune Arc and Flask of Wondrous Physick to see stat changes in real time
- **Buff system** — configurable damage/defense buffs (Golden Vow, Flame Grant Me Strength, Howl of Shabriri, etc.) with multiplicative stacking
- **Equipment grid** — weapons (Left Hand / Right Hand), full armor (Head / Chest / Arms / Legs) and 4 talismans with fanapis images and SVG placeholders per category
- **Item tooltips on hover** — full stats for each equipped item:
  - Weapons: Estimated AR per damage type (bars) with per-stat scaling breakdown (e.g. `DEX D 34 → +82`), requirement check with penalty warning, ARC-scaled passive effects (Bleed, Frost, Poison), Ash of War skill + FP cost
  - Armor: Damage Negation per type (8 values, float precision), Poise, Resistances, armor efficiency ratio (phys def / weight)
  - Shields: Guard Boost (stability) + guard negation per element
  - Talismans: numeric effects (HP%, Stamina%, etc.) or text description
  - Weight for all items
- **Inventory tooltips** — AR estimation for inventory weapons using character stats, requirement met/unmet styling, ARC-scaled passives
- **Full inventory** — 14 tabs: Weapons / Armor / Talismans / Spells / Spirits / Ashes of War / Consumables / Materials / Upgrades / Tears / Ammo / Key Items / Cookbooks / Multiplayer — with name search and type filter per tab
- **Matchmaking calculator** — co-op and invasion level/weapon upgrade ranges

---

## Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  ← Back   ZHYAK                         Level 68 · 33h 14m   ↓ PNG │
├──────────────────┬──────────────────────────────────────────────────┤
│  ATTRIBUTES      │  EQUIPMENT                                        │
│  VIG 34 ████     │  Weapons                                          │
│  MND 17 ██       │   Left Hand      Right Hand                       │
│  END 18 ██       │   [LH1][LH2][LH3] [RH1][RH2][RH3]               │
│  STR 18 ██       │                                                   │
│  DEX 34 ████     │  Armor                                            │
│  INT  7 █        │   [Head][Chest][Arms][Legs]                       │
│  FAI  8 █        │                                                   │
│  ARC 11 █        │  Talismans                                        │
│                  │   [T1][T2][T3][T4]                                │
│  HP   1193       ├──────────────────────────────────────────────────┤
│  FP    132       │  INVENTORY                                        │
│  STA   120       │  [Weapons][Armor][Talisms.][Spells][Spirits]...   │
│  LOAD 55.6/72.0  │  🔍 Search by name...  [All types ▼]             │
│  ATK   368       │  [item grid with images and tooltips]             │
│  DEF  27.9%      │                                                   │
└──────────────────┴──────────────────────────────────────────────────┘
```

---

## Tech stack

### Backend
| Technology | Role |
|------------|------|
| Node.js 22 + TypeScript 5.7 | Runtime and language |
| Express 4 | HTTP server |
| Multer 2 | `.sl2` file upload (memoryStorage) |
| ts-node-dev | Dev server with hot reload |
| Jest 30 + ts-jest | Tests (134 tests) |

### Frontend
| Technology | Role |
|------------|------|
| React 19 + TypeScript 5.7 | UI |
| Vite 6 | Bundler and dev server |
| CSS Modules | Per-component styles |
| Google Fonts (EB Garamond + Cormorant Garamond) | Thematic typography |

---

## Running the project

### Option 1 — Docker Compose (recommended)

```bash
git clone https://github.com/tu-usuario/elden-ring-build-advisor.git
cd elden-ring-build-advisor
docker compose up
```

- Backend: `http://localhost:3001`
- Frontend: `http://localhost:5173`

### Option 2 — Local (no Docker)

```bash
# Backend
cd backend
npm install
npm run dev        # http://localhost:3001

# Frontend (separate terminal)
cd frontend
npm install
npm run dev        # http://localhost:5173
```

### Sync item data

The JSONs in `backend/src/data/` are committed and ready to use.
To regenerate them from upstream sources:

```bash
cd backend
npm run sync-data       # download from fanapis.com + map with real game IDs
npm run patch-armor     # apply float precision from EquipParamProtector (game data)
npm run audit           # verify data quality (exits with code 1 if critical bugs found)
```

---

## Architecture

```
elden-ring-build-advisor/
├── backend/
│   ├── src/
│   │   ├── parser/        # Binary .sl2 reader (BND4, stats, offsets)
│   │   ├── inventory/     # ChrAsm2: equipped gear + full inventory
│   │   ├── items/         # ItemStore, AR advisor, types
│   │   ├── data/          # Item JSONs (weapons, armors, talismans, spells…)
│   │   └── index.ts       # Express app + REST endpoints
│   └── scripts/
│       ├── sync-data.ts           # Download and normalize data from fanapis.com
│       ├── patch-armor-precision.ts  # Apply float defense values from game's EquipParamProtector
│       └── audit-data.ts          # Data quality audit (duplicates, zero values, type errors)
└── frontend/
    └── src/
        ├── components/
        │   ├── BuildPage/         # Main layout
        │   ├── StatsPanel/        # 8 attributes
        │   ├── DerivedStatsPanel/ # Sub-tabs: Body | Attack | Defense (exact game formulas)
        │   ├── EquipmentGrid/     # Weapons + armor + talismans
        │   ├── ItemSlot/          # Slot with image, upgrade badge, infusion badge
        │   ├── ItemTooltip/       # Hover tooltip: AR, defense, poise, resistances, guard boost, skill
        │   ├── InventoryTooltip/  # Hover tooltip for inventory items
        │   ├── InventoryPanel/    # Full inventory with search and type filter
        │   ├── AdvisorPanel/      # Weapon recommendations by AR + Next Caps optimizer
        │   ├── MatchmakingCalc/  # Co-op & Invasion range calculator
        │   ├── CharacterSelect/   # Character card picker
        │   └── UploadPage/        # .sl2 drop zone
        ├── hooks/
        │   ├── useMountAnimation.ts   # Bar animation on mount
        │   └── useTooltipPosition.ts  # Viewport-aware tooltip flip
        └── utils/
            ├── arCalc.ts              # AR estimation, flat defense, spell scaling, passive buildup
            ├── talismanEffects.ts     # Numeric effects for ~35 known talismans
            ├── buffEffects.ts         # Buff system (Golden Vow, Flame Grant Me Strength, etc.)
            ├── greatRuneEffects.ts    # Great Rune stat bonuses
            └── crystalTearEffects.ts  # Crystal Tear (Physick) bonuses
```

### How the `.sl2` is read

The Elden Ring save file uses FromSoftware's **BND4** container format. The parser reverse-engineers:

1. **BND4 header** → locates character slots
2. **findStats()** → pattern search by attribute sum (`level + 79`) to locate the 8 stats in slot data
3. **ChrAsm2** (`vigor_offset + 0x310`) → 96-byte struct with equipment gaitem_handles
4. **ga_items lookup** → handles resolved against the slot's item table to get real IDs
5. **ID decoding**:
   - Weapons: `baseId = floor(item_id / 100) * 100`, `upgradeLevel = item_id % 100`
   - Armor: `baseId = item_id XOR 0x10000000`
   - Talismans: `baseId = handle XOR 0xA0000000` (direct, no ga_items)

---

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `GET`  | `/health` | Server health + item counts |
| `POST` | `/api/parse` | Parse `.sl2` → stats + gear + optional full inventory |
| `GET`  | `/api/items/weapons` | List weapons with optional filters |
| `GET`  | `/api/items/armors` | List armors |
| `GET`  | `/api/items/talismans` | List talismans |
| `GET`  | `/api/items/spells` | List spells |
| `POST` | `/api/advisor` | Weapon recommendations by character stats |

```bash
# Parse a save file
curl -X POST http://localhost:3001/api/parse \
  -F "savefile=@/path/to/ER0000.sl2"

# Full inventory
curl -X POST "http://localhost:3001/api/parse?inventory=true" \
  -F "savefile=@/path/to/ER0000.sl2"

# Advisor
curl -X POST http://localhost:3001/api/advisor \
  -H "Content-Type: application/json" \
  -d '{"vigor":34,"mind":17,"endurance":18,"strength":18,"dexterity":34,"intelligence":7,"faith":8,"arcane":11}'
```

---

## Tests

```bash
cd backend && npm test   # 134 tests — parser, inventory scanner, item store, advisor
```

---

## Data sources

| File | Source |
|------|--------|
| `weapons.json` (306) | [fanapis.com](https://eldenring.fanapis.com) — base stats + images |
| `armors.json` (568) | fanapis.com — base data; defense values patched with float precision (see below) |
| `talismans.json` (87) | fanapis.com |
| `spells.json` (169) | fanapis.com |
| `shields.json`, `ashes.json`, `spirits.json`, `consumables.json` | fanapis.com |
| `gameIds.json` | [Deskete/EldenRingResources](https://github.com/Deskete/EldenRingResources) — real weapon IDs |
| `armorIds.json` | [ClayAmore/ER-Save-Editor](https://github.com/ClayAmore/ER-Save-Editor) — EquipParamProtector IDs |
| `talismanIds.json` | ClayAmore/ER-Save-Editor — EquipParamAccessory IDs |
| `gemIds.json` | ClayAmore/ER-Save-Editor — Ash of War IDs |
| Armor defense floats + poise | [jerpdoesgames/EldenRingArmorOptimizer](https://github.com/jerpdoesgames/EldenRingArmorOptimizer) — extracted from `regulation.bin → EquipParamProtector` |
| Derived stat formulas | Elden Ring community (piecewise interpolation, reverse-engineered) |

### Armor data precision

fanapis stores defense values as integers. The `patch-armor` script overlays float values
extracted from the game's `EquipParamProtector` param (via EldenRingArmorOptimizer):

- **550 / 568 armors** have float precision (e.g. `strike: 5.4` instead of `5`)
- **Also adds `poise`** and **resistances** (`immunity`, `robustness`, `focus`, `vitality`) — not available in fanapis
- **18 unmatched** (6 Shadow of the Erdtree DLC pieces not yet in the optimizer, ~12 obscure items with near-zero stats) — keep integer approximations from fanapis

---

## Credits & Acknowledgments

This project wouldn't be possible without the incredible Elden Ring community and their reverse-engineering work:

| Resource | Author / Project | Used for |
|----------|-----------------|----------|
| [Elden Ring Fan API](https://eldenring.fanapis.com) | fanapis.com | Item data (weapons, armors, talismans, spells, shields, ashes, spirits, consumables) + images |
| [EldenRingResources](https://github.com/Deskete/EldenRingResources) | Deskete | Real weapon IDs (`gameIds.json`) extracted from game data |
| [ER-Save-Editor](https://github.com/ClayAmore/ER-Save-Editor) | ClayAmore | Armor IDs (EquipParamProtector), Talisman IDs (EquipParamAccessory), Ash of War IDs (EquipParamGem), .sl2 binary format reference |
| [EldenRingArmorOptimizer](https://github.com/jerpdoesgames/EldenRingArmorOptimizer) | jerpdoesgames | Float-precision defense values, poise, and resistance data extracted from `regulation.bin → EquipParamProtector` |
| [Elden Ring Wiki (Fextralife)](https://eldenring.wiki.fextralife.com) | Fextralife community | Fallback item images, formula verification, softcap reference |
| Elden Ring community | Various contributors | Reverse-engineered formulas: HP/FP/Stamina/Equip Load piecewise interpolation, AR scaling curves, flat defense formulas, resistance formulas, rune cost formula, matchmaking ranges |
| [Google Fonts](https://fonts.google.com) | Google | EB Garamond (display) + Cormorant Garamond (UI headings) |

Built with [Claude Code](https://claude.ai/claude-code) by Anthropic.

---

## Known limitations

- Item images depend on `fanapis.com` CDN availability; SVG placeholders shown on failure
- Estimated AR in tooltips and advisor is approximate (based on community reverse-engineering of stat scaling curves); may differ slightly from in-game values
- Console saves (PS4/PS5/Xbox) are not supported — PC Steam `.sl2` only
- 18 armor pieces have integer defense values instead of floats (see Data sources above)

---

## License

MIT — This project is not affiliated with FromSoftware or Bandai Namco.
