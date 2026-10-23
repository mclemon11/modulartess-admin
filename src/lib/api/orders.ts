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
 * El contrato publica las operaciones administrativas de pedido que hay aquí y ninguna más:
 * listado —con filtro por estado—, exportación CSV del listado, ficha, transición de estado,
 * cancelación, edición controlada —estado, notas internas y productos, con su vista previa— y el
 * simulador de pago de staging. No hay búsqueda, ni edición del cliente, ni pasarela real, ni
 * reembolso: lo que no está aquí es porque no está en OpenAPI.
 */

import { backendClient } from './backend-client';
import { BackendFailure, failureCodeFromStatus, orderEditFailure } from './errors';
import type { components } from './generated/schema';
import { ADMIN_SESSION_HEADER } from './session-material';

export type AdminOrder = components['schemas']['AdminOrderDto'];
export type AdminOrderPage = components['schemas']['AdminOrderPageDto'];
export type AdminOrderSummary = components['schemas']['AdminOrderSummaryDto'];
/** Fila del listado de pedidos: el resumen más cómo se cobró, solo con el pago aprobado. */
export type AdminOrderListItem = components['schemas']['AdminOrderListItemDto'];
/** Un estado por el que se puede filtrar el listado, con la etiqueta que publica el backend. */
export type AdminOrderStatusOption = components['schemas']['AdminOrderStatusOptionDto'];
export type AdminPaymentSummary = components['schemas']['AdminPaymentSummaryDto'];
export type AdminPaymentProvider = components['schemas']['AdminPaymentProviderDto'];
export type AdminPaymentMethod = components['schemas']['AdminPaymentMethodDto'];
export type AdminCardDetails = components['schemas']['AdminCardDetailsDto'];
export type OrderLine = components['schemas']['OrderLineDto'];
export type OrderCustomer = components['schemas']['OrderCustomerDto'];
export type OrderShippingAddress = components['schemas']['OrderShippingAddressDto'];
export type OrderTimelineEntry = components['schemas']['OrderTimelineEntryDto'];
export type OrderPayment = components['schemas']['OrderPaymentDto'];
export type AdminPaymentEvent = components['schemas']['AdminPaymentEventDto'];
export type AdminPaymentAttempt = components['schemas']['AdminPaymentAttemptDto'];
export type AdminNotification = components['schemas']['AdminNotificationDto'];
export type UpdateOrderStatusRequest = components['schemas']['UpdateOrderStatusRequestDto'];
export type OrderShipment = components['schemas']['OrderShipmentDto'];
export type OrderShipmentInput = components['schemas']['OrderShipmentInputDto'];
export type CancelOrderRequest = components['schemas']['CancelOrderRequestDto'];
export type EditOrderRequest = components['schemas']['EditOrderRequestDto'];
export type EditOrderResult = components['schemas']['EditOrderResultDto'];
export type EditOrderLine = components['schemas']['CreateOrderItemDto'];
export type StatusReminderRequest = components['schemas']['StatusReminderRequestDto'];
export type StatusReminderResponse = components['schemas']['StatusReminderResponseDto'];
export type SimulatePaymentRequest = components['schemas']['SimulatePaymentRequestDto'];

/** Estado del pedido, tal y como lo publica el contrato. */
export type OrderStatus = AdminOrder['status'];

/** Estado del **pago**, que es otra lectura y tiene sus propios valores. */
export type PaymentStatus = OrderPayment['status'];

/** Resultados que el simulador de staging sabe aplicar. */
export type PaymentSimulationEvent = SimulatePaymentRequest['event'];

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
 * Listado administrativo, por número de página.
 *
 * El backend resuelve la página con un cursor propio y publica el total, así que el panel puede
 * pintar números de página sin descargar todos los pedidos. Sin `page` se sirve la primera.
 */
