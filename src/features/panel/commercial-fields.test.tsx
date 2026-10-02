import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  commercialBody,
  commercialCreateBody,
  commercialFromProduct,
  commercialProblems,
  discountPercent,
  EMPTY_COMMERCIAL,
  fromBogotaInput,
  toBogotaInput,
  type CommercialDraft,
} from './commercial-fields';
import { CommercialSection, CompareAtField } from './commercial-section';
import { parseCreateVariant, parseUpdateProduct, parseUpdateVariant } from './product-input';
import { validateVariantDrafts, variantRequestBody, type VariantDraft } from './variant-draft';

/** Precio anterior, novedad, promoción y preparación en el panel. Datos ficticios. */

const draft = (overrides: Partial<CommercialDraft> = {}): CommercialDraft => ({
  ...EMPTY_COMMERCIAL,
  ...overrides,
});

describe('descuento', () => {
  it('redondea hacia abajo, como la tienda', () => {
    expect(discountPercent(1_000_000, 1_250_000)).toBe(20);
    expect(discountPercent(999_000, 1_499_000)).toBe(33);
  });

  it.each([
    ['igual', 1_000, 1_000],
    ['inferior', 1_000, 900],
    ['ausente', 1_000, null],
  ])('sin descuento real (%s) no hay porcentaje', (_label, price, compareAt) => {
    expect(discountPercent(price, compareAt)).toBeNull();
  });
});

describe('validación', () => {
  it('precio anterior mayor que el vigente', () => {
    expect(
      commercialProblems(draft({ compareAtPriceCop: '1.000' }), 1_000).compareAtPriceCop,
    ).toContain('mayor que el precio vigente');
    expect(commercialProblems(draft({ compareAtPriceCop: '1.500' }), 1_000)).toEqual({});
  });

  it.each(['abc', '0', '-5', '1,5'])('precio anterior ilegible: %s', (raw) => {
    expect(
      commercialProblems(draft({ compareAtPriceCop: raw }), 1_000).compareAtPriceCop,
    ).toBeDefined();
  });

  it('fecha inválida', () => {
    expect(commercialProblems(draft({ newUntil: '2026-02-30T10:00x' }), 1).newUntil).toBeDefined();
  });

  it.each(['<b>Nuevo</b>', 'Oferta > todo', 'x'.repeat(25)])(
    'etiqueta insegura o larga: %s',
    (raw) => {
      const problems = commercialProblems(draft({ newLabel: raw, promotionLabel: raw }), 1);
      expect(problems.newLabel).toBeDefined();
      expect(problems.promotionLabel).toBeDefined();
    },
  );

  it.each([
    ['invertido', '10', '5', 'preparationMax'],
    ['solo mínimo', '3', '', 'preparationMax'],
    ['cero', '0', '5', 'preparationMin'],
    ['demasiado largo', '1', '400', 'preparationMax'],
  ])('rango %s', (_label, min, max, field) => {
    expect(
      commercialProblems(draft({ preparationMin: min, preparationMax: max }), 1)[
        field as 'preparationMin' | 'preparationMax'
      ],
    ).toBeDefined();
  });

  it('rango válido, incluido un solo día', () => {
    expect(commercialProblems(draft({ preparationMin: '3', preparationMax: '3' }), 1)).toEqual({});
  });
});

describe('cuerpo enviado', () => {
  it('vacío elimina: en edición todo viaja como null', () => {
    expect(commercialBody(EMPTY_COMMERCIAL)).toEqual({
      compareAtPriceCop: null,
      newUntil: null,
      newLabel: null,
      promotionLabel: null,
      preparationDaysMin: null,
      preparationDaysMax: null,
    });
  });

  it('en el alta solo viaja lo escrito', () => {
    expect(
      commercialCreateBody(
        draft({ compareAtPriceCop: '1.690.000', newLabel: '  Recién  llegado ' }),
      ),
    ).toEqual({
      compareAtPriceCop: 1_690_000,
      newLabel: 'Recién llegado',
    });
  });

  it('la fecha se escribe y se lee en hora de Colombia', () => {
    expect(fromBogotaInput('2026-10-15T09:30')).toBe('2026-10-15T09:30:00-05:00');
    expect(toBogotaInput('2026-10-15T14:30:00.000Z')).toBe('2026-10-15T09:30');
    expect(
      commercialFromProduct({
        compareAtPriceCop: 1_690_000,
        newUntil: '2026-10-15T14:30:00.000Z',
        newLabel: null,
        promotionLabel: 'Oferta',
        preparationDaysMin: 5,
        preparationDaysMax: 10,
      }),
    ).toEqual({
      compareAtPriceCop: '1690000',
      newUntil: '2026-10-15T09:30',
      newLabel: '',
      promotionLabel: 'Oferta',
      preparationMin: '5',
      preparationMax: '10',
    });
  });
});

