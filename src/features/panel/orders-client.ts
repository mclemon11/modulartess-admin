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

import type { AdminOrder, OrderShipmentInput } from '@/lib/api/orders';

export type OrderMutationResult =
  | { readonly ok: true; readonly data: AdminOrder }
  | {
      readonly ok: false;
      readonly code: string;
      /**
       * La petición pudo haberse aplicado.
       *
       * Un corte de red o un fallo sin cuerpo legible no dicen que la operación no ocurriera: dicen
       * que no se supo. Quien llama tiene que distinguirlo, porque afirmar «falló» sobre algo que
       * sí se aplicó lleva a repetirlo, y en un pago eso importa. Un rechazo con código del
       * contrato —400, 401, 403, 404, 409— sí es definitivo.
       */
      readonly ambiguous: boolean;
    };

/** Códigos del BFF que no permiten concluir si la operación llegó a aplicarse. */
function isAmbiguous(code: string): boolean {
  return code === 'service_unavailable' || code === 'internal_error';
}

function failed(code: string): OrderMutationResult {
  return { ok: false, code, ambiguous: isAmbiguous(code) };
}

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
    // La petición salió y nunca se supo qué pasó con ella.
    return failed('service_unavailable');
  }

  if (response.status === 200) {
    try {
      return { ok: true, data: (await response.json()) as AdminOrder };
    } catch {
      return failed('internal_error');
    }
  }

  try {
    const payload: unknown = await response.json();

    if (typeof payload === 'object' && payload !== null && 'code' in payload) {
      const { code } = payload as { code: unknown };

      if (typeof code === 'string' && code.length > 0) {
        return failed(code);
      }
    }
  } catch {
    // Cuerpo ilegible: cae al código genérico.
  }

  return failed('internal_error');
}

export function changeOrderStatus(
  orderId: string,
  status: string,
  expectedVersion: number,
  shipment?: OrderShipmentInput,
): Promise<OrderMutationResult> {
  return post(`/api/admin/orders/${encodeURIComponent(orderId)}/status`, {
    expectedVersion,
    status,
    ...(shipment === undefined ? {} : { shipment }),
  });
}

export function cancelOrder(
  orderId: string,
  expectedVersion: number,
): Promise<OrderMutationResult> {
  return post(`/api/admin/orders/${encodeURIComponent(orderId)}/cancel`, { expectedVersion });
}

/**
 * Aplica un resultado de pago simulado.
 *
 * `eventId` lo elige quien llama y **se reutiliza** si hay que reintentar exactamente la misma
 * operación: el contrato dice que repetir el mismo `eventId` con el mismo resultado no cambia nada
 * y no manda un segundo correo, mientras que reutilizarlo con otro resultado es un conflicto. Por
 * eso no se genera aquí: esta función no sabe si es el primer intento o el segundo.
 */
export function simulateOrderPayment(
  orderId: string,
  event: string,
  expectedVersion: number,
  eventId: string,
): Promise<OrderMutationResult> {
  return post(`/api/admin/orders/${encodeURIComponent(orderId)}/payment-simulation`, {
    event,
    expectedVersion,
    eventId,
  });
}

/**
 * Resultado del recordatorio manual, tal como lo publica el contrato.
 *
 * `already_queued` no es un error: ya existía el recordatorio de esta versión del pedido y el
 * backend no escribió nada.
 */
export type StatusReminderResult =
  | {
      readonly ok: true;
      readonly status: 'queued' | 'already_queued';
      /** Aviso del outbox al que seguir. No se enseña: sirve para buscarlo en la ficha. */
      readonly notificationId: string;
    }
  | { readonly ok: false; readonly code: string; readonly ambiguous: boolean };

/**
 * Pide al BFF el recordatorio manual. Solo viaja `expectedVersion`: ni destinatario, ni texto, ni
 * estado. El navegador nunca llama al backend.
 */
export async function sendStatusReminder(
  orderId: string,
  expectedVersion: number,
): Promise<StatusReminderResult> {
  let response: Response;

  try {
    response = await fetch(
      `/api/admin/orders/${encodeURIComponent(orderId)}/notifications/status-reminder`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedVersion }),
        credentials: 'same-origin',
        cache: 'no-store',
      },
    );
  } catch {
    return { ok: false, code: 'service_unavailable', ambiguous: true };
  }

  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    // Cuerpo ilegible: se decide abajo.
  }

  if (response.status === 200) {
    const body =
      typeof payload === 'object' && payload !== null
        ? (payload as { status?: unknown; notificationId?: unknown })
        : {};
    const status = body.status;
    const notificationId = body.notificationId;

    return (status === 'queued' || status === 'already_queued') &&
      typeof notificationId === 'string' &&
      notificationId.length > 0
      ? { ok: true, status, notificationId }
      : { ok: false, code: 'internal_error', ambiguous: true };
  }

  const code =
    typeof payload === 'object' && payload !== null && 'code' in payload
      ? (payload as { code: unknown }).code
      : null;
  const failure = typeof code === 'string' && code.length > 0 ? code : 'internal_error';

  return { ok: false, code: failure, ambiguous: isAmbiguous(failure) };
}

/**
 * Vuelve a leer la ficha del pedido desde el BFF, para pintar el aviso recién encolado.
 *
 * `null` si no se pudo: quien llama recurre a refrescar la página.
 */
export async function fetchOrder(orderId: string): Promise<AdminOrder | null> {
  try {
    const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    });

    return response.status === 200 ? ((await response.json()) as AdminOrder) : null;
  } catch {
    return null;
  }
}
