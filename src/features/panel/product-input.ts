/**
 * Validación de los cuerpos que el navegador envía al BFF.
 *
 * Módulo puro. Los límites replican el contrato: `priceCop` en pesos enteros, cantidades no
 * negativas, `expectedVersion` a partir de 1 y `delta` entero distinto de cero.
 *
 * El backend vuelve a validar todo. Esto evita gastar una llamada y un identity token en un cuerpo
 * que ya se sabe inválido, y da un mensaje inmediato a quien rellena el formulario.
 */

import { IMAGE_ALT_MAX_LENGTH } from '@/lib/api/image-limits';
import {
  ATTRIBUTE_KEY_PATTERN,
  ATTRIBUTE_MAX_AXES,
  ATTRIBUTE_VALUE_MAX_LENGTH,
  ATTRIBUTE_VALUE_PATTERN,
  FEATURES_MAX_ITEMS,
  SPECIFICATION_MAX_LENGTH,
  TAXONOMY_SLUG_MAX_LENGTH,
  TAXONOMY_SLUG_PATTERN,
} from '@/lib/api/variant-limits';
import type {
  CreateProductRequest,
  CreateProductVariantRequest,
  InventoryAdjustmentRequest,
  ProductAttributeDefinition,
  ProductTaxonomy,
  ProductVariantAttribute,
  UpdateProductImageRequest,
  UpdateProductRequest,
  UpdateProductVariantRequest,
} from '@/lib/api/catalog';

export const SKU_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,63}$/;
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
export const MAX_TEXT_LENGTH = 4096;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH) return null;

  return value;
}

function wholeNumber(value: unknown, min: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min ? value : null;
}

export function parseCreateProduct(raw: unknown): CreateProductRequest | null {
  if (!isRecord(raw)) return null;

  const { sku, slug, name, priceCop } = raw;

  if (typeof sku !== 'string' || !SKU_PATTERN.test(sku)) return null;
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug)) return null;
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 200) return null;

  const price = wholeNumber(priceCop, 0);

  if (price === null) return null;

  const shortDescription = optionalText(raw.shortDescription);
  const description = optionalText(raw.description);

  if (shortDescription === null || description === null) return null;

  const stockQuantity = raw.stockQuantity === undefined ? 0 : wholeNumber(raw.stockQuantity, 0);
  const lowStockThreshold =
    raw.lowStockThreshold === undefined ? 0 : wholeNumber(raw.lowStockThreshold, 0);

  if (stockQuantity === null || lowStockThreshold === null) return null;

  // `status` no se acepta: el backend crea siempre en `draft`, y ofrecerlo mentiría.
  return {
    sku,
    slug,
    name,
    priceCop: price,
    stockQuantity,
    lowStockThreshold,
    ...(shortDescription === undefined ? {} : { shortDescription }),
    ...(description === undefined ? {} : { description }),
  };
}

/**
 * Taxonomía —categoría o tipo— tal y como la publica el contrato: `slug` y `nombre`.
 *
 * Devuelve `undefined` si el campo no viene (se deja como está), `null` si viene a `null` (se
 * borra) y `false` si es inválido. Los tres casos son distintos y confundirlos borraría una
 * categoría por accidente.
 *
 * Todavía no hay catálogo independiente de categorías: no hay endpoint del que sacar una lista,
 * así que no se ofrece un selector. Se escriben el nombre y el slug, y el backend valida.
 */
function optionalTaxonomy(value: unknown): ProductTaxonomy | null | undefined | false {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!isRecord(value)) return false;

  const { slug, name } = value;

  if (typeof slug !== 'string' || !TAXONOMY_SLUG_PATTERN.test(slug)) return false;
  if (slug.length > TAXONOMY_SLUG_MAX_LENGTH) return false;
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 200) return false;

  return { slug, name: name.trim() };
}

/** Texto de una especificación: `materials`, `measurements`, `warranty` o `care`. */
function optionalSpecification(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > SPECIFICATION_MAX_LENGTH) return null;

  return value;
}

