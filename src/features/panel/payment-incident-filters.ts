/**
 * Los filtros de la bandeja de incidencias, leídos de la URL.
 *
 * La URL es el estado: los filtros se pueden enlazar, el botón Atrás funciona y «Actualizar»
 * recarga exactamente lo que se estaba mirando. No hay estado de React de por medio.
 *
 * Lo que este módulo hace es **estrechar**, no interpretar. Un valor que el contrato no publica no
 * viaja: el backend lo rechazaría con un `400`, y una URL escrita a mano no debería romper la
 * pantalla ni gastar una llamada.
 *
 * Módulo puro.
 */

import type {
  PaymentIncidentEnvironment,
  PaymentIncidentReason,
  PaymentIncidentStatus,
} from '@/lib/api/payment-incidents';

const STATUSES: readonly PaymentIncidentStatus[] = ['open', 'resolved'];
const ENVIRONMENTS: readonly PaymentIncidentEnvironment[] = ['sandbox', 'production'];
const REASONS: readonly PaymentIncidentReason[] = [
  'reference_unknown',
  'provider_mismatch',
  'environment_mismatch',
  'currency_mismatch',
  'amount_mismatch',
  'attempt_bound_to_other_transaction',
  'transaction_bound_to_other_attempt',
  'order_unknown',
  'live_disabled',
];

/**
 * Un parámetro puede llegar repetido. Se conserva **el primero** y se descarta el resto: elegir el
 * último dejaría que la cola de un enlace manipulado ganara sobre lo que se escribió delante.
 */
function firstValue(value: string | readonly string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : (value as string | undefined);
}

function oneOf<T extends string>(raw: string | undefined, allowed: readonly T[]): T | undefined {
  return raw !== undefined && (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined;
}

export type IncidentFilters = {
  readonly status: PaymentIncidentStatus | undefined;
  readonly environment: PaymentIncidentEnvironment | undefined;
  readonly reason: PaymentIncidentReason | undefined;
  readonly pageToken: string | undefined;
};

/**
 * Traduce los parámetros de la URL a los filtros del contrato.
 *
 * `status` ausente se queda **ausente**, no se fuerza a `open`: el contrato ya responde `open` por
 * defecto —que es la pregunta de quien abre el panel— y mandarlo de forma explícita duplicaría esa
 * decisión en dos sitios que podrían separarse.
 */
export function readIncidentFilters(
  params: Readonly<Record<string, string | readonly string[] | undefined>>,
): IncidentFilters {
  const pageToken = firstValue(params.pageToken);

  return {
    status: oneOf(firstValue(params.status), STATUSES),
    environment: oneOf(firstValue(params.environment), ENVIRONMENTS),
    reason: oneOf(firstValue(params.reason), REASONS),
    pageToken: pageToken !== undefined && pageToken.length > 0 ? pageToken : undefined,
  };
}
