# Elden Ring Build Advisor

Herramienta web para analizar builds de Elden Ring directamente desde el archivo de guardado (`.sl2`).
Lee los datos binarios del save, muestra los stats del personaje, el equipo equipado con imágenes y tooltips detallados, y recomienda armas según los atributos del jugador.

---

## Funcionalidades

- **Carga de save file** — drag & drop o selección de archivo `.sl2` (Windows y Steam)
- **Selección de personaje** — si el save tiene múltiples personajes activos, muestra cards de selección
- **Stats panel** — los 8 atributos (VIG/MND/END/STR/DEX/INT/FE/ARC) con barras proporcionales
- **Stats derivados** — HP, FP, Stamina, Equip Load con fórmulas de interpolación exactas; Attack Rating del arma principal; Negación de daño total de la armadura
- **Efectos de talismanes** — HP, FP, Stamina y Equip Load ajustados por los talismanes equipados (mostrado con indicadores "+N" en verde)
- **Equipment grid** — armas (mano izquierda y derecha), armadura completa (cabeza/torso/brazos/piernas) y 4 talismanes con imágenes de fanapis y SVG placeholders por categoría
- **Tooltips al hover** — stats completos de cada ítem equipado: Attack Power por tipo de daño (barras), Attribute Scaling, efectos numéricos de talismanes o descripción de texto para todos los demás
- **Build Advisor** — ranking de las mejores armas para los stats actuales, ordenadas por AR estimado; indica si el jugador puede equiparlas o cuántos puntos le faltan
- **Inventario completo** — tabs Armas / Armaduras / Talismanes / Hechizos / Cenizas de Guerra / Espíritus / Consumibles con búsqueda por nombre y filtro por tipo

---

## Capturas

> La interfaz usa tipografía Cinzel, paleta dorada oscura y diseño angular inspirado en la estética de FromSoftware.

```
┌─────────────────────────────────────────────────────────────┐
│  ZHYAK                          Lvl 68   33h 14m            │
├──────────────┬──────────────────┬──────────────────────────┤
│ ATRIBUTOS    │ STATS DERIVADOS  │ EQUIPO                   │
│              │                  │                          │
│ VIG  34 ████ │ HP    1193 (+3%) │  [BH Fang+4] [Torch]    │
│ MND  17 ██   │ FP    132        │  [       ]   [     ]    │
│ END  18 ██   │ STA   120        │                          │
│ STR  18 ██   │ LOAD  55.6/72.0  │  [Helm][Chest][Arms][Leg]│
│ DES  34 ████ │ ATK   368        │                          │
│ INT   7 █    │                  │  [Talisman×4]            │
│ FE    8 █    │                  │                          │
│ ARC  11 █    │                  │                          │
└──────────────┴──────────────────┴──────────────────────────┘
```

---

## Stack técnico

### Backend
| Tecnología | Rol |
|-----------|-----|
| Node.js 22 + TypeScript 5.7 | Runtime y lenguaje |
| Express 4 | HTTP server |
| Multer 2 | Upload de archivos `.sl2` (memoryStorage) |
| ts-node-dev | Dev server con hot reload |
| Jest 30 + ts-jest | Tests (43 tests) |

### Frontend
| Tecnología | Rol |
|-----------|-----|
| React 19 + TypeScript 5.7 | UI |
| Vite 6 | Bundler y dev server |
| CSS Modules | Estilos por componente |
| Google Fonts (Cinzel) | Tipografía temática |

---

## Cómo correr el proyecto

### Opción 1 — Docker Compose (recomendado)

```bash
git clone https://github.com/tu-usuario/elden-ring-build-advisor.git
cd elden-ring-build-advisor
docker compose up
```

- Backend: `http://localhost:3001`
- Frontend: `http://localhost:5173`

### Opción 2 — Local (sin Docker)

```bash
# Backend
cd backend
npm install
npm run dev        # http://localhost:3001

# Frontend (otra terminal)
cd frontend
npm install
npm run dev        # http://localhost:5173
```

### Sincronizar datos de ítems

Los JSON en `backend/src/data/` ya están commiteados. Si querés regenerarlos:

```bash
cd backend
npm run sync-data   # descarga de fanapis.com + mapeo con IDs reales del juego
```

---

## Arquitectura

