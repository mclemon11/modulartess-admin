/**
 * Llamadas del navegador al BFF de pedidos.
 *
 * Solo conoce rutas locales. No sabe la URL del backend, no tiene identidad IAM y no puede leer la
 * cookie de sesión: todo eso vive del lado del servidor.
 *
 * Cada respuesta se reduce a un resultado cerrado con el código estable del BFF. No se propaga
 * ningún texto del backend, y **nada se guarda** en `localStorage` ni en `sessionStorage`: los
 * datos del pedido viven en memoria mientras la pantalla está abierta y desaparecen con ella.
 */

import type { AdminOrder } from '@/lib/api/orders';

export type OrderMutationResult =
  { readonly ok: true; readonly data: AdminOrder } | { readonly ok: false; readonly code: string };

async function post(url: string, body: unknown): Promise<OrderMutationResult> {
  let response: Response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    return { ok: false, code: 'service_unavailable' };
  }

  if (response.status === 200) {
    try {
      return { ok: true, data: (await response.json()) as AdminOrder };
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
    // Cuerpo ilegible: cae al código genérico.
  }

  return { ok: false, code: 'internal_error' };
}

export function changeOrderStatus(
  orderId: string,
  status: string,
  expectedVersion: number,
): Promise<OrderMutationResult> {
  return post(`/api/admin/orders/${encodeURIComponent(orderId)}/status`, {
    expectedVersion,
    status,
  });
}

export function cancelOrder(
  orderId: string,
  expectedVersion: number,
): Promise<OrderMutationResult> {
  return post(`/api/admin/orders/${encodeURIComponent(orderId)}/cancel`, { expectedVersion });
}
