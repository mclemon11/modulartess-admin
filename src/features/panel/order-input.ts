/**
 * Validación de los cuerpos que el BFF acepta para los pedidos.
 *
 * Estrecha lo que llega del navegador antes de tocar el backend. No duplica reglas de negocio: la
 * transición válida la decide el backend, y aquí solo se comprueba que el cuerpo tenga la forma que
 * el contrato declara. Un cuerpo mal formado se rechaza con `400` sin gastar una llamada.
 *
 * Módulo puro.
 */

import type {
  CancelOrderRequest,
  SimulatePaymentRequest,
  UpdateOrderStatusRequest,
} from '@/lib/api/orders';

function record(raw: unknown): Record<string, unknown> | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

/**
 * Los siete estados del contrato.
 *
 * Se declara con el tipo generado, así que si el backend añade o quita uno, esta lista deja de
 * compilar. El panel **no** decide aquí qué transición es válida —eso lo decide el backend—: solo
 * estrecha la cadena al conjunto que el contrato admite.
 */
const STATUSES: readonly UpdateOrderStatusRequest['status'][] = [
  'pending_payment',
  'paid',
  'preparing',
  'ready_to_ship',
  'shipped',
  'delivered',
  'cancelled',
];

/** Los cinco resultados que el simulador sabe aplicar, tal y como los publica el contrato. */
const SIMULATION_EVENTS: readonly SimulatePaymentRequest['event'][] = [
  'processing',
  'approved',
  'declined',
  'expired',
  'error',
];

/** `eventId`: el contrato lo acota entre 8 y 128 caracteres. */
const EVENT_ID_MIN = 8;
const EVENT_ID_MAX = 128;

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

/**
 * Cuerpo del simulador de pago.
 *
 * Los tres campos son obligatorios, incluido `eventId`: sin él no hay idempotencia, y un reintento
 * tras un corte de red podría aplicar el resultado dos veces.
 *
 * `reasonCode` **no se acepta**. El contrato lo admite como código «stable, bounded», pero no
 * publica la lista de valores admitidos; dejar pasar una cadena libre desde un campo de texto sería
 * inventar vocabulario y acabaría guardado en el historial del pago. Mientras no exista una lista
 * cerrada aprobada, se omite.
 */
export function parsePaymentSimulation(raw: unknown): SimulatePaymentRequest | null {
  const body = record(raw);

  if (body === null) {
    return null;
  }

  const version = expectedVersion(body.expectedVersion);
  const event =
    typeof body.event === 'string' && (SIMULATION_EVENTS as readonly string[]).includes(body.event)
      ? (body.event as SimulatePaymentRequest['event'])
      : null;
  const eventId =
    typeof body.eventId === 'string' &&
    body.eventId.length >= EVENT_ID_MIN &&
    body.eventId.length <= EVENT_ID_MAX
      ? body.eventId
      : null;

  if (version === null || event === null || eventId === null) {
    return null;
  }

  return { expectedVersion: version, event, eventId };
}
