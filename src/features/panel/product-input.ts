/**
 * Validación de los cuerpos que el navegador envía al BFF.
 *
 * Módulo puro. Los límites replican el contrato: `priceCop` en pesos enteros, cantidades no
 * negativas, `expectedVersion` a partir de 1 y `delta` entero distinto de cero.
 *
 * El backend vuelve a validar todo. Esto evita gastar una llamada y un identity token en un cuerpo
 * que ya se sabe inválido, y da un mensaje inmediato a quien rellena el formulario.
 */

import type {
  CreateProductRequest,
  InventoryAdjustmentRequest,
  UpdateProductRequest,
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
