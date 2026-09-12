import { describe, expect, it } from 'vitest';

import { describeCopProblem, formatCop, groupCop, normaliseCopInput, parseCop } from './money';

/**
 * El precio es lo más fácil de estropear por un factor de mil, así que el parser no adivina: o
 * entiende lo escrito sin ambigüedad, o dice por qué no.
 */

describe('lectura de lo que se escribe', () => {
  it.each([
    ['1450000', 1_450_000],
    ['1.450.000', 1_450_000],
    ['$ 1.450.000', 1_450_000],
    ['$1.450.000', 1_450_000],
    ['1 450 000', 1_450_000],
    ['999', 999],
    ['0', 0],
    ['  2.500  ', 2_500],
  ])('«%s» son %i pesos', (raw, expected) => {
    expect(parseCop(raw)).toEqual({ ok: true, value: expected });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['-1000', 'negative'],
    ['1450000,50', 'decimals'],
    // Una coma es separador decimal en español: aunque venga a cero, no es un precio en pesos.
    ['1.450.000,00', 'decimals'],
    ['mil pesos', 'not_a_number'],
    ['1450000 COP', 'not_a_number'],
    // Ambiguo: podría querer decir 145 o 1,45. No se interpreta.
    ['1.45', 'ambiguous'],
    ['12.3456', 'ambiguous'],
    ['1.450.00', 'ambiguous'],
    ['2147483648', 'too_large'],
  ] as const)('«%s» se rechaza por %s', (raw, problem) => {
    const result = parseCop(raw);

    expect(result.ok).toBe(false);
    expect(result).toEqual({ ok: false, problem });
    expect(describeCopProblem(problem).length).toBeGreaterThan(0);
  });

  it('nunca devuelve NaN ni un decimal', () => {
    for (const raw of ['abc', '1,5', '1.45', '', '-3', '1e3']) {
      const result = parseCop(raw);

      if (result.ok) {
        expect(Number.isInteger(result.value)).toBe(true);
      }
    }
  });
});

describe('presentación', () => {
  it('escribe el precio como $ 1.450.000, sin COP ni decimales', () => {
    expect(formatCop(1_450_000)).toBe('$ 1.450.000');
    expect(formatCop(1_450_000)).not.toContain('COP');
    expect(formatCop(1_450_000)).not.toContain(',');
  });

  it.each([
    [0, '0'],
    [999, '999'],
    [1_000, '1.000'],
    [1_450_000, '1.450.000'],
  ])('agrupa %i como %s', (value, expected) => {
    expect(groupCop(value)).toBe(expected);
  });

  it('al perder el foco normaliza lo escrito', () => {
    expect(normaliseCopInput('1450000')).toBe('1.450.000');
    expect(normaliseCopInput('$ 1.450.000')).toBe('1.450.000');
  });

  it('lo que no se puede convertir se deja tal cual para poder corregirlo', () => {
    expect(normaliseCopInput('1.45')).toBe('1.45');
    expect(normaliseCopInput('abc')).toBe('abc');
  });

  it('ida y vuelta: lo formateado se vuelve a leer como el mismo entero', () => {
    for (const value of [0, 7, 999, 1_000, 1_450_000, 2_147_483_647]) {
      expect(parseCop(formatCop(value))).toEqual({ ok: true, value });
    }
  });
});
