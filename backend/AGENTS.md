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
│   └── sync-data.ts          # One-time: descarga JSON de ítems (npm run sync-data)
├── src/
│   ├── index.ts              # Servidor Express: rutas, middleware, error handler
│   ├── data/                 # JSON estáticos (commiteados, actualizados por sync-data)
│   │   ├── weapons.json
│   │   ├── armors.json
│   │   ├── talismans.json
│   │   └── spells.json
│   ├── items/                # Base de datos de ítems en memoria + advisor
│   │   ├── types.ts          # Weapon, Armor, Talisman, Spell, WeaponFilter, etc.
│   │   ├── store.ts          # ItemStore singleton: carga JSON → queries tipadas
│   │   ├── advisor.ts        # getAdvisorResult(): recomendaciones por AR estimado
│   │   ├── index.ts          # Re-exports públicos
│   │   └── __tests__/
│   │       ├── store.test.ts
│   │       └── advisor.test.ts
│   ├── inventory/            # Lectura de inventario/equipo del .sl2
│   │   ├── types.ts          # InventoryItem, EquippedItems, InventoryScanResult, etc.
│   │   ├── constants.ts      # Offsets de equipo e inventario (relativos al slot data)
│   │   ├── scanner.ts        # scanInventory(slotData): equipo + inventario
│   │   ├── index.ts          # Re-exports públicos
│   │   └── __tests__/
│   │       └── scanner.test.ts
│   └── parser/               # EXISTENTE — sin cambios
│       ├── types.ts
│       ├── constants.ts
│       ├── bnd4.ts
│       ├── summary.ts
│       ├── stats.ts
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
Healthcheck. Devuelve `{ status: "ok", timestamp }`.
Usado por Docker Compose para `depends_on: condition: service_healthy`.

### `POST /api/parse`
**Body:** `multipart/form-data`, campo `savefile` (archivo `.sl2`).

**Respuesta exitosa:**
```json
{
  "fileSize": 26214400,
  "totalSlots": 10,
  "activeSlots": 2,
  "characters": [
    {
      "slot": 0,
      "name": "Tarnished",
      "level": 150,
      "playtime": "42h 17m 3s",
      "stats": {
        "vigor": 60, "mind": 20, "endurance": 30,
        "strength": 50, "dexterity": 15,
        "intelligence": 9, "faith": 9, "arcane": 7
      }
    }
  ]
}
```

**Errores:**
- `400` — no se envió archivo o no es `.sl2`
- `422` — archivo válido pero no parseable (ParseError)

### `GET /api/items/weapons`
Lista todas las armas con filtros opcionales.

**Query params:**
| Param   | Descripción                                                   |
|---------|---------------------------------------------------------------|
| `type`  | Tipo de arma (`Katana`, `Greatsword`, `Straight Sword`, ...) |
| `canUse`| `true` para filtrar por stats del personaje                  |
| `str`, `dex`, `int`, `fai`, `arc` | Stats del personaje (requeridos si `canUse=true`) |

**Respuesta:** `{ count: number, data: Weapon[] }`

### `GET /api/items/weapons/:id`
Detalle de un arma por su ID. **404** si no existe.

### `GET /api/items/armors`
Lista todas las armaduras. **Respuesta:** `{ count, data: Armor[] }`

### `GET /api/items/talismans`
Lista todos los talismanes. **Respuesta:** `{ count, data: Talisman[] }`

