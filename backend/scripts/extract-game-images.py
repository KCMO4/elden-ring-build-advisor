"""
extract-game-images.py — Extrae íconos de ítems de los archivos desempaquetados del juego.

Prerrequisitos:
  1. UXM Selective Unpacker desempaquetó Game/menu/hi/ (genera .tpf.dcx → carpetas con .dds)
  2. WitchyBND procesó esas carpetas (o usó batch mode)

Uso (desde WSL2, una vez que los .dds estén listos):
  python3 backend/scripts/extract-game-images.py

El script:
  - Busca todos los .dds en Game/menu/hi/
  - Los convierte a .png con Pillow
  - Mapea nombre de textura → ID de ítem usando los JSON de src/data/
  - Copia los .png a frontend/public/items/
  - Actualiza los JSON (weapons/armors/talismans/spells) con rutas locales /items/{id}.png
"""

import os
import re
import json
import shutil
import pathlib
from typing import Optional

# ── Rutas ────────────────────────────────────────────────────────────────────

GAME_DIR = pathlib.Path("/mnt/c/Program Files (x86)/Steam/steamapps/common/ELDEN RING/Game")
MENU_HI  = GAME_DIR / "menu" / "hi"
DATA_DIR = pathlib.Path(__file__).parent.parent / "src" / "data"
OUT_DIR  = pathlib.Path(__file__).parent.parent.parent / "frontend" / "public" / "items"

# ── Pillow para conversión DDS → PNG ─────────────────────────────────────────

try:
    from PIL import Image
    HAS_PILLOW = True
except ImportError:
    HAS_PILLOW = False
    print("WARN: Pillow no está instalado. Ejecutá: python3 -m pip install pillow")

# ── Carga de datos de ítems ───────────────────────────────────────────────────

def load_json(name: str) -> list[dict]:
    p = DATA_DIR / name
    if not p.exists():
        return []
    return json.loads(p.read_text())

def save_json(name: str, data: list[dict]) -> None:
    p = DATA_DIR / name
    p.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    print(f"  Guardado {name} ({len(data)} ítems)")

# ── Mapeo nombre de textura → ID de ítem ─────────────────────────────────────
#
# En Elden Ring, los íconos de ítems del menú siguen una convención:
#
#   MENU_Knowledge_[categoria]_[numero_ID]
#
# Ejemplos reales:
#   MENU_Knowledge_wep_1         → arma ID 1060000 (Bloodhound's Fang) ???
#   MENU_Knowledge_Protector_1   → armadura ID
#   MENU_Knowledge_Accessory_1   → talismán ID
#   MENU_Knowledge_Magic_1       → hechizo ID
#
# La correlación exacta se descubre analizando los archivos desempaquetados.

CATEGORY_PATTERNS = {
    # Armas (EquipParamWeapon IDs)
    r'(?i)MENU_Knowledge_wep[_\s]*(\d+)'          : ('weapon',    'weapons.json'),
    r'(?i)Knowledge_Wep[_\s]*(\d+)'               : ('weapon',    'weapons.json'),
    # Armaduras (EquipParamProtector IDs)
    r'(?i)MENU_Knowledge_Protector[_\s]*(\d+)'    : ('armor',     'armors.json'),
    r'(?i)Knowledge_Armor[_\s]*(\d+)'             : ('armor',     'armors.json'),
    # Talismanes (EquipParamAccessory IDs)
    r'(?i)MENU_Knowledge_Accessory[_\s]*(\d+)'    : ('talisman',  'talismans.json'),
    r'(?i)Knowledge_Acc[_\s]*(\d+)'               : ('talisman',  'talismans.json'),
    # Hechizos (EquipParamGoods + Magic IDs)
    r'(?i)MENU_Knowledge_Magic[_\s]*(\d+)'        : ('spell',     'spells.json'),
    r'(?i)MENU_Knowledge_Goods[_\s]*(\d+)'        : ('spell',     'spells.json'),
}

def parse_texture_name(tex_name: str) -> Optional[tuple[str, int]]:
    """Intenta extraer (categoría, ID numérico) del nombre de una textura."""
    for pattern, (category, _) in CATEGORY_PATTERNS.items():
        m = re.search(pattern, tex_name)
        if m:
            return category, int(m.group(1))
    return None

# ── Construcción de índices inversos (ID → posición en JSON) ──────────────────

def build_id_index(items: list[dict]) -> dict[int, int]:
    """Devuelve { item_id: list_index }"""
    return {item['id']: i for i, item in enumerate(items)}

# ── Conversión DDS → PNG ──────────────────────────────────────────────────────

def dds_to_png(dds_path: pathlib.Path, png_path: pathlib.Path) -> bool:
    if not HAS_PILLOW:
        return False
    try:
        img = Image.open(dds_path)
        # Algunos DDS de From Software son BC1/BC3 con canal alpha invertido
        if img.mode == 'RGBA':
            pass  # ok
        elif img.mode == 'P':
            img = img.convert('RGBA')
        png_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(png_path, 'PNG')
        return True
    except Exception as e:
        print(f"    WARN: no se pudo convertir {dds_path.name}: {e}")
        return False

# ── Búsqueda de archivos DDS desempaquetados ──────────────────────────────────

def find_dds_files(search_dir: pathlib.Path) -> list[pathlib.Path]:
    """Busca recursivamente archivos .dds en el directorio de menú."""
    dds_files = list(search_dir.rglob("*.dds"))
    print(f"  Encontrados {len(dds_files)} archivos .dds en {search_dir}")
    return dds_files