/** Definiciones de los ejes de variación. Sustituyen a las anteriores; no se fusionan. */
function optionalAttributeDefinitions(
  value: unknown,
): readonly ProductAttributeDefinition[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > ATTRIBUTE_MAX_AXES) return null;

  const definitions: ProductAttributeDefinition[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (!isRecord(entry)) return null;

    const { key, label } = entry;

    if (typeof key !== 'string' || !ATTRIBUTE_KEY_PATTERN.test(key)) return null;
    if (typeof label !== 'string' || label.trim().length === 0 || label.length > 120) return null;
    if (seen.has(key)) return null;

    seen.add(key);
    definitions.push({ key, label: label.trim() });
  }

  return definitions;
}

/** Atributos de una variante: cada eje con su valor normalizado y su etiqueta visible. */
function variantAttributes(value: unknown): readonly ProductVariantAttribute[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > ATTRIBUTE_MAX_AXES) {
    return null;
  }

  const attributes: ProductVariantAttribute[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (!isRecord(entry)) return null;

    const { key, value: raw, label } = entry;

    if (typeof key !== 'string' || !ATTRIBUTE_KEY_PATTERN.test(key)) return null;
    if (typeof raw !== 'string' || !ATTRIBUTE_VALUE_PATTERN.test(raw)) return null;
    if (raw.length > ATTRIBUTE_VALUE_MAX_LENGTH) return null;
    if (typeof label !== 'string' || label.trim().length === 0 || label.length > 120) return null;
    if (seen.has(key)) return null;

    seen.add(key);
    attributes.push({ key, value: raw, label: label.trim() });
  }

  return attributes;
}

export function parseUpdateProduct(raw: unknown): UpdateProductRequest | null {
  if (!isRecord(raw)) return null;

  const expectedVersion = wholeNumber(raw.expectedVersion, 1);

  if (expectedVersion === null) return null;

  const body: UpdateProductRequest = { expectedVersion };

  if (raw.name !== undefined) {
    if (typeof raw.name !== 'string' || raw.name.trim().length === 0 || raw.name.length > 200) {
      return null;
    }

    body.name = raw.name;
  }

  if (raw.priceCop !== undefined) {
    const price = wholeNumber(raw.priceCop, 0);

    if (price === null) return null;

    body.priceCop = price;
  }

  if (raw.lowStockThreshold !== undefined) {
    const threshold = wholeNumber(raw.lowStockThreshold, 0);

    if (threshold === null) return null;

    body.lowStockThreshold = threshold;
  }

  const shortDescription = optionalText(raw.shortDescription);
  const description = optionalText(raw.description);

  if (shortDescription === null || description === null) return null;
  if (shortDescription !== undefined) body.shortDescription = shortDescription;
  if (description !== undefined) body.description = description;

  // Clasificación. `null` borra el campo; omitirlo lo deja como está. Son cosas distintas.
  const category = optionalTaxonomy(raw.category);
  const productType = optionalTaxonomy(raw.productType);

  if (category === false || productType === false) return null;
  if (category !== undefined) body.category = category;
  if (productType !== undefined) body.productType = productType;

  if (raw.featured !== undefined) {
    if (typeof raw.featured !== 'boolean') return null;

    body.featured = raw.featured;
  }

  if (raw.features !== undefined) {
    if (!Array.isArray(raw.features) || raw.features.length > FEATURES_MAX_ITEMS) return null;

    const features: string[] = [];

    for (const feature of raw.features) {
      if (typeof feature !== 'string') return null;

      const trimmed = feature.trim();

      if (trimmed.length === 0 || trimmed.length > MAX_TEXT_LENGTH) return null;

      features.push(trimmed);
    }

    body.features = features;
  }

  const materials = optionalSpecification(raw.materials);
  const measurements = optionalSpecification(raw.measurements);
  const warranty = optionalSpecification(raw.warranty);
  const care = optionalSpecification(raw.care);

  if (materials === null || measurements === null || warranty === null || care === null) {
    return null;
  }

  if (materials !== undefined) body.materials = materials;
  if (measurements !== undefined) body.measurements = measurements;
  if (warranty !== undefined) body.warranty = warranty;
  if (care !== undefined) body.care = care;

  const attributes = optionalAttributeDefinitions(raw.attributes);

  if (attributes === null) return null;
  if (attributes !== undefined) body.attributes = [...attributes];

  return body;
}

export function parseTransition(raw: unknown): { readonly expectedVersion: number } | null {
  if (!isRecord(raw)) return null;

  const expectedVersion = wholeNumber(raw.expectedVersion, 1);

  return expectedVersion === null ? null : { expectedVersion };
}

