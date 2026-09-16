import { describe, expect, it } from 'vitest';

import contract from '../../../openapi/backend-v1.json';

import {
  describeReadiness,
  describeRequirement,
  groupBySection,
  SECTION_IDS,
  SECTION_LABELS,
  type PublicationRequirement,
} from './publication-readiness';

/**
 * La traducción tiene que cubrir **todos** los códigos que publica el contrato.
 *
 * El mapa está tipado como `Record<PublicationRequirement, …>`, así que un código nuevo rompe la
 * compilación; esta prueba cierra el otro lado: que el enum del contrato y lo que el panel traduce
 * sean exactamente el mismo conjunto, y que ningún texto se quede en el identificador en inglés.
 */
const ENUM = contract.components.schemas.PublicationReadinessDto.properties.missing.items
  .enum as readonly PublicationRequirement[];

describe('traducción de los requisitos de publicación', () => {
  it('el contrato publica los quince códigos que el panel conoce', () => {
    expect([...ENUM].sort()).toEqual(
      [
        'care',
        'category',
        'description',
        'features',
        'materials',
        'measurements',
        'name',
        'positive_price',
        'product_type',
        'sellable_option',
        'short_description',
        'sku',
        'slug',
        'unique_variant_combinations',
        'warranty',
      ].sort(),
    );
  });

  it('las imágenes ya no son un requisito de publicación', () => {
    // El backend dejó de emitir `primary_image` y `gallery`: un producto sin imágenes se publica.
    expect(ENUM).not.toContain('primary_image');
    expect(ENUM).not.toContain('gallery');
  });

  it.each(ENUM)('«%s» tiene texto en español y sección de destino', (requirement) => {
    const copy = describeRequirement(requirement);

    expect(copy.title).not.toBe(requirement);
    expect(copy.title.length).toBeGreaterThan(0);
    expect(copy.hint.length).toBeGreaterThan(0);
    expect(SECTION_LABELS[copy.section]).toBeDefined();
    expect(SECTION_IDS[copy.section]).toBeDefined();
  });

  it('no hay dos requisitos con el mismo título', () => {
    const titles = ENUM.map((requirement) => describeRequirement(requirement).title);

    expect(new Set(titles).size).toBe(titles.length);
  });

  it('un código que el contrato añada más tarde se muestra sin romper la pantalla', () => {
    const copy = describeRequirement('codigo_inventado');

    expect(copy.title).toBe('codigo_inventado');
    expect(SECTION_IDS[copy.section]).toBeDefined();
  });
});

describe('resumen', () => {
  it('dice si está listo o cuántos requisitos faltan', () => {
    expect(describeReadiness({ ready: true, missing: [] })).toBe('Listo para publicar');
    expect(describeReadiness({ ready: false, missing: ['name'] })).toBe('Falta 1 requisito');
    expect(describeReadiness({ ready: false, missing: ['name', 'sku', 'materials'] })).toBe(
      'Faltan 3 requisitos',
    );
  });

  it('agrupa lo pendiente por la sección donde se resuelve', () => {
    const groups = groupBySection({
      ready: false,
      missing: ['materials', 'name', 'positive_price', 'sku'],
    });

    expect(groups.map((group) => group.section)).toEqual(['basica', 'precio', 'contenido']);
    expect(groups[0]?.items.map((item) => item.title)).toEqual(['Falta el nombre', 'Falta el SKU']);
  });

  it('nunca agrupa nada en la sección de imágenes', () => {
    // Las imágenes son opcionales: ningún código del contrato lleva ya a esa sección.
    const groups = groupBySection({ ready: false, missing: [...ENUM] });

    expect(groups.map((group) => group.section)).not.toContain('imagenes');
  });

  it('sin requisitos pendientes no hay grupos', () => {
    expect(groupBySection({ ready: true, missing: [] })).toEqual([]);
  });
});
