import { describe, expect, it } from 'vitest';

import type { AdminProductVariant } from '@/lib/api/catalog';

import {
  combinationKey,
  declaredAxes,
  generateCombinations,
  validateAxes,
  validateVariantDrafts,
  variantRequestBody,
  type AxisDraft,
  type VariantDraft,
} from './variant-draft';

function axis(key: string, label: string, values: string[]): AxisDraft {
  return {
    axisId: `axis-${key}`,
    key,
    label,
    values: values.map((value) => ({ valueId: `${key}-${value}`, value, label: value })),
  };
}

function draft(
  draftId: string,
  attributes: [string, string][],
  overrides: Partial<VariantDraft> = {},
): VariantDraft {
  return {
    draftId,
    sku: `TOCADOR-${draftId.toUpperCase()}`,
    priceCop: '1490000',
    stockQuantity: '3',
    attributes: attributes.map(([key, value]) => ({ key, value, label: value })),
    ...overrides,
  };
}

function existing(
  sku: string,
  combination: string,
  status: 'active' | 'archived' = 'active',
): AdminProductVariant {
  return { sku, combinationKey: combination, status } as unknown as AdminProductVariant;
}

let counter = 0;
const newId = () => `id-${(counter += 1)}`;

describe('clave de combinación', () => {
  it('no depende del orden en el que se escribieron los ejes', () => {
    const one = combinationKey([
      { key: 'size', value: '80', label: '80' },
      { key: 'finish', value: 'roble-natural', label: 'Roble natural' },
    ]);

    expect(one).toBe('finish:roble-natural|size:80');
    expect(one).toBe(
      combinationKey([
        { key: 'finish', value: 'roble-natural', label: 'Roble natural' },
        { key: 'size', value: '80', label: '80' },
      ]),
    );
  });
});

describe('generación de combinaciones', () => {
  it('produce el producto cartesiano de los valores de cada eje', () => {
    const drafts = generateCombinations(
      [axis('finish', 'Acabado', ['roble', 'nogal']), axis('size', 'Medida', ['80', '100'])],
      { existing: [], baseSku: 'TOCADOR-AURA', basePriceCop: '1490000', newId, limit: 72 },
    );

    expect(drafts).toHaveLength(4);
    expect(drafts.map((entry) => combinationKey(entry.attributes))).toEqual([
      'finish:roble|size:80',
      'finish:roble|size:100',
      'finish:nogal|size:80',
      'finish:nogal|size:100',
    ]);
    // El SKU se sugiere desde el base y los valores; sigue siendo editable.
    expect(drafts[0]?.sku).toBe('TOCADOR-AURA-ROBLE-80');
  });

  it('no repite una combinación que ya existe', () => {
    const drafts = generateCombinations([axis('finish', 'Acabado', ['roble', 'nogal'])], {
      existing: ['finish:roble'],
      baseSku: 'TOCADOR',
      basePriceCop: '1000',
      newId,
      limit: 72,
    });

    expect(drafts.map((entry) => combinationKey(entry.attributes))).toEqual(['finish:nogal']);
  });

  it('nunca genera más de las que caben en el límite', () => {
    const drafts = generateCombinations(
      [
        axis(
          'size',
          'Medida',
          Array.from({ length: 40 }, (_, index) => String(index + 60)),
        ),
      ],
      { existing: [], baseSku: 'TOCADOR', basePriceCop: '1000', newId, limit: 5 },
    );

    expect(drafts).toHaveLength(5);
  });

  it('sin ejes usables no genera nada', () => {
    expect(
      generateCombinations([axis('finish', 'Acabado', [])], {
        existing: [],
        baseSku: 'TOCADOR',
        basePriceCop: '1000',
        newId,
        limit: 72,
      }),
    ).toEqual([]);
  });
});

describe('ejes declarados', () => {
  it('descarta los que están a medio escribir', () => {
    expect(
      declaredAxes([axis('finish', 'Acabado', []), axis('', '', []), axis('size', '', [])]),
    ).toEqual([{ key: 'finish', label: 'Acabado' }]);
  });

  it('rechaza una clave con mayúsculas o acentos y una clave repetida', () => {
    expect(validateAxes([axis('Finish', 'Acabado', [])]).join(' ')).toContain('clave de eje');
    expect(
      validateAxes([axis('finish', 'Acabado', []), axis('finish', 'Otro', [])]).join(' '),
    ).toContain('dos veces');
  });

  it('rechaza más ejes de los que admite el contrato', () => {
    const axes = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((key) => axis(key, key.toUpperCase(), []));

    expect(validateAxes(axes).join(' ')).toContain('máximo 6 ejes');
  });

  it('rechaza un valor sin normalizar', () => {
    expect(validateAxes([axis('finish', 'Acabado', ['Roble Natural'])]).join(' ')).toContain(
      'no sirve como valor',
    );
  });
});

