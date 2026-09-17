import { describe, expect, it } from 'vitest';

import { SPECIFICATION_MAX_LENGTH } from '@/lib/api/variant-limits';

import {
  EMPTY_ENRICHMENT,
  enrichmentBody,
  enrichmentFromProduct,
  enrichmentProblems,
  hasEnrichmentProblems,
  withTaxonomyName,
  type EnrichmentFields,
} from './enrichment';

/**
 * Lo que de verdad importa aquí es el cuerpo que sale hacia el `PATCH`: qué campos lleva, en qué
 * orden llegan las características y qué diferencia hay entre crear —donde lo vacío simplemente no
 * se envía— y editar —donde vaciar un campo es la forma de borrarlo—.
 */

const fields = (overrides: Partial<EnrichmentFields> = {}): EnrichmentFields => ({
  ...EMPTY_ENRICHMENT,
  ...overrides,
});

const AXES = [{ key: 'finish', label: 'Acabado' }];

describe('cuerpo del PATCH al crear', () => {
  it('sin nada escrito no gasta una llamada', () => {
    expect(enrichmentBody(EMPTY_ENRICHMENT, [], 'create')).toBeNull();
  });

  it('omite lo vacío: no hay nada que borrar en un producto que aún no existe', () => {
    const body = enrichmentBody(
      fields({ categoryName: 'Tocadores', categorySlug: 'tocadores' }),
      [],
      'create',
    );

    expect(body).toEqual({ category: { name: 'Tocadores', slug: 'tocadores' } });
    expect(body).not.toHaveProperty('materials');
    expect(body).not.toHaveProperty('features');
    expect(body).not.toHaveProperty('productType');
  });

  it('no inventa ningún texto de relleno para los campos vacíos', () => {
    // El `placeholder` de la pantalla es una ayuda del navegador; jamás llega al backend.
    const body = enrichmentBody(fields({ measurements: '80 × 45 × 75 cm' }), [], 'create');

    expect(body).toEqual({ measurements: '80 × 45 × 75 cm' });
    expect(JSON.stringify(body)).not.toContain('Tocadores');
  });
});

describe('cuerpo del PATCH al editar', () => {
  it('envía la cadena vacía de cada detalle adicional: así es como se borran', () => {
    const body = enrichmentBody(EMPTY_ENRICHMENT, [], 'edit');

    expect(body).toEqual({
      category: null,
      productType: null,
      featured: false,
      features: [],
      materials: '',
      measurements: '',
      warranty: '',
      care: '',
      attributes: [],
    });
  });

  it('borrar la categoría viaja como null, no como omisión', () => {
    const body = enrichmentBody(fields({ materials: 'Roble' }), [], 'edit');

    expect(body?.category).toBeNull();
    expect(body?.productType).toBeNull();
    expect(body?.materials).toBe('Roble');
  });

  it('recorta los extremos de cada detalle adicional', () => {
    const body = enrichmentBody(fields({ warranty: '  2 años  ' }), [], 'edit');

    expect(body?.warranty).toBe('2 años');
  });

  it('conserva los ejes declarados', () => {
    expect(enrichmentBody(EMPTY_ENRICHMENT, AXES, 'edit')?.attributes).toEqual([
      { key: 'finish', label: 'Acabado' },
    ]);
  });
});

describe('características dentro del cuerpo', () => {
  it('viajan como string[] en el orden escrito', () => {
    const body = enrichmentBody(
      fields({ features: ['Herrajes con cierre suave', 'Madera maciza', 'Montaje incluido'] }),
      [],
      'create',
    );

    expect(body?.features).toEqual([
      'Herrajes con cierre suave',
      'Madera maciza',
      'Montaje incluido',
    ]);
  });

  it('las filas vacías se caen sin alterar el orden de las demás', () => {
    const body = enrichmentBody(fields({ features: ['Primera', '', 'Segunda', '  '] }), [], 'edit');

    expect(body?.features).toEqual(['Primera', 'Segunda']);
  });

  it('quedarse sin ninguna se envía como lista vacía al editar', () => {
    expect(enrichmentBody(fields({ features: [] }), [], 'edit')?.features).toEqual([]);
  });
});

describe('problemas del contenido', () => {
  it('un formulario vacío no tiene ningún problema: todo esto es opcional', () => {
    const problems = enrichmentProblems(EMPTY_ENRICHMENT);

    expect(problems.classification).toEqual([]);
    expect(problems.specifications).toEqual({});
    expect(hasEnrichmentProblems(problems)).toBe(false);
  });

  it('media categoría no es una categoría', () => {
    const problems = enrichmentProblems(fields({ categoryName: 'Tocadores' }));

    expect(problems.classification).toEqual([
      'La categoría necesita nombre y slug, o ninguno de los dos.',
    ]);
    expect(hasEnrichmentProblems(problems)).toBe(true);
  });

  it('un slug con mayúsculas no pasa', () => {
    const problems = enrichmentProblems(
      fields({ categoryName: 'Tocadores', categorySlug: 'Tocadores' }),
    );

    expect(problems.classification).toEqual([
      'La categoría tiene un slug inválido: minúsculas, números y guiones.',
    ]);
  });

  it('un detalle adicional demasiado largo se señala en su propio campo', () => {
    const problems = enrichmentProblems(fields({ care: 'a'.repeat(SPECIFICATION_MAX_LENGTH + 1) }));

    expect(problems.specifications).toEqual({
      care: 'Cuidados supera los 2000 caracteres.',
    });
    expect(hasEnrichmentProblems(problems)).toBe(true);
  });

  it('los problemas de las características llegan por fila', () => {
    const problems = enrichmentProblems(fields({ features: ['bien', 'a'.repeat(61)] }));

    expect(problems.features.byRow).toEqual([null, 'Máximo 60 caracteres por característica.']);
    expect(hasEnrichmentProblems(problems)).toBe(true);
  });
});

describe('ida y vuelta con el producto', () => {
  it('rellena el formulario con lo que devolvió el backend, orden incluido', () => {
    const restored = enrichmentFromProduct({
      category: { name: 'Tocadores', slug: 'tocadores' },
      productType: null,
      featured: true,
      features: ['Primera', 'Segunda'],
      specifications: { materials: 'Roble', measurements: '80 cm', warranty: '2 años', care: '' },
    });

    expect(restored.features).toEqual(['Primera', 'Segunda']);
    expect(restored.categorySlug).toBe('tocadores');
    expect(restored.productTypeName).toBe('');
    expect(restored.care).toBe('');
  });

  it('un producto sin características abre el editor sin filas, no con una vacía', () => {
    const restored = enrichmentFromProduct({
      category: null,
      productType: null,
      featured: false,
      features: [],
      specifications: { materials: '', measurements: '', warranty: '', care: '' },
    });

    expect(restored.features).toEqual([]);
  });
});

describe('slug propuesto desde el nombre', () => {
  it('se propone mientras nadie lo haya corregido', () => {
    const next = withTaxonomyName(EMPTY_ENRICHMENT, 'category', 'Tocadores Aura');

    expect(next.categorySlug).toBe('tocadores-aura');
  });

  it('un slug corregido a mano no se pisa: es una dirección pública', () => {
    const corrected = fields({ categoryName: 'Tocadores', categorySlug: 'muebles-bano' });
    const next = withTaxonomyName(corrected, 'category', 'Tocadores Aura');

    expect(next.categorySlug).toBe('muebles-bano');
  });
});
