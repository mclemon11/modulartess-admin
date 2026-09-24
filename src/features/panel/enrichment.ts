/**
 * Clasificación y contenido enriquecido del producto, entre el formulario y el `PATCH`.
 *
 * Módulo puro. Traduce lo que se escribe en pantalla al cuerpo que publica
 * `UpdateProductRequestDto`, y al revés para rellenar el formulario con lo que devolvió el
 * backend.
 *
 * Tres matices del contrato que esta traducción respeta:
 *
 *   - En la clasificación, **omitir no es lo mismo que enviar `null`**: omitir deja el campo como
 *     está y `null` lo borra. En el alta se omite lo vacío —no hay nada que borrar todavía—; en la
 *     edición, vaciar el campo sí significa borrarlo.
 *   - `POST /v1/admin/products` no admite ninguno de estos campos. Todos viajan en el `PATCH`
 *     posterior, que es también el que declara los ejes de variación.
 *   - Un campo vacío viaja vacío. El `placeholder` de la pantalla es una ayuda visual del
 *     navegador, no un valor: nunca se guarda ni se envía en su lugar.
 */

import type { ProductAttributeDefinition, ProductTaxonomy } from '@/lib/api/catalog';
import {
  SPECIFICATION_MAX_LENGTH,
  TAXONOMY_SLUG_MAX_LENGTH,
  TAXONOMY_SLUG_PATTERN,
} from '@/lib/api/variant-limits';

import {
  categoryPatch,
  choiceFromProduct,
  NO_CATEGORY,
  type CategoryChoice,
} from './category-selection';
import {
  featureProblems,
  hasFeatureProblems,
  submittedFeatures,
  type FeatureProblems,
} from './product-content';
import { toSlug } from './slug';

/** Los cuatro textos de «Detalles adicionales», todos opcionales para el contrato. */
export type SpecificationKey = 'materials' | 'measurements' | 'warranty' | 'care';

export const SPECIFICATION_KEYS: readonly SpecificationKey[] = [
  'materials',
  'measurements',
  'warranty',
  'care',
];

/** Los mismos campos del formulario, todos como texto salvo el destacado y las características. */
export type EnrichmentFields = {
  /**
   * La categoría, **elegida del catálogo**. Ya no se escriben su nombre ni su slug: salen de la
   * categoría elegida, o se conserva la que el producto ya tenía. Ver `category-selection.ts`.
   */
  category: CategoryChoice;
  productTypeName: string;
  productTypeSlug: string;
  featured: boolean;
  /**
   * Una característica por fila, en el orden en el que se enviarán.
   *
   * Es `string[]`, igual que el contrato: las filas del editor son presentación, no un modelo
   * paralelo. Una fila vacía es una fila que todavía no se ha escrito, y no viaja.
   */
  features: readonly string[];
  materials: string;
  measurements: string;
  warranty: string;
  care: string;
};

export const EMPTY_ENRICHMENT: EnrichmentFields = {
  category: NO_CATEGORY,
  productTypeName: '',
  productTypeSlug: '',
  featured: false,
  features: [],
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
  const category = categoryPatch(fields.category, mode);
  const productType = taxonomy(fields.productTypeName, fields.productTypeSlug);
  const features = submittedFeatures(fields.features);

  // `undefined` es «no se envía»: la categoría que el producto ya tenía no se reenvía sola.
  if (category !== undefined) body.category = category;
  if (productType !== null || mode === 'edit') body.productType = productType;
  if (fields.featured || mode === 'edit') body.featured = fields.featured;
  if (features.length > 0 || mode === 'edit') body.features = features;

  for (const key of SPECIFICATION_KEYS) {
    if (fields[key].trim() !== '' || mode === 'edit') {
      body[key] = fields[key].trim();
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
    category: choiceFromProduct(product.category),
    productTypeName: product.productType?.name ?? '',
    productTypeSlug: product.productType?.slug ?? '',
    featured: product.featured,
    features: [...product.features],
    materials: product.specifications.materials,
    measurements: product.specifications.measurements,
    warranty: product.specifications.warranty,
    care: product.specifications.care,
  };
}

/**
 * Escribe el nombre del tipo de producto y, **solo si el slug no se ha tocado a mano**, lo vuelve a
 * sugerir desde el nombre.
 *
 * El slug es parte de la URL pública: proponerlo ahorra trabajo, pero pisar uno corregido a
 * propósito cambiaría una dirección sin avisar. La categoría ya no pasa por aquí: se elige del
 * catálogo.
 */
export function withProductTypeName(fields: EnrichmentFields, name: string): EnrichmentFields {
  const untouched = fields.productTypeSlug === toSlug(fields.productTypeName);

  return {
    ...fields,
    productTypeName: name,
    ...(untouched ? { productTypeSlug: toSlug(name) } : {}),
  };
}

export type EnrichmentProblems = {
  /** Problemas del tipo de producto. La categoría sale del catálogo y no tiene forma que validar. */
  readonly classification: readonly string[];
  /** Problemas de las características, separados por fila. */
  readonly features: FeatureProblems;
  /** Problema de cada detalle adicional, junto a su propio campo. */
  readonly specifications: Readonly<Partial<Record<SpecificationKey, string>>>;
};

const SPECIFICATION_LABELS: Readonly<Record<SpecificationKey, string>> = {
  materials: 'Materiales',
  measurements: 'Medidas',
  warranty: 'Garantía',
  care: 'Cuidados',
};

/**
 * Problemas de la clasificación y el contenido, antes de gastar una llamada.
 *
 * Replica lo que publica el contrato: el slug tiene forma de kebab-case y un máximo de caracteres,
 * el tipo de producto necesita nombre **y** slug —medio tipo no es un tipo—, las
 * características tienen su tope de filas y de longitud, y los detalles adicionales el suyo. Que
 * un detalle adicional esté vacío **no** es un problema: el contrato los publica como opcionales.
 * El backend lo vuelve a validar.
 */
export function enrichmentProblems(fields: EnrichmentFields): EnrichmentProblems {
  const classification: string[] = [];

  for (const [label, name, slug] of [
    ['El tipo de producto', fields.productTypeName, fields.productTypeSlug],
  ] as const) {
    const hasName = name.trim() !== '';
    const hasSlug = slug.trim() !== '';

    if (hasName !== hasSlug) {
      classification.push(`${label} necesita nombre y slug, o ninguno de los dos.`);
      continue;
    }

    if (hasSlug && !TAXONOMY_SLUG_PATTERN.test(slug.trim())) {
      classification.push(`${label} tiene un slug inválido: minúsculas, números y guiones.`);
    }

    if (slug.trim().length > TAXONOMY_SLUG_MAX_LENGTH) {
      classification.push(
        `${label} tiene un slug de más de ${TAXONOMY_SLUG_MAX_LENGTH} caracteres.`,
      );
    }
  }

  const specifications: Partial<Record<SpecificationKey, string>> = {};

  for (const key of SPECIFICATION_KEYS) {
    if (fields[key].trim().length > SPECIFICATION_MAX_LENGTH) {
      specifications[key] =
        `${SPECIFICATION_LABELS[key]} supera los ${SPECIFICATION_MAX_LENGTH} caracteres.`;
    }
  }

  return { classification, features: featureProblems(fields.features), specifications };
}

/** `true` cuando algo del contenido enriquecido impide guardar. */
export function hasEnrichmentProblems(problems: EnrichmentProblems): boolean {
  return (
    problems.classification.length > 0 ||
    hasFeatureProblems(problems.features) ||
    Object.keys(problems.specifications).length > 0
  );
}