describe('validación de variantes', () => {
  const axes = [{ key: 'finish' }, { key: 'size' }];

  it('acepta una combinación completa y bien formada', () => {
    const validation = validateVariantDrafts(
      [
        draft('uno', [
          ['finish', 'roble'],
          ['size', '80'],
        ]),
      ],
      axes,
    );

    expect(validation.general).toEqual([]);
    expect(validation.byDraft).toEqual({});
  });

  it('exige exactamente los ejes declarados, ni uno más ni uno menos', () => {
    const faltante = validateVariantDrafts([draft('uno', [['finish', 'roble']])], axes);
    const sobrante = validateVariantDrafts(
      [
        draft('uno', [
          ['finish', 'roble'],
          ['size', '80'],
          ['mirror', 'si'],
        ]),
      ],
      axes,
    );

    expect(faltante.byDraft.uno).toContain('exactamente los ejes declarados');
    expect(sobrante.byDraft.uno).toContain('exactamente los ejes declarados');
  });

  it('rechaza dos borradores con la misma combinación', () => {
    const validation = validateVariantDrafts(
      [
        draft('uno', [
          ['finish', 'roble'],
          ['size', '80'],
        ]),
        draft('dos', [
          ['size', '80'],
          ['finish', 'roble'],
        ]),
      ],
      axes,
    );

    // El primero es válido; el segundo choca aunque los ejes se escribieran en otro orden.
    expect(validation.byDraft.uno).toBeUndefined();
    expect(validation.byDraft.dos).toContain('combinación ya existe');
  });

  it('rechaza una combinación que ya tiene una variante activa', () => {
    const validation = validateVariantDrafts(
      [
        draft('uno', [
          ['finish', 'roble'],
          ['size', '80'],
        ]),
      ],
      axes,
      [existing('OTRO-SKU', 'finish:roble|size:80')],
    );

    expect(validation.byDraft.uno).toContain('combinación ya existe');
  });

  it('rechaza un SKU ya reservado, incluso el de una variante archivada', () => {
    const validation = validateVariantDrafts(
      [
        draft('uno', [
          ['finish', 'roble'],
          ['size', '80'],
        ]),
      ],
      axes,
      [existing('TOCADOR-UNO', 'finish:nogal|size:80', 'archived')],
    );

    expect(validation.byDraft.uno).toContain('ya está reservado');
  });

  it('rechaza dos borradores con el mismo SKU', () => {
    const validation = validateVariantDrafts(
      [
        draft('uno', [
          ['finish', 'roble'],
          ['size', '80'],
        ]),
        draft(
          'dos',
          [
            ['finish', 'nogal'],
            ['size', '80'],
          ],
          { sku: 'TOCADOR-UNO' },
        ),
      ],
      axes,
    );

    expect(validation.byDraft.dos).toContain('ya está reservado');
  });

  it.each([
    ['precio cero', { priceCop: '0' }, 'mayor que cero'],
    // El precio de la variante pasa por el mismo conversor que el del producto: admite los puntos
    // de miles y rechaza lo ambiguo en lugar de interpretarlo.
    ['precio con miles mal agrupados', { priceCop: '1.45' }, 'Precio'],
    ['precio con centavos', { priceCop: '1450000,50' }, 'Precio'],
    ['precio negativo', { priceCop: '-1450000' }, 'Precio'],
    ['precio vacío', { priceCop: '' }, 'Precio'],
    ['inventario negativo', { stockQuantity: '-1' }, 'Inventario'],
    ['inventario con decimales', { stockQuantity: '1.5' }, 'Inventario'],
    // El editor pasa el SKU a mayúsculas, así que lo que se rechaza es la forma: demasiado corto,
    // con espacios o con signos que el contrato no admite.
    ['sku de un solo carácter', { sku: 'X' }, 'SKU'],
    ['sku con espacios', { sku: 'TOCADOR UNO' }, 'SKU'],
  ])('rechaza %s', (_label, overrides, expected) => {
    const validation = validateVariantDrafts(
      [
        draft(
          'uno',
          [
            ['finish', 'roble'],
            ['size', '80'],
          ],
          overrides,
        ),
      ],
      axes,
    );

    expect(validation.byDraft.uno).toContain(expected);
  });

  it('no deja pasar de 72 variantes activas, contando las que ya existen', () => {
    const drafts = Array.from({ length: 70 }, (_, index) =>
      draft(`d${index}`, [
        ['finish', 'roble'],
        ['size', String(index)],
      ]),
    );
    const activas = Array.from({ length: 3 }, (_, index) =>
      existing(`EXISTENTE-${index}`, `finish:nogal|size:${index}`),
    );

    const validation = validateVariantDrafts(drafts, axes, activas);

    expect(validation.general.join(' ')).toContain('máximo 72 variantes activas');

    // Con 69 borradores y 3 activas caben justo las 72.
    expect(validateVariantDrafts(drafts.slice(0, 69), axes, activas).general).toEqual([]);
  });

  it('una variante archivada no ocupa sitio en el límite', () => {
    const drafts = Array.from({ length: 72 }, (_, index) =>
      draft(`d${index}`, [
        ['finish', 'roble'],
        ['size', String(index)],
      ]),
    );

    const validation = validateVariantDrafts(drafts, axes, [
      existing('ARCHIVADA', 'finish:nogal|size:1', 'archived'),
    ]);

    expect(validation.general).toEqual([]);
  });

  it('avisa si hay variantes sin ningún eje declarado', () => {
    expect(validateVariantDrafts([draft('uno', [])], []).general.join(' ')).toContain(
      'al menos un eje',
    );
  });
});

describe('cuerpo del alta', () => {
  it('acepta el precio escrito con puntos de miles', () => {
    const validation = validateVariantDrafts(
      [draft('uno', [['finish', 'roble']], { priceCop: '1.450.000' })],
      [{ key: 'finish' }],
    );

    expect(validation.byDraft).toEqual({});
    expect(
      variantRequestBody(draft('uno', [['finish', 'roble']], { priceCop: '$ 1.450.000' }), 3)
        .priceCop,
    ).toBe(1_450_000);
  });

  it('normaliza el SKU y convierte los números, con la versión del producto', () => {
    const body = variantRequestBody(
      draft('uno', [['finish', 'roble']], { sku: ' tocador-uno ', stockQuantity: '' }),
      7,
    );

    expect(body).toEqual({
      expectedVersion: 7,
      sku: 'TOCADOR-UNO',
      priceCop: 1490000,
      stockQuantity: 0,
      attributes: [{ key: 'finish', value: 'roble', label: 'roble' }],
    });
  });
});
