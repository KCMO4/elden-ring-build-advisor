# AGENTS.md — Backend: Elden Ring Build Advisor

Guía de referencia para agentes de IA (y humanos) que trabajen en el backend.
Describe la arquitectura, las convenciones y las reglas de trabajo.

---

## Stack

| Capa        | Tecnología                     |
|-------------|--------------------------------|
| Runtime     | Node.js 22 (Alpine en Docker)  |
| Lenguaje    | TypeScript 5.7, target ES2022  |
| Framework   | Express 4                      |
| Upload      | Multer 2 (memoria, máx. 50 MB) |
| Tests       | Jest 30 + ts-jest              |
| Dev hot-reload | ts-node-dev               |

---

## Estructura de carpetas

```
backend/
├── scripts/
│   ├── sync-data.ts          # Descarga JSON de ítems de fanapis.com (npm run sync-data)
│   └── check-images.ts       # Diagnóstico: cobertura de imágenes por categoría
├── src/
│   ├── index.ts              # Servidor Express: rutas, middleware, error handler
│   ├── data/                 # JSON estáticos (commiteados, actualizados por sync-data)
│   │   ├── weapons.json      # 307 armas con damage, scaling, weight, image
│   │   ├── armors.json       # 568 armaduras con 8 tipos de defensa, weight, image
│   │   ├── talismans.json    # 87 talismanes con name, effect (texto), image
│   │   ├── spells.json       # 169 hechizos
│   │   ├── shields.json      # Escudos con stability (Guard Boost), defense, weight
│   │   ├── ashes.json        # 90 Ashes of War con affinity + skill
│   │   ├── spirits.json      # 64 Spirit Ashes con fpCost, hpCost, effect
│   │   ├── consumables.json  # 462 consumibles (flasks, boluses, food, etc.)
│   │   ├── gameIds.json      # IDs reales de armas (Deskete/EldenRingResources)
│   │   ├── armorIds.json     # IDs de EquipParamProtector (623 entradas)
│   │   ├── talismanIds.json  # IDs de EquipParamAccessory (IDs reales del juego)
│   │   └── gemIds.json       # IDs de Ashes of War (EquipParamGem)
│   ├── items/                # Base de datos de ítems en memoria + advisor
│   │   ├── types.ts          # Weapon, Armor, Talisman, Spell, Shield, Ash, Spirit, Consumable
│   │   ├── store.ts          # ItemStore singleton: carga JSON → queries tipadas
│   │   │                     # getWeaponByName/ByBaseId, getArmorByName, getTalismanByName,
│   │   │                     # getShieldByName, getAshByName, getSpiritByName, getConsumableByName
│   │   ├── advisor.ts        # getAdvisorResult(): recomendaciones por AR estimado
│   │   ├── index.ts          # Re-exports públicos
│   │   └── __tests__/
│   │       ├── store.test.ts
│   │       └── advisor.test.ts
│   ├── inventory/            # Lectura de inventario/equipo del .sl2
│   │   ├── types.ts          # RawInventoryItem, ResolvedInventoryItem, EquippedWeapon,
│   │   │                     # EquippedItems, Inventory, InventoryScanResult, ItemCategory
│   │   ├── constants.ts      # Offsets de equipo e inventario (relativos al slot data)
│   │   ├── scanner.ts        # scanInventory(slotData): equipo + inventario completo
│   │   │                     # resolveWeaponHandle, resolveArmorHandle, resolveTalismanHandle
│   │   ├── index.ts          # Re-exports públicos
│   │   └── __tests__/
│   │       └── scanner.test.ts
│   └── parser/               # Lectura del contenedor BND4 y stats del personaje
│       ├── types.ts
│       ├── constants.ts
│       ├── bnd4.ts
│       ├── summary.ts
│       ├── stats.ts          # findStats(): busca los 8 atributos por patrón
│       ├── index.ts
│       └── __tests__/
│           └── parser.test.ts
├── Dockerfile                # Multi-stage: base → deps → dev / production
├── .dockerignore
├── package.json
├── tsconfig.json
└── tsconfig.scripts.json     # Extiende tsconfig.json, incluye scripts/
```