# ── Punto de entrada ──────────────────────────────────────────────────────────

def main() -> None:
    print("=== extract-game-images: Extracción de íconos del juego ===\n")

    # Verificar que la carpeta menu/hi/ existe (desempaquetada por UXM)
    if not MENU_HI.exists():
        print(f"ERROR: No se encontró la carpeta menu/hi/ en:")
        print(f"  {MENU_HI}")
        print()
        print("Por favor completá el Paso 1:")
        print("  1. Descargá UXM Selective Unpacker:")
        print("     https://github.com/Nordgaren/UXM-Selective-Unpacker/releases")
        print("  2. Apuntalo a eldenring.exe")
        print("  3. Marcá SOLO 'menu' y hacé Unpack (~200 MB)")
        print()
        print("Luego completá el Paso 2:")
        print("  1. Descargá WitchyBND:")
        print("     https://github.com/ividyon/WitchyBND/releases")
        print("  2. Arrastrá la carpeta Game/menu/hi/ a WitchyBND")
        print("  3. Esperá que procese todos los .tpf.dcx")
        return

    dds_files = find_dds_files(MENU_HI)
    if not dds_files:
        print("No se encontraron archivos .dds.")
        print("Asegurate de haber procesado la carpeta con WitchyBND.")
        return

    # Cargar JSON de ítems
    weapons_data  = load_json('weapons.json')
    armors_data   = load_json('armors.json')
    talismans_data = load_json('talismans.json')
    spells_data   = load_json('spells.json')

    weapons_idx  = build_id_index(weapons_data)
    armors_idx   = build_id_index(armors_data)
    talisman_idx = build_id_index(talismans_data)
    spells_idx   = build_id_index(spells_data)

    # Mapeo
    DATA_MAP = {
        'weapon':   (weapons_data,   weapons_idx),
        'armor':    (armors_data,    armors_idx),
        'talisman': (talismans_data, talisman_idx),
        'spell':    (spells_data,    spells_idx),
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    matched = 0
    converted = 0
    unmatched_samples = []

    print(f"\nProcesando {len(dds_files)} archivos...\n")

    for dds_path in dds_files:
        tex_name = dds_path.stem  # nombre sin extensión
        parsed = parse_texture_name(tex_name)

        if parsed is None:
            if len(unmatched_samples) < 10:
                unmatched_samples.append(tex_name)
            continue

        category, raw_id = parsed
        if category not in DATA_MAP:
            continue

        items_list, idx = DATA_MAP[category]
        if raw_id not in idx:
            continue

        # Convertir DDS → PNG
        item_pos = idx[raw_id]
        item = items_list[item_pos]
        png_name = f"{category}_{raw_id}.png"
        png_path = OUT_DIR / png_name

        if dds_to_png(dds_path, png_path):
            # Actualizar JSON con ruta local
            items_list[item_pos]['image'] = f"/items/{png_name}"
            matched += 1
            converted += 1
            if converted % 50 == 0:
                print(f"  {converted} íconos convertidos...")

    # Guardar JSONs actualizados
    print(f"\n{'='*54}")
    print(f"Resultados:")
    print(f"  .dds encontrados : {len(dds_files)}")
    print(f"  Mapeados a ítems : {matched}")
    print(f"  PNG generados    : {converted}")
    if unmatched_samples:
        print(f"\n  Ejemplos sin mapear (ver/ajustar CATEGORY_PATTERNS):")
        for s in unmatched_samples:
            print(f"    {s}")
    print()

    if converted > 0:
        save_json('weapons.json', weapons_data)
        save_json('armors.json', armors_data)
        save_json('talismans.json', talismans_data)
        save_json('spells.json', spells_data)
        print(f"\n✓ {converted} íconos guardados en {OUT_DIR}")
        print("  El frontend ahora los sirve desde /items/")
    else:
        print("No se convirtió ningún ícono.")
        print("Revisá los patrones de nombre en CATEGORY_PATTERNS.")

def diagnose() -> None:
    """
    Modo diagnóstico: lista los primeros 50 nombres de texturas DDS
    para ayudar a ajustar los patrones de CATEGORY_PATTERNS.

    Uso: python3 extract-game-images.py diagnose
    """
    print("=== Modo diagnóstico: mostrando nombres de texturas DDS ===\n")
    if not MENU_HI.exists():
        print(f"La carpeta {MENU_HI} no existe. Desempaquetá el juego primero.")
        return

    dds_files = find_dds_files(MENU_HI)
    if not dds_files:
        print("No hay archivos DDS. Procesá con WitchyBND primero.")
        return

    print("Primeros 50 nombres de texturas:\n")
    for f in dds_files[:50]:
        parsed = parse_texture_name(f.stem)
        tag = f"→ {parsed[0]} ID {parsed[1]}" if parsed else "→ (sin mapeo)"
        print(f"  {f.stem:<60} {tag}")

    # Prefijos únicos
    prefixes = set()
    for f in dds_files:
        parts = f.stem.split('_')
        if len(parts) >= 2:
            prefixes.add('_'.join(parts[:3]))
    print(f"\nPrefijos únicos encontrados ({len(prefixes)} total):")
    for p in sorted(prefixes)[:30]:
        print(f"  {p}")


if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == 'diagnose':
        diagnose()
    else:
        main()