export async function listOrders(
  sessionMaterial: string,
  options: {
    readonly page?: number;
    readonly pageSize?: number;
    /** Solo los pedidos en este estado; `null` o ausente, todos. Lo valida el backend. */
    readonly status?: string | null;
  } = {},
): Promise<AdminOrderPage> {
  const query: { page?: number; pageSize?: number; status?: OrderStatus } = {};

  if (options.page !== undefined) {
    query.page = options.page;
  }

  if (options.pageSize !== undefined) {
    query.pageSize = options.pageSize;
  }

  if (options.status !== undefined && options.status !== null) {
    // El valor viaja tal cual: si no es un estado del contrato, el backend responde 400.
    query.status = options.status as OrderStatus;
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

export type OrderExport =
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'file';
      readonly bytes: ArrayBuffer;
      readonly contentDisposition: string | null;
      readonly count: string | null;
    };

/**
 * Exportación CSV de todos los pedidos del listado con el filtro dado, compuesta por el backend.
 *
 * El backend recorre el listado con su cursor y entrega el archivo entero: el panel no descarga
 * páginas de pedidos ni monta filas, solo reenvía los bytes. `204` significa que no hay ningún
 * pedido que exportar. Los bytes no se leen ni se registran aquí.
 */
export async function exportOrders(
  sessionMaterial: string,
  status: string | null,
): Promise<OrderExport> {
  let response;

  try {
    response = await backendClient().GET('/v1/admin/orders/export', {
      params: { query: status === null ? {} : { status: status as OrderStatus } },
      headers: sessionHeaders(sessionMaterial),
      parseAs: 'arrayBuffer',
    });
  } catch (error) {
    throw toFailure(error);
  }

  if (response.response.status === 204) {
    return { kind: 'empty' };
  }

  if (response.error !== undefined || response.data === undefined) {
    if (backendErrorCode(response.error) === 'order_export_too_large') {
      throw new BackendFailure('backend_order_export_too_large');
    }

    throw new BackendFailure(failureCodeFromStatus(response.response.status, RESOURCE));
  }

  return {
    kind: 'file',
    bytes: response.data,
    contentDisposition: response.response.headers.get('content-disposition'),
    count: response.response.headers.get('x-order-export-count'),
  };
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
    // `shipped` sin transportadora, guía o enlace válidos: tiene su propio texto.
    if (backendErrorCode(response.error) === 'order_shipment_invalid') {
      throw new BackendFailure('backend_order_shipment_invalid');
    }

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

/**
 * Recordatorio manual del estado actual al cliente.
 *
 * El cuerpo lleva **solo** `expectedVersion`: el destinatario, el texto, el estado y el enlace los
 * pone el backend desde el pedido, y el contrato rechaza cualquier otro campo. Exige
 * `notifications.send_reminder`. Responde `queued` o `already_queued`; el segundo significa que ya
 * existía el de esta versión y no se escribió nada.
 */
export async function sendStatusReminder(
  sessionMaterial: string,
  orderId: string,
  body: StatusReminderRequest,
): Promise<StatusReminderResponse> {
  let response;

  try {
    response = await backendClient().POST(
      '/v1/admin/orders/{orderId}/notifications/status-reminder',
      {
        params: { path: { orderId } },
        body,
        headers: sessionHeaders(sessionMaterial),
      },
    );
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    const status = response.response.status;
    const code = backendErrorCode(response.error);

    if (status === 409 && code === 'order_status_reminder_not_allowed') {
      throw new BackendFailure('backend_status_reminder_not_allowed');
    }
    if (status === 503 && code === 'notifications_unavailable') {
      throw new BackendFailure('backend_notifications_unavailable');
    }

    throw new BackendFailure(failureCodeFromStatus(status, RESOURCE));
  }

  return response.data;
}

/**
 * Resultado de pago simulado. **Solo staging.**
 *
 * No es una pasarela: el contrato dice que la ruta solo existe con `PAYMENT_SIMULATION_MODE=enabled`
 * junto a `INTEGRATION_MODE=mock`, que exige `payments.simulate` —que solo tiene `super_admin`— y
 * que todo queda registrado con `environment=sandbox`. Una aprobación mueve el pedido a `paid` para
 * poder recorrer el ciclo, pero **no representa un cobro** y no toca el inventario.
 *
 * El resultado atraviesa la misma máquina de estados que usará el webhook verificado, así que desde
 * aquí no hay forma de escribir un estado de pago arbitrario.
 *
 * `eventId` es la clave de idempotencia: repetirlo con el mismo resultado no cambia nada y no manda
 * un segundo correo; reutilizarlo con otro resultado es un conflicto. Por eso quien llama lo
 * conserva entre reintentos en lugar de generar uno nuevo.
 */
export async function simulateOrderPayment(
  sessionMaterial: string,
  orderId: string,
  body: SimulatePaymentRequest,
): Promise<AdminOrder> {
  let response;

  try {
    response = await backendClient().POST('/v1/admin/orders/{orderId}/payment-simulation', {
      params: { path: { orderId } },
      body,
      headers: sessionHeaders(sessionMaterial),
    });
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    const status = response.response.status;
    const code = backendErrorCode(response.error);

    // Un `404` aquí significa dos cosas distintas y el contrato las separa por código: el pedido no
    // existe, o el simulador está apagado en este despliegue y la ruta responde como si no
    // existiera. Mandar a alguien a buscar un pedido que sí está sería el peor de los dos errores.
    if (status === 404 && code !== 'order_not_found') {
      throw new BackendFailure('backend_simulator_disabled');
    }

    // Los tres `409` del contrato. Solo uno se arregla recargando.
    if (status === 409 && code === 'order_payment_transition_invalid') {
      throw new BackendFailure('backend_payment_transition_invalid');
    }

    if (status === 409 && code === 'order_payment_conflict') {
      throw new BackendFailure('backend_payment_conflict');
    }

    throw new BackendFailure(failureCodeFromStatus(status, RESOURCE));
  }

  return response.data;
}

/**
 * Edición controlada del pedido (ADR 0028 del backend), o su vista previa.
 *
 * El cuerpo ya llega validado en su forma por el BFF; el backend vuelve a validarlo todo y es quien
 * resuelve precios, envío y totales. La vista previa no escribe nada.
 */
export async function editOrder(
  sessionMaterial: string,
  orderId: string,
  body: EditOrderRequest,
  options: { readonly preview: boolean },
): Promise<EditOrderResult> {
  let response;

  try {
    response = options.preview
      ? await backendClient().POST('/v1/admin/orders/{orderId}/edit/preview', {
          params: { path: { orderId } },
          body,
          headers: sessionHeaders(sessionMaterial),
        })
      : await backendClient().POST('/v1/admin/orders/{orderId}/edit', {
          params: { path: { orderId } },
          body,
          headers: sessionHeaders(sessionMaterial),
        });
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw orderEditFailure(response.response.status, response.error);
  }

  return response.data;
}
