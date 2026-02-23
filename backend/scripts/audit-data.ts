/**
 * audit-data.ts — Auditoría de calidad de datos de items.
 *
 * Comprueba completitud, anomalías y errores conocidos en los JSON de src/data/.
 * Genera un reporte de texto y sale con código 1 si hay bugs críticos.
 *
 * Uso:
 *   npx ts-node --project tsconfig.scripts.json scripts/audit-data.ts
 *   npx ts-node --project tsconfig.scripts.json scripts/audit-data.ts --save   (guarda reporte en audit-report.md)
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'src', 'data');
const SAVE_REPORT = process.argv.includes('--save');

// ── Tipos mínimos ─────────────────────────────────────────────
interface DefenseStats { physical: number; strike: number; slash: number; pierce: number; magic: number; fire: number; lightning: number; holy: number; }
interface DamageStats  { physical: number; magic: number; fire: number; lightning: number; holy: number; }
interface Weapon  { name: string; type: string; weight: number; damage: DamageStats; scaling: Record<string,string>; requirements: Record<string,number>; image?: string; }
interface Armor   { name: string; type: string; weight: number; defense: DefenseStats; image?: string; }
interface Talisman{ name: string; effect: string; image?: string; }
interface Spell   { name: string; type: string; requirements: Record<string,number>; image?: string; }
interface Shield  { name: string; stability: number; weight: number; image?: string; }
interface Ash     { name: string; affinity?: string; skill?: string; image?: string; }
interface Spirit  { name: string; fpCost: number; hpCost: number; effect?: string; image?: string; }
interface Consumable { name: string; effect?: string; image?: string; }

function load<T>(file: string): T[] {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) { console.warn(`  WARN: ${file} no existe`); return []; }
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as T[];
}

// ── Helpers de reporte ────────────────────────────────────────
const lines: string[] = [];
let criticalCount = 0;
let warningCount  = 0;

function h1(t: string) { lines.push('', `# ${t}`, ''); }
function h2(t: string) { lines.push('', `## ${t}`, ''); }
function row(label: string, value: string | number, status?: 'ok' | 'warn' | 'crit') {
  const mark = status === 'crit' ? '❌' : status === 'warn' ? '⚠️' : '✅';
  lines.push(`${mark}  **${label}**: ${value}`);
  if (status === 'crit') criticalCount++;
  if (status === 'warn') warningCount++;
}
function detail(msg: string) { lines.push(`    - ${msg}`); }
function note(msg: string)   { lines.push(`    > ${msg}`); }

// ── Carga de datos ────────────────────────────────────────────

const weapons    = load<Weapon>('weapons.json');
const armors     = load<Armor>('armors.json');
const talismans  = load<Talisman>('talismans.json');
const spells     = load<Spell>('spells.json');
const shields    = load<Shield>('shields.json');
const ashes      = load<Ash>('ashes.json');
const spirits    = load<Spirit>('spirits.json');
const consumables= load<Consumable>('consumables.json');

const TOTAL = weapons.length + armors.length + talismans.length + spells.length
            + shields.length + ashes.length + spirits.length + consumables.length;

// ── Auditoría ─────────────────────────────────────────────────

h1('Auditoría de datos — Elden Ring Build Advisor');
lines.push(`Fecha: ${new Date().toISOString().split('T')[0]}`);

h2('Resumen de cobertura');
lines.push(`| Categoría | Items |`);
lines.push(`|-----------|-------|`);
for (const [label, arr] of [
  ['Weapons',     weapons],
  ['Armors',      armors],
  ['Talismans',   talismans],
  ['Spells',      spells],
  ['Shields',     shields],
  ['Ashes of War',ashes],
  ['Spirits',     spirits],
  ['Consumables', consumables],
] as [string, unknown[]][]) {
  lines.push(`| ${label} | ${arr.length} |`);
}
lines.push(`| **TOTAL** | **${TOTAL}** |`);

// ══ WEAPONS ══════════════════════════════════════════════════
h2('Weapons');

// Duplicados
const wNameCount: Record<string, number> = {};
for (const w of weapons) wNameCount[w.name] = (wNameCount[w.name] ?? 0) + 1;
const duplicates = Object.entries(wNameCount).filter(([, n]) => n > 1);
if (duplicates.length > 0) {
  row('Duplicados', duplicates.length, 'crit');
  for (const [name, cnt] of duplicates) detail(`${name} × ${cnt}`);
} else {
  row('Duplicados', 'ninguno', 'ok');
}

// Sin daño
const noDamage = weapons.filter(w => !w.damage || Object.values(w.damage).every(v => v === 0));
if (noDamage.length > 0) {
  row('Sin damage', noDamage.length, 'crit');
  for (const w of noDamage) detail(`${w.name}`);
} else {
  row('Sin damage', 'ninguno', 'ok');
}

// Scaling grades inválidos
const validGrades = new Set(['-','E','D','C','B','A','S']);
const badGrade = weapons.filter(w => w.scaling && Object.values(w.scaling).some(v => !validGrades.has(v)));
if (badGrade.length > 0) {
  row('Scaling grades inválidos', badGrade.length, 'crit');
  for (const w of badGrade) detail(`${w.name}: ${JSON.stringify(w.scaling)}`);
} else {
  row('Scaling grades inválidos', 'ninguno', 'ok');
}

// Sin escalado (excluyendo staves y seals)
const noScaling = weapons.filter(w => {
  const t = w.type ?? '';
  if (t.includes('Staff') || t.includes('Seal')) return false;
  return !w.scaling || Object.values(w.scaling).every(v => v === '-');
});
row('Sin escalado útil (no-staves)', noScaling.length, noScaling.length > 0 ? 'warn' : 'ok');
note('Incluye crossbows/ballistas — fanapis no registra su STR/DEX scaling');
for (const w of noScaling) detail(`${w.name} [${w.type}]`);

// Weight=0 (sospechoso)
const zeroWeight = weapons.filter(w => {
  const t = w.type ?? '';
  return w.weight === 0 && t !== 'Fist' && !t.includes('Seal') && !t.includes('Staff');
});
if (zeroWeight.length > 0) {
  row('Weight=0 (no-fist, no-seal)', zeroWeight.length, 'warn');
  for (const w of zeroWeight) detail(`${w.name} [${w.type}]`);
} else {
  row('Weight=0 sospechoso', 'ninguno', 'ok');
}

// Sin requirements
const noReq = weapons.filter(w => !w.requirements || Object.values(w.requirements).every(v => v === 0));
row('Sin requirements', noReq.length, noReq.length > 0 ? 'warn' : 'ok');
for (const w of noReq) detail(`${w.name}`);

// Sin imagen
const noImg_w = weapons.filter(w => !w.image);
row('Sin imagen', noImg_w.length, noImg_w.length > 0 ? 'warn' : 'ok');

// Verificación spot-check de scaling (armas conocidas vs wiki)
// NOTA: fanapis almacena grados de escala en +0 (base). Los grados
// de las wikis suelen mostrar el upgrade máximo (+25 / +10 únicos),
// que son más altos. Esta tabla usa grados +0 para comparación justa.
h2('Weapons — Spot check de scaling (grados base +0)');
const EXPECTED_SCALING: Record<string, Record<string,string>> = {
  'Uchigatana':        { str:'D', dex:'D', int:'-', fai:'-', arc:'-' },
  "Bloodhound's Fang":{ str:'D', dex:'C', int:'-', fai:'-', arc:'-' },
  'Rivers Of Blood':   { str:'E', dex:'D', int:'-', fai:'-', arc:'D' },
  'Moonveil':          { str:'E', dex:'D', int:'C', fai:'-', arc:'-' },
  'Greatsword':        { str:'C', dex:'E', int:'-', fai:'-', arc:'-' },
  'Reduvia':           { str:'E', dex:'D', int:'-', fai:'-', arc:'D' },
  'Nagakiba':          { str:'D', dex:'C', int:'-', fai:'-', arc:'-' },
  // Armas estándar — grados base +0 (suelen subir al mejorar)
  'Claymore':          { str:'D', dex:'D', int:'-', fai:'-', arc:'-' },
  'Zweihander':        { str:'D', dex:'D', int:'-', fai:'-', arc:'-' },
  'Flamberge':         { str:'D', dex:'C', int:'-', fai:'-', arc:'-' },
};

let spotOk = 0, spotFail = 0;
for (const [name, expected] of Object.entries(EXPECTED_SCALING)) {
  const w = weapons.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (!w) { detail(`NO ENCONTRADO: ${name}`); continue; }
  const scl = w.scaling ?? {};
  const match = Object.entries(expected).every(([k, v]) => scl[k] === v);
  if (match) { spotOk++; }
  else {
    spotFail++;
    detail(`MISMATCH ${name} — esperado: ${JSON.stringify(expected)}, en JSON: ${JSON.stringify(scl)}`);
  }
}
row(`Spot check ${spotOk + spotFail} armas`, `${spotOk} ✓ / ${spotFail} ✗`, spotFail > 0 ? 'warn' : 'ok');

// ══ ARMORS ════════════════════════════════════════════════════
h2('Armors');

// Distribución de tipos
const typeCount: Record<string, number> = {};
for (const a of armors) typeCount[a.type] = (typeCount[a.type] ?? 0) + 1;
row('Distribución de tipos', Object.entries(typeCount).map(([k,v]) => `${k}=${v}`).join(' | '), 'ok');

// ¿Hay Leg Armor?
const legCount = typeCount['Leg Armor'] ?? 0;
if (legCount === 0) {
  row('Leg Armor con type correcto', 0, 'crit');
  note('BUG: normalizeArmorType captura "Leg Armor" como "Chest Armor" por orden de checks');
} else {
  row('Leg Armor con type correcto', legCount, 'ok');
}

// Sub-tipos físicos en 0
for (const sub of ['strike', 'slash', 'pierce'] as const) {
  const bad = armors.filter(a => (a.defense?.physical ?? 0) > 0 && (a.defense?.[sub] ?? 0) === 0);
  row(`Armaduras con ${sub}=0 (physical>0)`, bad.length, bad.length > 5 ? 'warn' : bad.length > 0 ? 'warn' : 'ok');
  note('Valores reales probablemente <1 en juego; fanapis redondea a 0');
  for (const a of bad) detail(a.name);
}

// Peso=0 en armaduras
const zeroWeightArmor = armors.filter(a => (a.weight ?? 0) === 0);
row('Armaduras con weight=0', zeroWeightArmor.length, zeroWeightArmor.length > 0 ? 'warn' : 'ok');

// ══ SHIELDS ══════════════════════════════════════════════════
h2('Shields');
const noStability = shields.filter(s => (s.stability ?? 0) === 0);
row('Sin stability (Guard Boost)', noStability.length, noStability.length > 0 ? 'warn' : 'ok');
for (const s of noStability) detail(s.name);

// ══ TALISMANS ════════════════════════════════════════════════
h2('Talismans');
const noEffect = talismans.filter(t => !t.effect);
row('Sin effect text', noEffect.length, noEffect.length > 0 ? 'warn' : 'ok');

// ══ SPIRITS ══════════════════════════════════════════════════
h2('Spirits');
const noCost = spirits.filter(s => s.fpCost === 0 && s.hpCost === 0);
row('Sin coste de invocación', noCost.length, noCost.length > 0 ? 'warn' : 'ok');
for (const s of noCost) detail(s.name);

// ══ PRECISIÓN NUMÉRICA ════════════════════════════════════════
h2('Precisión numérica — limitaciones conocidas');
lines.push(`
| Issue | Impacto | Fix posible |
|-------|---------|-------------|
| Armor defense: fanapis almacena enteros, juego usa floats | Error ~1-3% en cálculo de negación | Extraer regulation.bin del juego |
| Armor sub-tipos <1 se almacenan como 0 | Error pequeño en negación de ítems muy ligeros | Idem |
| Crossbow/ballista scaling ausente en fanapis (20 armas) | AR estimado incorrecto para estas armas | Corrections manuales en sync-data.ts |
`);

// ══ RESUMEN FINAL ════════════════════════════════════════════
h2('Resumen final');
lines.push(`- **Total items**: ${TOTAL}`);
lines.push(`- **Bugs críticos**: ${criticalCount}`);
lines.push(`- **Advertencias**: ${warningCount}`);

if (criticalCount > 0) {
  lines.push(`\n> ⚠️ HAY ${criticalCount} BUG(S) CRÍTICO(S) — ejecutar \`npm run sync-data\` para regenerar.`);
} else {
  lines.push(`\n> ✅ Sin bugs críticos.`);
}

// ── Salida ────────────────────────────────────────────────────
const report = lines.join('\n');
console.log(report);

if (SAVE_REPORT) {
  const outPath = path.join(__dirname, '..', 'audit-report.md');
  fs.writeFileSync(outPath, report, 'utf-8');
  console.log(`\n✓ Reporte guardado en ${outPath}`);
}

process.exit(criticalCount > 0 ? 1 : 0);
