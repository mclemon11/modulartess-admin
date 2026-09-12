import 'server-only';

/**
 * Operaciones de pedidos contra el backend. **Solo servidor.**
 *
 * Todos los tipos vienen de `./generated/schema`, generado desde la copia comiteada del contrato.
 * Aquí no se declara ni un campo a mano: si el backend cambia el contrato y la copia se actualiza,
 * lo que ya no encaje deja de compilar.
 *
 * Cada llamada transporta la sesión de la persona en `x-modulartess-admin-session`. El
 * `Authorization` con el identity token IAM lo pone el middleware compartido de `backendClient()`:
 * son dos canales separados y no se mezclan.
 *
 * El contrato publica **cuatro** operaciones administrativas de pedido y ninguna más. No hay
 * búsqueda, ni filtros, ni contadores, ni exportación, ni edición del cliente, ni pago, ni
 * reembolso: lo que no está aquí es porque no está en OpenAPI.
 */

import { backendClient } from './backend-client';
import { BackendFailure, failureCodeFromStatus } from './errors';
import type { components } from './generated/schema';
import { ADMIN_SESSION_HEADER } from './session-material';

export type AdminOrder = components['schemas']['AdminOrderDto'];
export type AdminOrderPage = components['schemas']['AdminOrderPageDto'];
export type AdminOrderSummary = components['schemas']['AdminOrderSummaryDto'];
export type OrderLine = components['schemas']['OrderLineDto'];
export type OrderCustomer = components['schemas']['OrderCustomerDto'];
export type OrderShippingAddress = components['schemas']['OrderShippingAddressDto'];
export type OrderTimelineEntry = components['schemas']['OrderTimelineEntryDto'];
export type UpdateOrderStatusRequest = components['schemas']['UpdateOrderStatusRequestDto'];
export type CancelOrderRequest = components['schemas']['CancelOrderRequestDto'];

/** Estado del pedido, tal y como lo publica el contrato. */
export type OrderStatus = AdminOrder['status'];

/** Un `404` aquí significa «ese pedido no existe», no «la superficie está desactivada». */
const RESOURCE = { notFound: 'backend_not_found' } as const;

function sessionHeaders(sessionMaterial: string): Record<string, string> {
  return { [ADMIN_SESSION_HEADER]: sessionMaterial };
}

/** Convierte cualquier fallo en un `BackendFailure` estable, sin propagar nada del origen. */
function toFailure(error: unknown): BackendFailure {
  return error instanceof BackendFailure ? error : new BackendFailure('backend_unavailable');
}

/**
 * Listado administrativo.
 *
 * El contrato solo admite `pageToken` y `pageSize`: no hay búsqueda ni filtros, y la paginación es
 * por cursor opaco, así que se puede avanzar pero no saltar a una página concreta ni saber cuántas
 * hay.
 */
export async function listOrders(
  sessionMaterial: string,
  options: { readonly pageToken?: string; readonly pageSize?: number } = {},
): Promise<AdminOrderPage> {
  const query: { pageToken?: string; pageSize?: number } = {};

  if (options.pageToken !== undefined && options.pageToken !== '') {
    query.pageToken = options.pageToken;
  }

  if (options.pageSize !== undefined) {
    query.pageSize = options.pageSize;
  }

  let response;

  try {
    response = await backendClient().GET('/v1/admin/orders', {
      params: { query },
      headers: sessionHeaders(sessionMaterial),
    });
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw new BackendFailure(failureCodeFromStatus(response.response.status, RESOURCE));
  }

  return response.data;
}

/**
 * Ficha completa del pedido.
 *
 * Trae la **instantánea** de cada línea —nombre, SKU, atributos, imagen y precio de cuando se
 * compró—, así que el detalle no vuelve a leer el catálogo para reconstruir nada: hacerlo
 * reescribiría la historia si el producto cambió después.
 */
export async function getOrder(sessionMaterial: string, orderId: string): Promise<AdminOrder> {
  let response;

  try {
    response = await backendClient().GET('/v1/admin/orders/{orderId}', {
      params: { path: { orderId } },
      headers: sessionHeaders(sessionMaterial),
    });
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw new BackendFailure(failureCodeFromStatus(response.response.status, RESOURCE));
  }

  return response.data;
}

/**
 * Transición operativa del pedido.
 *
 * `expectedVersion` viaja siempre: sin él dos personas moviendo el mismo pedido se pisarían y la
 * última ganaría en silencio. El backend responde `order_version_conflict` cuando no coincide.
 */
export async function changeOrderStatus(
  sessionMaterial: string,
  orderId: string,
  body: UpdateOrderStatusRequest,
): Promise<AdminOrder> {
  let response;

  try {
    response = await backendClient().POST('/v1/admin/orders/{orderId}/status', {
      params: { path: { orderId } },
      body,
      headers: sessionHeaders(sessionMaterial),
    });
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw new BackendFailure(failureCodeFromStatus(response.response.status, RESOURCE));
  }

  return response.data;
}

/**
 * Código estable que el backend pone en el cuerpo del error.
 *
 * Se lee **solo** para distinguir los dos `409` que publica el contrato: `order_version_conflict`
 * y `order_cancellation_requires_refund` comparten estado y significan cosas distintas para quien
 * administra. No se propaga ningún texto del backend, solo se compara el código.
 */
function backendErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }

  const { code } = error as { code: unknown };

  return typeof code === 'string' ? code : null;
}

/**
 * Cancelación.
 *
 * El backend solo la admite sobre `pending_payment`; un pedido pagado responde
 * `order_cancellation_requires_refund`, porque cancelarlo dejaría a alguien cobrado y sin pedido y
 * el flujo de reembolso todavía no existe.
 */
export async function cancelOrder(
  sessionMaterial: string,
  orderId: string,
  body: CancelOrderRequest,
): Promise<AdminOrder> {
  let response;

  try {
    response = await backendClient().POST('/v1/admin/orders/{orderId}/cancel', {
      params: { path: { orderId } },
      body,
      headers: sessionHeaders(sessionMaterial),
    });
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    const status = response.response.status;

    // Los dos `409` del contrato se separan aquí: uno se resuelve recargando y el otro no se
    // resuelve todavía de ninguna forma.
    if (
      status === 409 &&
      backendErrorCode(response.error) === 'order_cancellation_requires_refund'
    ) {
      throw new BackendFailure('backend_refund_required');
    }

    throw new BackendFailure(failureCodeFromStatus(status, RESOURCE));
  }

  return response.data;
}