---

## API REST

### `GET /health`
Healthcheck. Devuelve `{ status: "ok", timestamp, items: { weapons, armors, ... } }`.
Usado por Docker Compose para `depends_on: condition: service_healthy`.

### `POST /api/parse`
**Body:** `multipart/form-data`, campo `savefile` (archivo `.sl2`).
**Query:** `inventory=true` para incluir inventario completo.

**Respuesta exitosa:**
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
      "inventory": { ... }  // solo con ?inventory=true
    }
  ]
}
```

**Errores:**
- `400` — no se envió archivo, no es `.sl2`, o nombre de campo incorrecto (debe ser `savefile`)
- `422` — archivo válido pero no parseable (ParseError)

### `GET /api/items/weapons`

**Query params:**
| Param   | Descripción                                                   |
|---------|---------------------------------------------------------------|
| `type`  | Tipo de arma (`Katana`, `Greatsword`, `Straight Sword`, ...) |
| `canUse`| `true` para filtrar por stats del personaje                  |
| `str`, `dex`, `int`, `fai`, `arc` | Stats del personaje (requeridos si `canUse=true`) |

**Respuesta:** `{ count: number, data: Weapon[] }`

### `POST /api/advisor`
Dado un bloque de stats, devuelve recomendaciones de armas ordenadas por AR estimado.

**Body:** `application/json`
```json
{
  "vigor": 34, "mind": 17, "endurance": 18,
  "strength": 18, "dexterity": 34,
  "intelligence": 7, "faith": 8, "arcane": 11
}
```

**Respuesta:**
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

**Query params opcionales:** `top` (default 10), `nearlyRange` (default 5).

---

## Formato del archivo .sl2

### Contenedor BND4

```
0x000  BND4 header (0x40 bytes)
         ├─ 0x00: magic "BND4" (ASCII)
         ├─ 0x0C: fileCount (uint32 LE)  → usualmente 11
         ├─ 0x20: entryHeaderSize (uint32 LE) → 0x20 bytes/entrada
         └─ 0x28: dataOffset (uint32 LE)

0x040  Directorio de entradas (11 × 0x20 bytes)

0x310  Datos de slots de personaje (entradas 0-9)
         Cada slot: 0x280000 bytes (2 621 440)
         Stride entre slots: 0x280010 (datos + 0x10 padding)

