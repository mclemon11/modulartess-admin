import 'server-only';

/**
 * Bandeja de incidencias de pago. **Solo servidor.**
 *
 * Una incidencia es un evento de pago **con firma válida** cuyos datos comerciales no cuadran:
 * otro monto, otra moneda, una referencia que no conocemos, o una transacción ya asociada a otro
 * intento. No es un intento de fraude fallido —esos se rechazan antes, por firma— sino una
 * inconsistencia real entre lo que se cobró y lo que creemos haber cobrado.
 *
 * La proyección que publica el contrato lleva **códigos cerrados e identificadores técnicos y
 * nada más**: sin payload del proveedor, sin correo, sin dirección, sin método de pago, sin monto
 * recibido, sin firma y sin secretos. Este módulo no añade ni reconstruye ninguno de esos.
 */

import { backendClient } from './backend-client';
import { BackendFailure, failureCodeFromStatus, type BackendFailureCode } from './errors';
import type { components, paths } from './generated/schema';
import { ADMIN_SESSION_HEADER } from './session-material';

export type PaymentIncident = components['schemas']['PaymentIncidentDto'];
export type PaymentIncidentPage = components['schemas']['PaymentIncidentPageDto'];
export type ResolvePaymentIncidentRequest =
  components['schemas']['ResolvePaymentIncidentRequestDto'];

export type PaymentIncidentReason = PaymentIncident['reason'];
export type PaymentIncidentStatus = PaymentIncident['status'];
export type PaymentIncidentEnvironment = PaymentIncident['environment'];
export type PaymentResolutionCode = ResolvePaymentIncidentRequest['resolutionCode'];

type IncidentQuery = NonNullable<
  paths['/v1/admin/payment-incidents']['get']['parameters']['query']
>;

/** Un `404` en el listado no es «esa incidencia no existe»: un listado no es una incidencia. */
const LIST_RESOURCE = { notFound: 'backend_surface_disabled' } as const;
/** En la resolución sí: el `404` del contrato es `payment_incident_not_found`. */
const ITEM_RESOURCE = { notFound: 'backend_payment_incident_not_found' } as const;

function sessionHeaders(sessionMaterial: string): Record<string, string> {
  return { [ADMIN_SESSION_HEADER]: sessionMaterial };
}

function backendErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }

  const { code } = error as { code: unknown };

  return typeof code === 'string' ? code : null;
}

function incidentFailure(
  status: number,
  code: string | null,
  resource: { readonly notFound: BackendFailureCode },
): BackendFailure {
  if (status === 400 && code === 'payment_integration_invalid') {
    return new BackendFailure('backend_payment_integration_invalid');
  }

  if (status === 409 && code === 'payment_integration_conflict') {
    return new BackendFailure('backend_payment_integration_conflict');
  }

  if (status === 503 && code === 'payment_provider_unavailable') {
    return new BackendFailure('backend_payment_provider_unavailable');
  }

  return new BackendFailure(failureCodeFromStatus(status, resource));
}

function toFailure(error: unknown): BackendFailure {
  return error instanceof BackendFailure ? error : new BackendFailure('backend_unavailable');
}

export type PaymentIncidentFilters = {
  readonly status?: PaymentIncidentStatus | undefined;
  readonly environment?: PaymentIncidentEnvironment | undefined;
  readonly reason?: PaymentIncidentReason | undefined;
  readonly pageToken?: string | undefined;
  readonly pageSize?: number | undefined;
};

/**
 * Listado de incidencias, ordenado por última aparición.
 *
 * Exige `integrations.read`. Los filtros son los tres que publica el contrato y la paginación es
 * por cursor opaco: se avanza, no se salta a una página concreta.
 *
 * Un filtro ausente **no se manda**. El contrato dice que la ruta responde `status=open` por
 * defecto —que es la pregunta de quien abre el panel—, así que mandar una cadena vacía cambiaría
 * ese comportamiento por accidente.
 */
export async function listPaymentIncidents(
  sessionMaterial: string,
  filters: PaymentIncidentFilters = {},
): Promise<PaymentIncidentPage> {
  const query: IncidentQuery = {};

  if (filters.status !== undefined) query.status = filters.status;
  if (filters.environment !== undefined) query.environment = filters.environment;
  if (filters.reason !== undefined) query.reason = filters.reason;
  if (filters.pageToken !== undefined && filters.pageToken.length > 0) {
    query.pageToken = filters.pageToken;
  }
  if (filters.pageSize !== undefined) query.pageSize = filters.pageSize;

  let response;

  try {
    response = await backendClient().GET('/v1/admin/payment-incidents', {
      params: { query },
      headers: sessionHeaders(sessionMaterial),
    });
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw incidentFailure(
      response.response.status,
      backendErrorCode(response.error),
      LIST_RESOURCE,
    );
  }

  return response.data;
}

/**
 * Cierra una incidencia.
 *
 * Exige `integrations.manage`, que solo tiene `super_admin`: cerrar una incidencia es una
 * **afirmación sobre dinero que no cuadró**, no una tarea de bandeja.
 *
 * `expectedVersion` es obligatorio y el motivo lo dice el propio contrato: dos administradores
 * mirando la misma bandeja podrían cerrarla con razones distintas y la segunda pisaría a la
 * primera sin que nadie lo notara.
 *
 * `resolutionCode` sale de un vocabulario cerrado. **No hay campo de texto libre**, y no es una
 * omisión: una nota acabaría guardando el correo de quien pagó o un fragmento de la respuesta del
 * proveedor.
 */
export async function resolvePaymentIncident(
  sessionMaterial: string,
  incidentId: string,
  body: ResolvePaymentIncidentRequest,
): Promise<PaymentIncident> {
  let response;

  try {
    response = await backendClient().PATCH('/v1/admin/payment-incidents/{incidentId}/resolve', {
      params: { path: { incidentId } },
      body,
      headers: sessionHeaders(sessionMaterial),
    });
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw incidentFailure(
      response.response.status,
      backendErrorCode(response.error),
      ITEM_RESOURCE,
    );
  }

  return response.data;
}