### `GET /api/items/spells`
Lista todos los hechizos. **Respuesta:** `{ count, data: Spell[] }`

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
      "weapon": { "id": 1000000, "name": "Uchigatana", ... },
      "estimatedAR": 312,
      "canEquip": true,
      "nearThreshold": [{ "stat": "dexterity", "currentValue": 34, "pointsNeeded": 6, "arGain": 8 }]
    }
  ],
  "nearlyUsable": [...],
  "wastedStats": ["intelligence"]
}
```

**Query params opcionales:** `top` (default 10), `nearlyRange` (default 5).

### `POST /api/parse` (ampliado)
Ahora incluye `equipped` en cada personaje (ítems equipados leídos del .sl2).
Con `?inventory=true` también incluye el inventario completo categorizado.

```json
{
  "characters": [{
    "slot": 0, "name": "Zhyak", "level": 68,
    "stats": { ... },
    "equipped": {
      "rightHand": [{ "rawId": 123, "baseId": 123, "name": "Uchigatana" }, ...],
      "leftHand": [...],
      "head": { ... }, "chest": { ... }, "hands": { ... }, "legs": { ... },
      "talismans": [...]
    }
  }]
}
```

### `POST /api/debug`
Herramienta de diagnóstico: devuelve hex dumps de regiones clave del archivo.
Ahora incluye dump de `equipmentBase` (offset 0x370 dentro del slot data).

**Query params:**
| Param    | Tipo   | Default | Descripción                             |
|----------|--------|---------|-----------------------------------------|
| `slot`   | 0-9    | 0       | Slot a inspeccionar                     |
| `offset` | hex/dec | —      | Offset adicional para dump libre        |
| `length` | dec    | 64      | Bytes a mostrar en el dump libre        |

Útil para calibrar offsets cuando el parser devuelve datos incorrectos.

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
         Cada entrada:
           0x00: dataOffset (uint32) — offset absoluto del dato
           0x08: dataSize   (uint32) — tamaño del dato

0x310  Datos de slots de personaje (entradas 0-9)
         Cada slot: 0x280000 bytes (2 621 440)
         Stride entre slots: 0x280010 (datos + 0x10 padding)

0x19003B0  Datos de sistema (entrada 10) — resumen de personajes
```

### Sección de resumen (offsets absolutos)

| Campo             | Offset absoluto           | Tipo       |
|-------------------|---------------------------|------------|
| Array activo[0-9] | `0x1901D04 + slot`        | uint8      |
| Nombre[n]         | `0x1901D0E + n×0x24C`     | UTF-16LE, 32 bytes |
| Nivel[n]          | `0x1901D0E + n×0x24C + 0x22` | uint16  |
| Playtime[n]       | `0x1901D0E + n×0x24C + 0x26` | uint32 (segundos) |

Fuentes: `Ariescyn/EldenRing-Save-Manager`, `dsyer/jersc`, `mi5hmash/SL2Bonfire`.

### Atributos (stats) — búsqueda por patrón

Los stats no tienen offset fijo documentado públicamente. Se localizan por el
invariante de Elden Ring (válido para todas las clases):

```
vigor + mind + endurance + strength + dexterity + intelligence + faith + arcane
= nivel + 79
```

- Cada atributo: `uint32 LE` (4 bytes), rango `[1, 99]`
- Orden: vigor → mind → endurance → strength → dexterity → intelligence → faith → arcane
- Validación cruzada: `uint16` a `+44 bytes` desde la base debe coincidir con el nivel

---

## Convenciones de código

### TypeScript
- `strict: true` — no hay excepciones.
- Prefiero `type` sobre `interface` solo para uniones. Para objetos, `interface`.
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
- Comando: `npm test`.

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

# Debug de offsets del slot 0:
curl -X POST "http://localhost:3001/api/debug?slot=0" \
  -F "savefile=@/ruta/a/ER0000.sl2"
```

Si el nombre aparece vacío o corrupto, usar `/api/debug` para ver el hex dump
y comparar contra los offsets en `constants.ts`.

---

## Checklist para agregar una feature nueva

1. Si el feature toca el formato binario → actualizar `constants.ts` primero.
2. Si agrega lógica de parsing → módulo nuevo en `parser/` con su test.
3. Si agrega un endpoint → documentarlo aquí en la sección API.
4. `npm test` debe pasar en verde antes de commitear.
5. `npx tsc --noEmit` sin errores.
6. Reconstruir imagen Docker: `docker compose build backend`.