0x19003B0  Datos de sistema (entrada 10) — resumen de personajes
```

### Layout de ChrAsm2 (equipo equipado)

`ChrAsm2` se localiza en `vigor_offset + 0x310` dentro del slot data. Tamaño: 96 bytes.

| Offset | Campo |
|--------|-------|
| +0x00 | LH[0] gaitem_handle |
| +0x04 | RH[0] gaitem_handle |
| +0x08 | LH[1] gaitem_handle |
| +0x0C | RH[1] gaitem_handle |
| +0x10 | LH[2] gaitem_handle |
| +0x14 | RH[2] gaitem_handle |
| +0x18..+0x27 | arrows[0,1] + bolts[0,1] |
| +0x28..+0x37 | 4 campos desconocidos (_unk0..3) |
| +0x38 | HEAD gaitem_handle |
| +0x3C | CHEST gaitem_handle |
| +0x40 | ARMS gaitem_handle |
| +0x44 | LEGS gaitem_handle |
| +0x48 | _unk4 |
| +0x4C..+0x58 | talisman[0..3] gaitem_handles |
| +0x5C | _unk5 |

> **Ojo**: el ER-Save-Editor (Rust) etiqueta +0x30/+0x34 como head/chest. Incorrecto.
> Los verdaderos slots de armadura están en +0x38..+0x44 (verificado con saves reales).

### Decodificación de gaitem_handles

| High byte | Categoría | Cómo obtener el ID real |
|-----------|-----------|------------------------|
| `0x80` | Arma | buscar en ga_items → `item_id`; `baseId = floor(id/100)*100`; `upgrade = id%100` |
| `0x90` | Armadura | buscar en ga_items → `item_id`; `armorId = item_id XOR 0x10000000` |
| `0xA0` | Talismán | sin ga_items; `talismanId = handle XOR 0xA0000000` |

### Tabla de fuentes de ID

| Categoría | Fuente primaria | Fallback |
|-----------|----------------|---------|
| Armas | `gameIds.json` (Deskete/EldenRingResources) | `ItemStore.getWeaponByBaseId()` |
| Armaduras | `armorIds.json` (ER-Save-Editor armor_name.rs) | `ItemStore.getArmorByBaseId()` |
| Talismanes | `talismanIds.json` (ER-Save-Editor accessory_name.rs) | — |
| Ashes of War | `gemIds.json` (ER-Save-Editor aow_name.rs) | — |

---

## Inventario completo

`scanItemArray()` localiza el array de ítems en el slot data usando el ítem ancla
"Tarnished Wizened Finger" (ID `0x4003D`). Cada entrada es de 8 bytes: `[itemId: u32, flag: u32]`.

Las categorías se deducen del nibble alto del itemId:

| Nibble | Categoría | Notas |
|--------|-----------|-------|
| 0x0 | weapon / ammo | ammo: baseId >= 50M |
| 0x1 | armor | IDs XOR 0x10000000 |
| 0x2 | talisman | — |
| 0x4 | consumable (+ spells, spirits, etc.) | subcategorizado por rango de ID y nombre |
| 0x8 | ash_of_war | EquipParamGem |

---

## Convenciones de código

### TypeScript
- `strict: true` — no hay excepciones.
- Preferir `interface` para objetos, `type` solo para uniones.
- Sin `any`. Si es inevitable, usar `unknown` + type guard.
- Nombres de constantes binarias en `SCREAMING_SNAKE_CASE`.
- Nombres de funciones en `camelCase`, archivos en `kebab-case`.

### Offsets binarios
- **Toda constante numérica de offset va en `parser/constants.ts`**, nunca hardcodeada en otros archivos.
- Comentar la fuente de cada offset (nombre del proyecto de referencia).
- Usar `0x` prefix para todos los offsets.

### Errores
- El parser lanza `ParseError` (subclase de `Error`) para archivos malformados.
- Express devuelve `422` para `ParseError`, `400` para errores de Multer.
- No capturar errores para silenciarlos; dejar que burbujeen al error handler.

### Tests
- Cada módulo del parser debe tener tests en `__tests__/`.
- Usar buffers sintéticos (no archivos reales) para los tests unitarios.
- Nombrar tests en español: `describe('módulo', () => test('comportamiento', ...))`.
- Comando: `npm test` (43 tests, deben pasar todos).

---

## Flujo de trabajo

### Desarrollo local
```bash
cd backend
npm install
npm run dev          # ts-node-dev con hot-reload en :3001
npm test             # Jest
```

### Con Docker
```bash
# Desde la raíz del proyecto:
docker compose up    # levanta backend (:3001) y frontend (:5173)
docker compose build backend   # rebuild solo el backend
```

### Verificar el parser con un .sl2 real
```bash
# Con el servidor corriendo:
curl -X POST http://localhost:3001/api/parse \
  -F "savefile=@/ruta/a/ER0000.sl2"

# Con inventario completo:
curl -X POST "http://localhost:3001/api/parse?inventory=true" \
  -F "savefile=@/ruta/a/ER0000.sl2"
```

---

## Checklist para agregar una feature nueva

1. Si el feature toca el formato binario → actualizar `constants.ts` primero.
2. Si agrega lógica de parsing → módulo nuevo en `parser/` con su test.
3. Si agrega un endpoint → documentarlo aquí en la sección API.
4. `npm test` debe pasar en verde antes de commitear.
5. `npx tsc --noEmit` sin errores.
6. Reconstruir imagen Docker si es necesario: `docker compose build backend`.