export type InventoryAdjustmentInput = InventoryAdjustmentRequest & {
  readonly idempotencyKey: string;
};

/** La clave de idempotencia la genera el cliente y viaja en el cuerpo; el BFF la pasa al encabezado. */
export function parseInventoryAdjustment(raw: unknown): InventoryAdjustmentInput | null {
  if (!isRecord(raw)) return null;

  const expectedVersion = wholeNumber(raw.expectedVersion, 1);

  if (expectedVersion === null) return null;

  const { delta, reason, idempotencyKey } = raw;

  if (typeof delta !== 'number' || !Number.isInteger(delta) || delta === 0) return null;
  if (typeof reason !== 'string' || reason.trim().length === 0 || reason.length > 280) return null;
  if (
    typeof idempotencyKey !== 'string' ||
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 128
  ) {
    return null;
  }

  return { expectedVersion, delta, reason, idempotencyKey };
}

/**
 * Edición de una imagen.
 *
 * Al menos uno de los tres campos opcionales tiene que venir: un `PATCH` que solo lleva
 * `expectedVersion` gastaría una llamada para no cambiar nada.
 */
export function parseUpdateProductImage(raw: unknown): UpdateProductImageRequest | null {
  if (!isRecord(raw)) return null;

  const expectedVersion = wholeNumber(raw.expectedVersion, 1);

  if (expectedVersion === null) return null;

  const body: UpdateProductImageRequest = { expectedVersion };
  let touched = false;

  if (raw.altText !== undefined) {
    if (
      typeof raw.altText !== 'string' ||
      raw.altText.trim().length === 0 ||
      raw.altText.length > IMAGE_ALT_MAX_LENGTH
    ) {
      return null;
    }

    body.altText = raw.altText.trim();
    touched = true;
  }

  if (raw.position !== undefined) {
    const position = wholeNumber(raw.position, 0);

    if (position === null) return null;

    body.position = position;
    touched = true;
  }

  if (raw.isPrimary !== undefined) {
    // El contrato solo acepta `true`.
    if (raw.isPrimary !== true) return null;

    body.isPrimary = true;
    touched = true;
  }

  return touched ? body : null;
}

/**
 * Alta de una variante.
 *
 * `expectedVersion` es la del producto: el contrato trata la colección de variantes como parte de
 * él. Los ejes que debe llevar los decide el producto, y quien lo comprueba de verdad es el
 * backend; aquí solo se verifica la forma.
 */
export function parseCreateVariant(raw: unknown): CreateProductVariantRequest | null {
  if (!isRecord(raw)) return null;

  const expectedVersion = wholeNumber(raw.expectedVersion, 1);

  if (expectedVersion === null) return null;

  const { sku } = raw;

  if (typeof sku !== 'string' || !SKU_PATTERN.test(sku)) return null;

  // El contrato pide pesos enteros mayores que cero.
  const priceCop = wholeNumber(raw.priceCop, 1);

  if (priceCop === null) return null;

  const attributes = variantAttributes(raw.attributes);

  if (attributes === null) return null;

  const stockQuantity = raw.stockQuantity === undefined ? 0 : wholeNumber(raw.stockQuantity, 0);

  if (stockQuantity === null) return null;

  return { expectedVersion, sku, priceCop, stockQuantity, attributes: [...attributes] };
}

/**
 * Edición de una variante: atributos o precio.
 *
 * Ni el SKU ni el stock entran aquí: el SKU es inmutable y el stock se mueve con un ajuste de
 * inventario. Al menos uno de los dos campos editables tiene que venir.
 */
export function parseUpdateVariant(raw: unknown): UpdateProductVariantRequest | null {
  if (!isRecord(raw)) return null;

  const expectedVersion = wholeNumber(raw.expectedVersion, 1);

  if (expectedVersion === null) return null;

  const body: UpdateProductVariantRequest = { expectedVersion };
  let touched = false;

  if (raw.priceCop !== undefined) {
    const priceCop = wholeNumber(raw.priceCop, 1);

    if (priceCop === null) return null;

    body.priceCop = priceCop;
    touched = true;
  }

  if (raw.attributes !== undefined) {
    const attributes = variantAttributes(raw.attributes);

    if (attributes === null) return null;

    body.attributes = [...attributes];
    touched = true;
  }

  return touched ? body : null;
}
