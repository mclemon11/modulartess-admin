import { describe, expect, it } from 'vitest';

import {
  DESCRIPTION_MAX_LENGTH,
  FEATURE_MAX_LENGTH,
  FEATURES_MAX_ITEMS,
  SHORT_DESCRIPTION_MAX_LENGTH,
} from '@/lib/api/variant-limits';

import {
  addFeatureRow,
  counterLabel,
  descriptionProblem,
  featureProblems,
  hasFeatureProblems,
  moveFeatureRow,
  removeFeatureRow,
  setFeatureRow,
  shortDescriptionProblem,
  submittedFeatures,
} from './product-content';

/**
 * Los topes son los del contrato, y las fronteras son lo único que importa comprobar: justo dentro
 * pasa, justo fuera no. `src/lib/api/contract.test.ts` es quien ata esos números a OpenAPI; aquí se
 * comprueba que la validación los aplica donde toca.
 */

const at = (length: number) => 'a'.repeat(length);

describe('descripción corta', () => {
  it('acepta exactamente 180 caracteres', () => {
    expect(shortDescriptionProblem(at(SHORT_DESCRIPTION_MAX_LENGTH))).toBeNull();
  });

  it('rechaza 181', () => {
    expect(shortDescriptionProblem(at(SHORT_DESCRIPTION_MAX_LENGTH + 1))).toBe(
      'La descripción corta supera los 180 caracteres.',
    );
  });

  it('mide sin los espacios de los extremos: no se rechaza por un salto de línea final', () => {
    expect(shortDescriptionProblem(`  ${at(SHORT_DESCRIPTION_MAX_LENGTH)}\n`)).toBeNull();
  });

  it('vacía no es un problema del formulario: quien la exige para publicar es el backend', () => {
    // El panel no vuelve a derivar la regla de publicación; el código `short_description` de
    // `publicationReadiness` es el que dice que falta.
    expect(shortDescriptionProblem('')).toBeNull();
    expect(shortDescriptionProblem('   ')).toBeNull();
  });
});

describe('descripción detallada', () => {
  it('acepta exactamente 3000 caracteres', () => {
    expect(descriptionProblem(at(DESCRIPTION_MAX_LENGTH))).toBeNull();
  });

  it('rechaza 3001', () => {
    expect(descriptionProblem(at(DESCRIPTION_MAX_LENGTH + 1))).toBe(
      'La descripción detallada supera los 3000 caracteres.',
    );
  });

  it('vacía es válida: el contrato la publica como opcional', () => {
    expect(descriptionProblem('')).toBeNull();
  });
});

describe('contador', () => {
  it('se lee «N de M»', () => {
    expect(counterLabel(0, SHORT_DESCRIPTION_MAX_LENGTH)).toBe('0 de 180');
    expect(counterLabel(12, FEATURE_MAX_LENGTH)).toBe('12 de 60');
    expect(counterLabel(3, FEATURES_MAX_ITEMS)).toBe('3 de 5');
  });
});

describe('características: cuántas', () => {
  it('acepta exactamente 5', () => {
    const rows = ['una', 'dos', 'tres', 'cuatro', 'cinco'];

    expect(featureProblems(rows).general).toBeNull();
    expect(hasFeatureProblems(featureProblems(rows))).toBe(false);
  });

  it('rechaza 6', () => {
    const rows = ['una', 'dos', 'tres', 'cuatro', 'cinco', 'seis'];

    expect(featureProblems(rows).general).toBe('Máximo 5 características.');
    expect(hasFeatureProblems(featureProblems(rows))).toBe(true);
  });

  it('las filas vacías no cuentan para el tope', () => {
    const rows = ['una', '', 'dos', '   ', 'tres', ''];

    expect(submittedFeatures(rows)).toEqual(['una', 'dos', 'tres']);
    expect(featureProblems(rows).general).toBeNull();
  });

  it('no deja añadir una sexta fila', () => {
    const full = ['una', 'dos', 'tres', 'cuatro', 'cinco'];

    expect(addFeatureRow(full)).toBe(full);
    expect(addFeatureRow(['una'])).toEqual(['una', '']);
  });
});

describe('características: cuánto ocupa cada una', () => {
  it('acepta exactamente 60 caracteres', () => {
    expect(featureProblems([at(FEATURE_MAX_LENGTH)]).byRow).toEqual([null]);
  });

  it('rechaza 61, y señala la fila concreta', () => {
    const problems = featureProblems(['corta', at(FEATURE_MAX_LENGTH + 1), 'otra']);

    expect(problems.byRow).toEqual([null, 'Máximo 60 caracteres por característica.', null]);
    expect(problems.general).toBeNull();
    expect(hasFeatureProblems(problems)).toBe(true);
  });

  it('una fila vacía no es un error: es una fila sin escribir', () => {
    expect(featureProblems(['', 'algo', '']).byRow).toEqual([null, null, null]);
  });

  it('marca la repetición en la segunda, no en la primera', () => {
    // El contrato pide que no haya duplicados «once accent- and case-folded».
    const problems = featureProblems(['Cierre suave', 'cierre SUAVE', 'Otra']);

    expect(problems.byRow).toEqual([null, 'Esta característica está repetida.', null]);
  });

  it('los acentos no hacen distinta una característica', () => {
    expect(featureProblems(['Diseño único', 'diseno unico']).byRow[1]).toBe(
      'Esta característica está repetida.',
    );
  });
});

describe('orden de las características', () => {
  it('se envía el orden escrito, sin los espacios de los extremos', () => {
    expect(submittedFeatures([' primera ', 'segunda', ' tercera'])).toEqual([
      'primera',
      'segunda',
      'tercera',
    ]);
  });

  it('subir intercambia con la anterior', () => {
    expect(moveFeatureRow(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
  });

  it('bajar intercambia con la siguiente', () => {
    expect(moveFeatureRow(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });

  it('un movimiento fuera de rango deja la lista igual', () => {
    const rows = ['a', 'b', 'c'];

    expect(moveFeatureRow(rows, 0, -1)).toBe(rows);
    expect(moveFeatureRow(rows, 2, 1)).toBe(rows);
    expect(moveFeatureRow(rows, 9, 1)).toBe(rows);
  });

  it('quitar una fila conserva el orden del resto', () => {
    expect(removeFeatureRow(['a', 'b', 'c', 'd'], 1)).toEqual(['a', 'c', 'd']);
  });

  it('escribir una fila no toca a las demás', () => {
    expect(setFeatureRow(['a', 'b', 'c'], 2, 'z')).toEqual(['a', 'b', 'z']);
  });

  it('las operaciones no mutan la lista recibida', () => {
    const rows = ['a', 'b'];

    moveFeatureRow(rows, 0, 1);
    removeFeatureRow(rows, 0);
    setFeatureRow(rows, 0, 'z');
    addFeatureRow(rows);

    expect(rows).toEqual(['a', 'b']);
  });
});