```
elden-ring-build-advisor/
├── backend/
│   ├── src/
│   │   ├── parser/        # Lectura del binario .sl2 (BND4, stats, offsets)
│   │   ├── inventory/     # ChrAsm2: equipo equipado + inventario completo
│   │   ├── items/         # ItemStore, advisor de armas, tipos
│   │   ├── data/          # JSONs de ítems (armas, armaduras, talismanes, hechizos…)
│   │   └── index.ts       # Express app + endpoints REST
│   └── scripts/
│       └── sync-data.ts   # Descarga y normaliza datos de fanapis.com
└── frontend/
    └── src/
        ├── components/
        │   ├── BuildPage/         # Layout principal
        │   ├── StatsPanel/        # 8 atributos
        │   ├── DerivedStatsPanel/ # HP/FP/Stamina/Load/Attack/Defense
        │   ├── EquipmentGrid/     # Armas + armadura + talismanes
        │   ├── ItemSlot/          # Slot con imagen, badge de nivel e infusión
        │   ├── ItemTooltip/       # Tooltip hover con stats completos
        │   ├── AdvisorPanel/      # Recomendaciones por AR
        │   ├── InventoryPanel/    # Inventario con búsqueda y filtros
        │   └── UploadPage/        # Drop zone
        ├── hooks/
        │   ├── useMountAnimation.ts   # Animación de barras al montar
        │   └── useTooltipPosition.ts  # Posicionamiento flip del tooltip
        └── utils/
            └── talismanEffects.ts     # Efectos numéricos de talismanes conocidos
```

### Cómo se lee el `.sl2`

El archivo de Elden Ring usa el formato **BND4** de FromSoftware. El parser hace reverse-engineering de:

1. **BND4 header** → ubica los slots de personaje
2. **findStats()** → búsqueda de patrón por suma de atributos (`nivel + 79`) para localizar los 8 stats en el slot data
3. **ChrAsm2** (`vigor_offset + 0x310`) → estructura de 96 bytes con handles del equipo equipado (gaitem_handles)
4. **ga_items lookup** → los handles se resuelven contra la tabla de ítems del slot para obtener IDs reales
5. **ID decoding**:
   - Armas: `baseId = floor(item_id / 100) * 100`, `upgradeLevel = item_id % 100`, infusión por offset módulo 10000
   - Armaduras: `baseId = item_id XOR 0x10000000`
   - Talismanes: `baseId = handle XOR 0xA0000000` (lookup directo, sin ga_items)

---

## Endpoints API

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/health` | Estado del servidor |
| `POST` | `/api/parse` | Parsea `.sl2` → stats + equipo + (opcional) inventario completo |
| `GET` | `/api/items/weapons` | Lista armas con filtros opcionales |
| `GET` | `/api/items/armors` | Lista armaduras |
| `GET` | `/api/items/talismans` | Lista talismanes |
| `GET` | `/api/items/spells` | Lista hechizos |
| `POST` | `/api/advisor` | Recomendaciones de armas por stats del personaje |

```bash
# Parsear un save
curl -X POST http://localhost:3001/api/parse \
  -F "savefile=@/ruta/a/ER0000.sl2"

# Inventario completo
curl -X POST "http://localhost:3001/api/parse?inventory=true" \
  -F "savefile=@/ruta/a/ER0000.sl2"

# Advisor
curl -X POST http://localhost:3001/api/advisor \
  -H "Content-Type: application/json" \
  -d '{"vigor":34,"mind":17,"endurance":18,"strength":18,"dexterity":34,"intelligence":7,"faith":8,"arcane":11}'
```

---

## Tests

```bash
cd backend && npm test   # 43 tests — parser, inventory scanner, item store, advisor
```

---

## Fuentes de datos

| Archivo | Fuente |
|---------|--------|
| `weapons.json`, `armors.json`, `talismans.json`, `spells.json` | [fanapis.com](https://eldenring.fanapis.com) (imágenes + stats base) |
| `gameIds.json` | [Deskete/EldenRingResources](https://github.com/Deskete/EldenRingResources) — IDs reales de armas |
| `armorIds.json` | [ClayAmore/ER-Save-Editor](https://github.com/ClayAmore/ER-Save-Editor) — IDs de EquipParamProtector |
| `talismanIds.json` | ClayAmore/ER-Save-Editor — IDs de EquipParamAccessory |
| `gemIds.json` | ClayAmore/ER-Save-Editor — IDs de Ashes of War |
| Fórmulas de stats derivados | Comunidad de Elden Ring (interpolación piecewise reverse-engineered) |

---

## Limitaciones conocidas

- Las imágenes de ítems dependen de disponibilidad de `fanapis.com`; si el CDN falla, se muestran los SVG placeholders
- El Attack Rating estimado en el Advisor es una aproximación (basada en escalado de fanapis); puede diferir levemente del valor en juego
- No se soportan saves de consola (PS4/PS5/Xbox) — solo PC Steam (`.sl2`)

---

## Licencia

MIT — Este proyecto no está afiliado con FromSoftware ni Bandai Namco.
