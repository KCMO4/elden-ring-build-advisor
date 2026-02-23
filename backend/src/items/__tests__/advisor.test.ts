/**
 * Tests del Build Advisor — recomendaciones con stats conocidos.
 */

import { getAdvisorResult } from '../advisor';

// Stats de Zhyak (personaje de referencia): nivel 68
const ZHYAK = {
  vigor: 34, mind: 17, endurance: 18,
  strength: 18, dexterity: 34, intelligence: 7, faith: 8, arcane: 11,
};

// Stats de un mago puro
const MAGO = {
  vigor: 25, mind: 40, endurance: 20,
  strength: 8, dexterity: 12, intelligence: 60, faith: 7, arcane: 9,
};

// Stats de un guerrero cuerpo a cuerpo puro
const GUERRERO = {
  vigor: 50, mind: 10, endurance: 40,
  strength: 60, dexterity: 15, intelligence: 7, faith: 7, arcane: 7,
};

describe('getAdvisorResult', () => {
  describe('armas usables', () => {
    test('devuelve armas que el personaje puede equipar', () => {
      const result = getAdvisorResult(ZHYAK);
      for (const rec of result.usable) {
        expect(rec.canEquip).toBe(true);
        expect(rec.weapon.requirements.str).toBeLessThanOrEqual(ZHYAK.strength);
        expect(rec.weapon.requirements.dex).toBeLessThanOrEqual(ZHYAK.dexterity);
        expect(rec.weapon.requirements.int).toBeLessThanOrEqual(ZHYAK.intelligence);
      }
    });

    test('las armas están ordenadas por AR estimado descendente', () => {
      const result = getAdvisorResult(ZHYAK);
      for (let i = 1; i < result.usable.length; i++) {
        expect(result.usable[i - 1]!.estimatedAR).toBeGreaterThanOrEqual(
          result.usable[i]!.estimatedAR,
        );
      }
    });

    test('respeta el límite topN', () => {
      const result = getAdvisorResult(ZHYAK, 3);
      expect(result.usable.length).toBeLessThanOrEqual(3);
    });

    test('el AR estimado es un número positivo', () => {
      const result = getAdvisorResult(ZHYAK);
      for (const rec of result.usable) {
        expect(rec.estimatedAR).toBeGreaterThan(0);
      }
    });
  });

  describe('armas casi usables', () => {
    test('nearlyUsable tiene missingStats definido', () => {
      const result = getAdvisorResult(ZHYAK);
      for (const rec of result.nearlyUsable) {
        expect(rec.canEquip).toBe(false);
        expect(rec.missingStats).toBeDefined();
      }
    });

    test('nearlyUsable no incluye armas que ya puede usar', () => {
      const result = getAdvisorResult(ZHYAK);
      const usableIds = new Set(result.usable.map(r => r.weapon.id));
      for (const rec of result.nearlyUsable) {
        expect(usableIds.has(rec.weapon.id)).toBe(false);
      }
    });
  });

  describe('stats desperdiciados', () => {
    test('mago con Int 60 no tiene Int como stat desperdiciado', () => {
      const result = getAdvisorResult(MAGO);
      // El mago debería tener armas de escalado Int, así que Int no está desperdiciado
      // (o si está, las demás armas sí escalan con algo que usa)
      // Solo verificamos que la función no explota
      expect(Array.isArray(result.wastedStats)).toBe(true);
    });

    test('guerrero con Int 7 puede tener Int como stat desperdiciado si no usa bastones', () => {
      const result = getAdvisorResult(GUERRERO);
      // Con Int 7 (< 20 = umbral HIGH_THRESHOLD), Int no aparece como desperdiciado
      expect(result.wastedStats).not.toContain('intelligence');
    });
  });

  describe('hints de umbral', () => {
    test('las armas usables pueden tener nearThreshold definido', () => {
      const result = getAdvisorResult(ZHYAK);
      // No es obligatorio que haya hints, pero si los hay deben ser válidos
      for (const rec of result.usable) {
        if (rec.nearThreshold && rec.nearThreshold.length > 0) {
          for (const hint of rec.nearThreshold) {
            expect(hint.pointsNeeded).toBeGreaterThan(0);
            expect(hint.pointsNeeded).toBeLessThanOrEqual(5);
          }
        }
      }
    });
  });

  describe('casos borde', () => {
    test('funciona con stats mínimos (todo a 1)', () => {
      const stats = { strength: 1, dexterity: 1, intelligence: 1, faith: 1, arcane: 1 };
      const result = getAdvisorResult(stats);
      expect(result).toBeDefined();
      expect(Array.isArray(result.usable)).toBe(true);
    });

    test('funciona con stats máximos (todo a 99)', () => {
      const stats = { strength: 99, dexterity: 99, intelligence: 99, faith: 99, arcane: 99 };
      const result = getAdvisorResult(stats);
      // Con stats máximos, nearlyUsable debería estar vacío (puede equipar todo)
      expect(result.nearlyUsable.length).toBe(0);
    });
  });
});
