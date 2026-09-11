/**
 * Llamadas del navegador al BFF del panel.
 *
 * Solo conoce rutas locales. No sabe la URL del backend, no tiene identidad IAM y no puede leer la
 * cookie de sesión: todo eso vive del lado del servidor.
 *
 * Cada respuesta se reduce a un resultado cerrado con el código estable del BFF. No se propaga
 * ningún texto del backend.
 */

import type { AdminProduct, InventoryAdjustmentResult } from '@/lib/api/catalog';

export type MutationResult<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly code: string };

async function send<T>(url: string, method: 'POST' | 'PATCH', body: unknown, expected: number) {
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

export function adjustInventory(
  productId: string,
  body: unknown,
): Promise<MutationResult<InventoryAdjustmentResult>> {
  return send<InventoryAdjustmentResult>(
    `/api/admin/products/${encodeURIComponent(productId)}/inventory-adjustments`,
    'POST',
    body,
    200,
  );
}
