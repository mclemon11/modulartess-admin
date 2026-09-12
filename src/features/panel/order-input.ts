/**
 * Validación de los cuerpos que el BFF acepta para los pedidos.
 *
 * Estrecha lo que llega del navegador antes de tocar el backend. No duplica reglas de negocio: la
 * transición válida la decide el backend, y aquí solo se comprueba que el cuerpo tenga la forma que
 * el contrato declara. Un cuerpo mal formado se rechaza con `400` sin gastar una llamada.
 *
 * Módulo puro.
 */

import type { CancelOrderRequest, UpdateOrderStatusRequest } from '@/lib/api/orders';

function record(raw: unknown): Record<string, unknown> | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

/**
 * Los seis estados del contrato.
 *
 * Se declara con el tipo generado, así que si el backend añade o quita uno, esta lista deja de
 * compilar. El panel **no** decide aquí qué transición es válida —eso lo decide el backend—: solo
 * estrecha la cadena al conjunto que el contrato admite.
 */
const STATUSES: readonly UpdateOrderStatusRequest['status'][] = [
  'pending_payment',
  'paid',
  'preparing',
  'shipped',
  'delivered',
  'cancelled',
];

function orderStatus(raw: unknown): UpdateOrderStatusRequest['status'] | null {
  return typeof raw === 'string' && (STATUSES as readonly string[]).includes(raw)
    ? (raw as UpdateOrderStatusRequest['status'])
    : null;
}

/** `expectedVersion` es obligatorio en las dos mutaciones: entero mayor o igual que uno. */
function expectedVersion(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 ? raw : null;
}

export function parseOrderStatusChange(raw: unknown): UpdateOrderStatusRequest | null {
  const body = record(raw);

  if (body === null) {
    return null;
  }

  const version = expectedVersion(body.expectedVersion);
  const status = orderStatus(body.status);

  if (version === null || status === null) {
    return null;
  }

  return { expectedVersion: version, status };
}

export function parseOrderCancel(raw: unknown): CancelOrderRequest | null {
  const body = record(raw);

  if (body === null) {
    return null;
  }

  const version = expectedVersion(body.expectedVersion);

  return version === null ? null : { expectedVersion: version };
}