describe('sección', () => {
  const render = (overrides: Partial<CommercialDraft> = {}, sellsByVariants = false) =>
    renderToStaticMarkup(
      <CommercialSection
        disabled={false}
        draft={draft(overrides)}
        onChange={() => undefined}
        priceCop={1_000_000}
        problems={commercialProblems(draft(overrides), 1_000_000)}
        sellsByVariants={sellsByVariants}
      />,
    );

  it('tiene todos los campos con etiqueta', () => {
    const html = render();
    for (const label of [
      'Precio anterior',
      'Mostrar como nuevo hasta',
      'Etiqueta de nuevo',
      'Etiqueta de promoción',
      'Preparación (días hábiles)',
      'Mínimo',
      'Máximo',
    ]) {
      expect(html, label).toContain(label);
    }
    expect(html).toContain('type="datetime-local"');
    expect(html).toContain('maxLength="24"');
  });

  it('vista previa del descuento solo con descuento real', () => {
    expect(render({ compareAtPriceCop: '1.250.000' })).toContain('20 % de descuento');
    expect(render({ compareAtPriceCop: '1.000.000' })).not.toContain('Vista previa');
    expect(render()).not.toContain('Vista previa');
  });

  it('dice que «Envío gratis» se administra desde las zonas de envío', () => {
    const html = render();
    expect(html).toContain('«Envío gratis» se administrará desde las zonas de envío');
    expect(html).not.toMatch(/type="checkbox"[^>]*>[^<]*Envío gratis/);
  });

  it('con variantes avisa de que manda cada variante', () => {
    expect(render({}, true)).toContain('el precio anterior se define en cada variante');
  });
});

describe('variantes', () => {
  const base: VariantDraft = {
    draftId: 'd1',
    sku: 'AURA-ROBLE-80',
    priceCop: '1.000.000',
    inventory: { mode: 'tracked', quantity: '3', lowStockThreshold: '' } as never,
    attributes: [{ key: 'finish', value: 'roble', label: 'Roble' }],
  };
  const axes = [{ key: 'finish' }];

  it('una variante lleva su propio precio anterior', () => {
    const body = variantRequestBody({ ...base, compareAtPriceCop: '1.250.000' }, 3);
    expect(body).toMatchObject({ priceCop: 1_000_000, compareAtPriceCop: 1_250_000 });
    expect(variantRequestBody(base, 3)).not.toHaveProperty('compareAtPriceCop');
  });

  it('rechaza un precio anterior igual o inferior al de la variante', () => {
    const result = validateVariantDrafts([{ ...base, compareAtPriceCop: '1.000.000' }], axes);
    expect(result.byDraft.d1).toContain('mayor que el precio de la variante');
  });

  it('el campo de la fila muestra el descuento de esa variante', () => {
    const html = renderToStaticMarkup(
      <CompareAtField
        disabled={false}
        onChange={() => undefined}
        priceCop={1_000_000}
        value="1.250.000"
      />,
    );
    expect(html).toContain('20 % de descuento');
  });
});

describe('frontera BFF', () => {
  it('acepta los campos comerciales con su forma, y null para borrar', () => {
    expect(
      parseUpdateProduct({
        expectedVersion: 2,
        compareAtPriceCop: 1_690_000,
        newUntil: '2026-10-15T09:30:00-05:00',
        newLabel: 'Recién llegado',
        promotionLabel: null,
        preparationDaysMin: 5,
        preparationDaysMax: 10,
      }),
    ).toMatchObject({ compareAtPriceCop: 1_690_000, promotionLabel: null, preparationDaysMax: 10 });
  });

  it.each([
    ['precio anterior decimal', { compareAtPriceCop: 1.5 }],
    ['fecha sin zona', { newUntil: '2026-10-15T09:30' }],
    ['etiqueta con HTML', { newLabel: '<b>Nuevo</b>' }],
    ['un solo extremo del rango', { preparationDaysMin: 3 }],
    ['rango fuera de tope', { preparationDaysMin: 1, preparationDaysMax: 500 }],
  ])('rechaza %s', (_label, extra) => {
    expect(parseUpdateProduct({ expectedVersion: 2, ...extra })).toBeNull();
  });

  it('variantes: alta y edición con precio anterior', () => {
    expect(
      parseCreateVariant({
        expectedVersion: 1,
        sku: 'AURA-1',
        priceCop: 1000,
        compareAtPriceCop: 1200,
        attributes: [{ key: 'finish', value: 'roble', label: 'Roble' }],
      }),
    ).toMatchObject({ compareAtPriceCop: 1200 });
    expect(parseUpdateVariant({ expectedVersion: 1, compareAtPriceCop: null })).toEqual({
      expectedVersion: 1,
      compareAtPriceCop: null,
    });
  });
});

describe('envío gratis', () => {
  it('ningún archivo del panel ofrece declararlo', () => {
    const sources = [
      'commercial-section.tsx',
      'commercial-fields.ts',
      'create-product-form.tsx',
      'product-detail-client.tsx',
    ]
      .map((file) => readFileSync(`src/features/panel/${file}`, 'utf8'))
      .join('\n');
    expect(sources).not.toMatch(/freeShipping|free_shipping/);
  });
});
