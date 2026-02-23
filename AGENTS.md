# AGENTS.md — Elden Ring Build Advisor

Guía para agentes de IA que trabajen en este repositorio.
Leer este archivo **antes** de tocar cualquier código.

---

## Estructura del repositorio

```
elden-ring-build-advisor/
├── backend/          # API REST (Node.js + TypeScript + Express)
├── frontend/         # UI (React 19 + Vite + TypeScript)
├── docker-compose.yml
└── AGENTS.md         # Este archivo
```

---

## Backend

### Stack

| Tech | Versión | Rol |
|------|---------|-----|
| Node.js | 22+ | Runtime |
| TypeScript | 5.7 | Lenguaje |
| Express | 4.x | HTTP server |
| Multer | 2.x | Upload de .sl2 (memoryStorage) |
| ts-node-dev | 2.x | Dev server con hot reload |
| Jest + ts-jest | 30.x | Tests |

### Comandos

```bash
cd backend
npm run dev         # Dev server en http://localhost:3001 (hot reload)
npm run build       # Compilar a dist/
npm start           # Correr dist/index.js (producción)
npm test            # Tests (43 tests, deben pasar todos)
npm run sync-data   # Regenerar src/data/*.json desde fanapis.com
```

### Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Estado del servidor + conteo de ítems cargados |
| POST | `/api/parse` | Parsea .sl2 → personajes con stats, equipo, inventario. Multipart `savefile`. Query: `inventory=true` para inventario completo |
| POST | `/api/debug` | Dump hex de offsets clave. Query: `slot`, `level`, `offset`, `search`, `scanWeapons` |
| GET | `/api/items/weapons` | Lista armas. Query: `type`, `str`, `dex`, `int`, `fai`, `arc`, `canUse=true` |
| GET | `/api/items/weapons/:id` | Arma por ID |
| GET | `/api/items/armors` | Lista armaduras |
| GET | `/api/items/talismans` | Lista talismanes |
| GET | `/api/items/spells` | Lista hechizos |
| POST | `/api/advisor` | Body: stats del personaje → `usable`, `nearlyUsable`, `wastedStats` |

### Arquitectura interna

```
backend/src/
├── index.ts              # Express app + rutas
├── parser/               # Lectura del .sl2 binario
│   ├── index.ts          # parseSl2(), hexDump(), summaryOffsetsForSlot()
│   ├── bnd4.ts           # Estructura BND4 del save file
│   ├── stats.ts          # findStats() — busca los 8 atributos por nivel
│   ├── summary.ts        # Offsets clave por slot
│   ├── constants.ts      # Offsets globales (BND4, slot size, etc.)
│   └── types.ts
├── items/                # Catálogo de ítems del juego
│   ├── store.ts          # ItemStore singleton — carga weapons/armors/talismans/spells.json
│   ├── advisor.ts        # getAdvisorResult() — ranking de armas por AR estimado
│   ├── types.ts          # Weapon, Armor, Talisman, Spell, Defense, etc.
│   └── index.ts
├── inventory/            # Lectura de equipo equipado + inventario
│   ├── scanner.ts        # scanInventory() — lee ChrAsm2 + ga_items_data
│   ├── constants.ts      # Offsets dentro del slot data
│   ├── types.ts          # EquippedWeapon, EquippedItems, Inventory, etc.
│   └── index.ts
└── data/                 # JSONs generados por sync-data (NO editar a mano)
    ├── weapons.json       # 307 armas con IDs reales (gameIds.json como fuente)
    ├── armors.json        # 568 armaduras con 8 tipos de defensa
    ├── talismans.json     # 87 talismanes
    ├── spells.json        # 169 hechizos
    ├── gameIds.json       # IDs reales de armas (Deskete/EldenRingResources)
    ├── armorIds.json      # IDs de EquipParamProtector (623 entradas)
    └── gemIds.json        # IDs de Ashes of War
```

### Lectura del .sl2 — puntos críticos

El parser reverse-engineered contra el formato BND4 de FromSoftware:

- **Slot size**: `0x280010` bytes por slot; slot data comienza en `offset 0x310 + slot * 0x280010`
- **Stats**: `findStats()` busca los 8 atributos por nivel de personaje (signature pattern)
- **ChrAsm2** (equipo equipado) = `vigor_offset + 0x310`, 96 bytes:
  - `+0x00..+0x17` → LH[0..2] / RH[0..2] (interleaved: LH1,RH1,LH2,RH2,LH3,RH3)
  - `+0x18..+0x27` → arrows + bolts
  - `+0x28..+0x37` → 4 campos desconocidos (ojo: el Rust de ER-Save-Editor los etiqueta mal)
  - `+0x38..+0x44` → HEAD, CHEST, ARMS, LEGS
  - `+0x48` → unk; `+0x4C..+0x58` → talisman[0..3]
- **gaitem_handle** — high byte indica categoría:
  - `0x80xxxxxx` → arma (weapon)
  - `0x90xxxxxx` → armadura (armor)
  - `0xA0xxxxxx` → talismán
- **IDs de armas**: `baseId = floor(item_id / 100) * 100`, `upgradeLevel = item_id % 100`
- **IDs de armadura**: `baseId = item_id XOR 0x10000000`
- **IDs de talismán**: `baseId = handle XOR 0xA0000000`

### fanapis — gotchas en campos de defensa

La API de fanapis usa nombres distintos a los esperados:
- `"Phy"` en lugar de `"physical"`
- `"Ligt"` en lugar de `"lightning"` (**typo en la API**)
- El campo `dmgNegation` es un array de `{ name, amount }` — buscar con `getDef(key)` case-insensitive

Tras corregir esto y regenerar `armors.json`:
- 549/568 armaduras tienen `physical > 0`
- 562/568 armaduras tienen `lightning > 0`

---

## Frontend

### Stack

| Tech | Versión | Rol |
|------|---------|-----|
| React | 19 | UI |
| TypeScript | 5.7 | Lenguaje |
| Vite | 6.x | Bundler / dev server |
| CSS Modules | — | Estilos por componente |

### Comandos

```bash
cd frontend
npm run dev      # Dev server en http://localhost:5173 (hot reload)
npm run build    # Build de producción en dist/
npm run preview  # Previsualizar el build
```

### Estructura de componentes

```
frontend/src/
├── main.tsx
├── App.tsx               # Máquina de estados: 'upload' | 'select' | 'build'
├── App.css               # Variables CSS globales del tema Elden Ring
├── types.ts              # Tipos espejo de las respuestas del backend
├── api/
│   └── client.ts         # parseSave(), getAdvisorRecommendations() — fetch tipado
├── hooks/
│   └── useMountAnimation.ts  # rAF doble-render para activar transiciones CSS en mount
└── components/
    ├── UploadPage/       # Drop zone + botón cargar .sl2
    ├── CharacterSelect/  # Cards de selección si hay múltiples personajes activos
    ├── BuildPage/        # Layout principal: stats + equipo + advisor + inventario
    ├── StatsPanel/       # 8 atributos con barras (VIG/MND/END/STR/DEX/INT/FAI/ARC)
    ├── DerivedStatsPanel/# HP, FP, Stamina, Equip Load, Attack (arma RH), Defense/Dmg Negation
    ├── EquipmentGrid/    # Armas LH/RH, armadura (head/chest/arms/legs), talismanes
    ├── ItemSlot/         # Slot individual: imagen fanapis, nombre, nivel de mejora
    ├── AdvisorPanel/     # Top-N armas recomendadas por AR estimado
    └── InventoryPanel/   # Tabs: Armas | Armaduras | Talismanes | Hechizos
```

### Tema visual (CSS variables en App.css)

```css
--bg-base:      #0a0906   /* fondo global */
--bg-panel:     #16120b   /* paneles */
--bg-slot:      #1f1a10   /* slots de ítem */
--gold:         #c9a74f   /* acento principal */
--gold-dim:     #7a6130   /* acento tenue */
--gold-bright:  #e8c97a   /* acento brillante (hover) */
--text:         #e8d5a0   /* texto normal */
--text-dim:     #7a6e5a   /* texto secundario */
--border:       #3a2e18   /* bordes base */
--border-gold:  #5a4820   /* bordes destacados */
--slot-size:    58px      /* tamaño de slots de equipo */
```

**Regla de diseño crítica**: NO usar `border-radius` con valores positivos en px.
La estética de Elden Ring es angular/cuadrada. Todos los bordes son `border-radius: 0`.

### Fórmulas de stats derivados (DerivedStatsPanel)

Implementadas con interpolación piecewise exacta (reverse-engineered por la comunidad):

