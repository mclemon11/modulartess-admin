/**
 * Llamadas del navegador al BFF del panel.
 *
 * Solo conoce rutas locales. No sabe la URL del backend, no tiene identidad IAM y no puede leer la
 * cookie de sesión: todo eso vive del lado del servidor.
 *
 * Cada respuesta se reduce a un resultado cerrado con el código estable del BFF. No se propaga
 * ningún texto del backend.
 */

import type {
  AdminProduct,
  InventoryAdjustmentResult,
  ProductImageResult,
  ProductVariantResult,
  UploadProductImageResult,
  VariantInventoryAdjustmentResult,
} from '@/lib/api/catalog';

export type MutationResult<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly code: string };

async function send<T>(
  url: string,
  method: 'POST' | 'PATCH' | 'PUT',
  body: unknown,
  expected: number,
) {
  let response: Response;

  try {
    response = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    return { ok: false, code: 'service_unavailable' } as MutationResult<T>;
  }

  if (response.status === expected) {
    try {
      return { ok: true, data: (await response.json()) as T } as MutationResult<T>;
    } catch {
      return { ok: false, code: 'internal_error' } as MutationResult<T>;
    }
  }

  try {
    const payload: unknown = await response.json();

    if (typeof payload === 'object' && payload !== null && 'code' in payload) {
      const { code } = payload as { code: unknown };

      if (typeof code === 'string' && code.length > 0) {
        return { ok: false, code } as MutationResult<T>;
      }
    }
  } catch {
    // Cuerpo ilegible: cae al código genérico.
  }

  return { ok: false, code: 'internal_error' } as MutationResult<T>;
}

export function createProduct(body: unknown): Promise<MutationResult<AdminProduct>> {
  return send<AdminProduct>('/api/admin/products', 'POST', body, 201);
}

export function updateProduct(
  productId: string,
  body: unknown,
): Promise<MutationResult<AdminProduct>> {
  return send<AdminProduct>(
    `/api/admin/products/${encodeURIComponent(productId)}`,
    'PATCH',
    body,
    200,
  );
}

export function transitionProduct(
  productId: string,
  transition: 'publish' | 'archive',
  expectedVersion: number,
): Promise<MutationResult<AdminProduct>> {
  return send<AdminProduct>(
    `/api/admin/products/${encodeURIComponent(productId)}/${transition}`,
    'POST',
    { expectedVersion },
    200,
  );
}

/**
 * Establece el inventario del producto base.
 *
 * Es un `PUT` y manda el **estado final**. No existe aquí el equivalente por delta: la interfaz
 * dejó de usarlo cuando el contrato publicó los dos modos, porque una diferencia no se puede
 * expresar en modo disponibilidad y en modo cantidad hacía creer que se estaban registrando
 * movimientos de almacén.
 *
 * La clave de idempotencia la genera quien inicia la operación y la conserva mientras reintenta
 * **esa misma** operación. Cambiar la cantidad otra vez es otra operación y lleva otra clave.
 */
export function setProductInventory(
  productId: string,
  body: unknown,
): Promise<MutationResult<InventoryAdjustmentResult>> {
  return send<InventoryAdjustmentResult>(
    `/api/admin/products/${encodeURIComponent(productId)}/inventory`,
    'PUT',
    body,
    200,
  );
}

/**
 * Sube una imagen.
 *
 * El `Content-Type` lo fija el navegador con su `boundary`: ponerlo a mano rompería el multipart.
 * La clave de idempotencia viaja en un encabezado propio y la genera quien inicia la subida.
 */
export async function uploadProductImage(
  productId: string,
  form: FormData,
  idempotencyKey: string,
): Promise<MutationResult<UploadProductImageResult>> {
  let response: Response;

  try {
    response = await fetch(`/api/admin/products/${encodeURIComponent(productId)}/images`, {
      method: 'POST',
      headers: { 'x-idempotency-key': idempotencyKey },
      body: form,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    return { ok: false, code: 'service_unavailable' };
  }

  if (response.status === 201) {
    try {
      return { ok: true, data: (await response.json()) as UploadProductImageResult };
    } catch {
      return { ok: false, code: 'internal_error' };
    }
  }

  try {
    const payload: unknown = await response.json();

    if (typeof payload === 'object' && payload !== null && 'code' in payload) {
      const { code } = payload as { code: unknown };

      if (typeof code === 'string' && code.length > 0) {
        return { ok: false, code };
      }
    }
  } catch {
    // Cuerpo ilegible.
  }

  return { ok: false, code: 'internal_error' };
}

export function updateProductImage(
  productId: string,
  imageId: string,
  body: unknown,
): Promise<MutationResult<ProductImageResult>> {
  return send<ProductImageResult>(
    `/api/admin/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`,
    'PATCH',
    body,
    200,
  );
}

export function archiveProductImage(
  productId: string,
  imageId: string,
  expectedVersion: number,
): Promise<MutationResult<ProductImageResult>> {
  return send<ProductImageResult>(
    `/api/admin/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}/archive`,
    'POST',
    { expectedVersion },
    200,
  );
}

/** Ruta de una variante dentro de su producto. Los identificadores se codifican siempre. */
function variantPath(productId: string, variantId: string): string {
  return `/api/admin/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`;
}

export function createVariant(
  productId: string,
  body: unknown,
): Promise<MutationResult<ProductVariantResult>> {
  return send<ProductVariantResult>(
    `/api/admin/products/${encodeURIComponent(productId)}/variants`,
    'POST',
    body,
    201,
  );
}

export function updateVariant(
  productId: string,
  variantId: string,
  body: unknown,
): Promise<MutationResult<ProductVariantResult>> {
  return send<ProductVariantResult>(variantPath(productId, variantId), 'PATCH', body, 200);
}

export function archiveVariant(
  productId: string,
  variantId: string,
  expectedVersion: number,
): Promise<MutationResult<ProductVariantResult>> {
  return send<ProductVariantResult>(
    `${variantPath(productId, variantId)}/archive`,
    'POST',
    { expectedVersion },
    200,
  );
}

/** El inventario de una variante, con las mismas garantías que el del producto base. */
export function setVariantInventory(
  productId: string,
  variantId: string,
  body: unknown,
): Promise<MutationResult<VariantInventoryAdjustmentResult>> {
  return send<VariantInventoryAdjustmentResult>(
    `${variantPath(productId, variantId)}/inventory`,
    'PUT',
    body,
    200,
  );
}
