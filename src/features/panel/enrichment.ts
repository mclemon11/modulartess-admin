/**
 * Clasificación y contenido enriquecido del producto, entre el formulario y el `PATCH`.
 *
 * Módulo puro. Traduce lo que se escribe en pantalla —siempre texto— al cuerpo que publica
 * `UpdateProductRequestDto`, y al revés para rellenar el formulario con lo que devolvió el
 * backend.
 *
 * Dos matices del contrato que esta traducción respeta:
 *
 *   - En la clasificación, **omitir no es lo mismo que enviar `null`**: omitir deja el campo como
 *     está y `null` lo borra. En el alta se omite lo vacío —no hay nada que borrar todavía—; en la
 *     edición, vaciar el campo sí significa borrarlo.
 *   - `POST /v1/admin/products` no admite ninguno de estos campos. Todos viajan en el `PATCH`
 *     posterior, que es también el que declara los ejes de variación.
 */

import type { ProductAttributeDefinition, ProductTaxonomy } from '@/lib/api/catalog';
import {
  FEATURES_MAX_ITEMS,
  SPECIFICATION_MAX_LENGTH,
  TAXONOMY_SLUG_MAX_LENGTH,
  TAXONOMY_SLUG_PATTERN,
} from '@/lib/api/variant-limits';

import { toSlug } from './slug';

/** Los mismos campos del formulario, todos como texto salvo el destacado. */
export type EnrichmentFields = {
  categoryName: string;
  categorySlug: string;
  productTypeName: string;
  productTypeSlug: string;
  featured: boolean;
  /** Una característica por línea. */
  features: string;
  materials: string;
  measurements: string;
  warranty: string;
  care: string;
};

export const EMPTY_ENRICHMENT: EnrichmentFields = {
  categoryName: '',
  categorySlug: '',
  productTypeName: '',
  productTypeSlug: '',
  featured: false,
  features: '',
  materials: '',
  measurements: '',
  warranty: '',
  care: '',
};

function taxonomy(name: string, slug: string): ProductTaxonomy | null {
  const trimmedName = name.trim();
  const trimmedSlug = slug.trim();

  return trimmedName === '' || trimmedSlug === '' ? null : { name: trimmedName, slug: trimmedSlug };
}

export function featureList(raw: string): readonly string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Cuerpo del `PATCH` con la clasificación, el contenido y los ejes.
 *
 * `mode: 'create'` omite lo que está vacío y devuelve `null` si no hay absolutamente nada que
 * enviar: así el alta no gasta una llamada para no cambiar nada. `mode: 'edit'` envía también lo
 * vacío, porque ahí vaciar un campo es la forma de borrarlo.
 */
export function enrichmentBody(
  fields: EnrichmentFields,
  axes: readonly ProductAttributeDefinition[],
  mode: 'create' | 'edit',
): Record<string, unknown> | null {
  const body: Record<string, unknown> = {};
  const category = taxonomy(fields.categoryName, fields.categorySlug);
  const productType = taxonomy(fields.productTypeName, fields.productTypeSlug);
  const features = featureList(fields.features);

  if (category !== null || mode === 'edit') body.category = category;
  if (productType !== null || mode === 'edit') body.productType = productType;
  if (fields.featured || mode === 'edit') body.featured = fields.featured;
  if (features.length > 0 || mode === 'edit') body.features = features;

  for (const [key, value] of [
    ['materials', fields.materials],
    ['measurements', fields.measurements],
    ['warranty', fields.warranty],
    ['care', fields.care],
  ] as const) {
    if (value.trim() !== '' || mode === 'edit') {
      body[key] = value.trim();
    }
  }

  if (axes.length > 0 || mode === 'edit') {
    body.attributes = axes.map((axis) => ({ key: axis.key, label: axis.label }));
  }

  return Object.keys(body).length === 0 ? null : body;
}

/** Rellena el formulario con lo que devolvió el backend. */
export function enrichmentFromProduct(product: {
  readonly category: ProductTaxonomy | null;
  readonly productType: ProductTaxonomy | null;
  readonly featured: boolean;
  readonly features: readonly string[];
  readonly specifications: {
    readonly materials: string;
    readonly measurements: string;
    readonly warranty: string;
    readonly care: string;
  };
}): EnrichmentFields {
  return {
    categoryName: product.category?.name ?? '',
    categorySlug: product.category?.slug ?? '',
    productTypeName: product.productType?.name ?? '',
    productTypeSlug: product.productType?.slug ?? '',
    featured: product.featured,
    features: product.features.join('\n'),
    materials: product.specifications.materials,
    measurements: product.specifications.measurements,
    warranty: product.specifications.warranty,
    care: product.specifications.care,
  };
}

/**
 * Escribe el nombre de una taxonomía y, **solo si el slug no se ha tocado a mano**, lo vuelve a
 * sugerir desde el nombre.
 *
 * El slug es parte de la URL pública: proponerlo ahorra trabajo, pero pisar uno corregido a
 * propósito cambiaría una dirección sin avisar.
 */
export function withTaxonomyName(
  fields: EnrichmentFields,
  which: 'category' | 'productType',
  name: string,
): EnrichmentFields {
  const nameKey = which === 'category' ? 'categoryName' : 'productTypeName';
  const slugKey = which === 'category' ? 'categorySlug' : 'productTypeSlug';
  const untouched = fields[slugKey] === toSlug(fields[nameKey]);

  return {
    ...fields,
    [nameKey]: name,
    ...(untouched ? { [slugKey]: toSlug(name) } : {}),
  };
}

/**
 * Problemas de la clasificación y el contenido, antes de gastar una llamada.
 *
 * Replica lo que publica el contrato: el slug tiene forma de kebab-case y un máximo de
 * caracteres, la categoría necesita nombre **y** slug —media categoría no es una categoría— y las
 * características tienen un tope. El backend lo vuelve a validar.
 */
export function enrichmentProblems(fields: EnrichmentFields): readonly string[] {
  const problems: string[] = [];

  for (const [label, name, slug] of [
    ['La categoría', fields.categoryName, fields.categorySlug],
    ['El tipo de producto', fields.productTypeName, fields.productTypeSlug],
  ] as const) {
    const hasName = name.trim() !== '';
    const hasSlug = slug.trim() !== '';

    if (hasName !== hasSlug) {
      problems.push(`${label} necesita nombre y slug, o ninguno de los dos.`);
      continue;
    }

    if (hasSlug && !TAXONOMY_SLUG_PATTERN.test(slug.trim())) {
      problems.push(`${label} tiene un slug inválido: minúsculas, números y guiones.`);
    }

    if (slug.trim().length > TAXONOMY_SLUG_MAX_LENGTH) {
      problems.push(`${label} tiene un slug de más de ${TAXONOMY_SLUG_MAX_LENGTH} caracteres.`);
    }
  }

  if (featureList(fields.features).length > FEATURES_MAX_ITEMS) {
    problems.push(`Como máximo ${FEATURES_MAX_ITEMS} características.`);
  }

  for (const [label, value] of [
    ['Materiales', fields.materials],
    ['Medidas', fields.measurements],
    ['Garantía', fields.warranty],
    ['Cuidados', fields.care],
  ] as const) {
    if (value.trim().length > SPECIFICATION_MAX_LENGTH) {
      problems.push(`${label} supera los ${SPECIFICATION_MAX_LENGTH} caracteres.`);
    }
  }

  return problems;
}