```
HP (Vigor):
  v ≤ 25 → 300  + 500 * ((v-1)/24)^1.5
  v ≤ 40 → 800  + 650 * ((v-25)/15)^1.1
  v ≤ 60 → 1450 + 450 * (1 - (1-(v-40)/20)^1.2)
  v ≤ 99 → 1900 + 200 * (1 - (1-(v-60)/39)^1.2)

FP (Mind):
  m ≤ 15 → 50  + 45  * ((m-1)/14)
  m ≤ 35 → 95  + 105 * ((m-15)/20)
  m ≤ 60 → 200 + 150 * (1 - (1-(m-35)/25)^1.2)
  m ≤ 99 → 350 + 100 * ((m-60)/39)

Stamina (Endurance):
  e ≤ 15 → 80  + 25 * ((e-1)/14)
  e ≤ 30 → 105 + 25 * ((e-15)/15)
  e ≤ 50 → 130 + 25 * ((e-30)/20)
  e ≤ 99 → 155 + 15 * ((e-50)/49)

Max Equip Load (Endurance):
  e ≤ 8  → 45
  e ≤ 25 → 45  + 27 * ((e-8)/17)
  e ≤ 60 → 72  + 48 * ((e-25)/35)^1.1
  e ≤ 99 → 120 + 40 * ((e-60)/39)
```

### Animaciones

- **Barras**: `useMountAnimation()` hook — activa transición CSS tras 1 rAF.
  Curva: `cubic-bezier(0.16, 1, 0.3, 1)` (easeOutExpo), duración 0.9s.
  Stagger: `transitionDelay: index * 60ms` por barra.
- **Entrada de página**: `fadeSlideDown` (header), `fadeSlideUp` (sidebar/content)
- **Nombre del personaje**: `nameGlow` pulse cada 4s
- **ItemSlot**: `slotReveal` (scale 0.88→1 + fade), stagger de 45ms por slot
- **Hover ItemSlot**: shimmer sweep diagonal (`::after`) + rim light gold (`::before`)
- **Título UploadPage**: `titleReveal` (letter-spacing colapsa 0.5em→0.15em)
- **Spinner**: cuadrado (sin border-radius), rotación 1.2s–1.4s linear

### Flujo de la app

```
Upload .sl2
    ↓
POST /api/parse
    ↓
1 personaje activo → BuildPage directamente
N personajes activos → CharacterSelect → BuildPage
    ↓
BuildPage monta:
  - StatsPanel (8 atributos)
  - DerivedStatsPanel (HP/FP/Stamina/Load/Attack/Defense)
  - EquipmentGrid (armas + armadura + talismanes)
  - AdvisorPanel (POST /api/advisor con stats)
  - InventoryPanel (GET /api/parse?inventory=true)
```

---

## Imágenes de ítems

Todas las imágenes vienen de `https://eldenring.fanapis.com/images/{categoría}/{id}.png`.
El campo `image` está presente en cada ítem de `weapons.json`, `armors.json`, `talismans.json`, `spells.json`.
En el frontend, `<ItemSlot>` muestra la imagen si existe, o un placeholder `🗡️/🛡️/✨` si no.

---

## Personaje de prueba

- **Nombre**: Zhyak, nivel 68, slot 2
- **Save**: `/mnt/c/Users/pacho/AppData/Roaming/EldenRing/.../ER0000.sl2`
- **Stats**: VIG 34, MND 17, END 18, STR 18, DEX 34, INT 7, FAI 8, ARC 11
- **Arma**: Bloodhound's Fang +4 (RH) / Torch (LH)
- **Armadura**: Banished Knight Helm (Altered) + Godrick Knight set
- **Talismanes**: Prince Of Death's Pustule, Kindred Of Rot's Exultation

---

## Tests

```bash
cd backend && npm test   # 43 tests — deben pasar todos antes de commitear
```

Los tests cubren: parser BND4, findStats, scanner de inventario, store de ítems, advisor.
No hay tests en el frontend actualmente.

---

## Convenciones

- **TypeScript estricto**: no usar `any`, preferir tipos explícitos
- **CSS Modules**: cada componente tiene su `.module.css`, no estilos inline excepto valores dinámicos (animaciones, colores de barras)
- **Sin border-radius positivo** en barras, paneles, slots ni badges
- **Español** en comentarios, nombres de variables de UI y logs del servidor
- **No editar `src/data/*.json` a mano** — siempre regenerar con `npm run sync-data`
- **Multer field name**: el campo del formulario multipart es `savefile` (no `save` ni `file`)
