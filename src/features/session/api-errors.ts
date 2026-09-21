/**
 * Contrato de error del BFF hacia el navegador.
 *
 * Códigos y mensajes **estables en español**. No se reenvía nunca `error.message`, ni el cuerpo
 * crudo del backend, ni un detalle de Firebase o de Google: esos textos pueden llevar UID,
 * correos, la audiencia IAM o fragmentos de token, y su forma cambia sin aviso.
 *
 * Los fallos que distinguirían «no autenticado» de «sin rol» se mantienen separados a propósito:
 * en esta superficie la persona **ya** se autenticó con Firebase, así que no hay oráculo de
 * enumeración de cuentas que proteger, y saber si falta el rol es información que necesita.
 */

import type { BackendFailureCode } from '@/lib/api/errors';

export const SESSION_ERROR_CODES = [
  'invalid_origin',
  'invalid_request',
  'session_required',
  'admin_role_required',
  'admin_surface_disabled',
  'not_found',
  'version_conflict',
  'refund_required',
  'payment_transition_invalid',
  'payment_conflict',
  'simulator_disabled',
  'integration_invalid',
  'integration_conflict',
  'live_payments_not_enabled',
  'incident_not_found',
  'provider_unavailable',
  'too_many_requests',
  'service_unavailable',
  'internal_error',
] as const;

export type SessionErrorCode = (typeof SESSION_ERROR_CODES)[number];

export type SessionErrorBody = {
  readonly code: SessionErrorCode;
  readonly message: string;
};

const MESSAGES: Readonly<Record<SessionErrorCode, string>> = {
  invalid_origin: 'La petición no proviene de un origen autorizado.',
  invalid_request: 'La petición no tiene el formato esperado.',
  not_found: 'No encontramos ese recurso.',
  version_conflict:
    'Alguien modificó estos datos mientras los editabas. Recarga para ver la versión actual.',
  refund_required:
    'Este pedido ya está pagado y cancelarlo exigiría devolver el dinero. El flujo de reembolso todavía no está disponible.',
  payment_transition_invalid:
    'Ese resultado no cabe desde el estado actual del pago. Recarga el pedido para ver en qué punto está.',
  payment_conflict:
    'Ese intento de pago ya se registró con otro resultado. No se aplicó nada nuevo.',
  simulator_disabled: 'El simulador de pagos no está habilitado en este despliegue.',
  integration_invalid:
    'La configuración no cumple lo que exige la pasarela. Revisa los campos marcados.',
  integration_conflict:
    'La configuración cambió mientras la editabas. Recarga para ver la versión actual.',
  live_payments_not_enabled:
    'Los pagos reales están bloqueados en este despliegue. No es una casilla de configuración: se levanta desde la infraestructura.',
  incident_not_found: 'Esa incidencia ya no existe.',
  provider_unavailable: 'La pasarela no respondió. Inténtalo de nuevo en unos momentos.',
  session_required: 'No hay una sesión administrativa activa. Vuelve a iniciar sesión.',
  admin_role_required: 'Esta cuenta no tiene permisos administrativos.',
  admin_surface_disabled: 'La superficie administrativa no está disponible en este despliegue.',
  too_many_requests: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  service_unavailable: 'El servicio administrativo no está disponible ahora mismo.',
  internal_error: 'No pudimos completar la operación. Inténtalo de nuevo en unos momentos.',
};

const STATUSES: Readonly<Record<SessionErrorCode, number>> = {
  invalid_origin: 403,
  invalid_request: 400,
  not_found: 404,
  version_conflict: 409,
  refund_required: 409,
  payment_transition_invalid: 409,
  payment_conflict: 409,
  simulator_disabled: 404,
  integration_invalid: 400,
  integration_conflict: 409,
  live_payments_not_enabled: 409,
  incident_not_found: 404,
  provider_unavailable: 503,
  session_required: 401,
  admin_role_required: 403,
  admin_surface_disabled: 503,
  too_many_requests: 429,
  service_unavailable: 503,
  internal_error: 500,
};

export function sessionErrorBody(code: SessionErrorCode): SessionErrorBody {
  return { code, message: MESSAGES[code] };
}

export function sessionErrorStatus(code: SessionErrorCode): number {
  return STATUSES[code];
}

/** Traduce un fallo interno del cliente del backend al código que ve el navegador. */
export function sessionErrorFromBackendFailure(code: BackendFailureCode): SessionErrorCode {
  switch (code) {
    case 'backend_unauthorized':
      return 'session_required';
    case 'backend_forbidden':
      return 'admin_role_required';
    case 'backend_surface_disabled':
      return 'admin_surface_disabled';
    case 'backend_not_found':
      return 'not_found';
    case 'backend_conflict':
      return 'version_conflict';
    case 'backend_refund_required':
      return 'refund_required';
    case 'backend_payment_transition_invalid':
      return 'payment_transition_invalid';
    case 'backend_payment_conflict':
      return 'payment_conflict';
    case 'backend_simulator_disabled':
      return 'simulator_disabled';
    case 'backend_dashboard_query_invalid':
      return 'invalid_request';
    case 'backend_dashboard_unavailable':
      return 'service_unavailable';
    case 'backend_payment_integration_invalid':
      return 'integration_invalid';
    case 'backend_payment_integration_conflict':
      return 'integration_conflict';
    case 'backend_live_payments_not_enabled':
      return 'live_payments_not_enabled';
    case 'backend_payment_incident_not_found':
      return 'incident_not_found';
    case 'backend_payment_provider_unavailable':
      return 'provider_unavailable';
    case 'backend_invalid_request':
      return 'invalid_request';
    case 'backend_rate_limited':
      return 'too_many_requests';
    case 'backend_unavailable':
      return 'service_unavailable';
    case 'backend_misconfigured':
    case 'backend_contract_violation':
    case 'backend_unexpected':
      return 'internal_error';
  }
}

/** Códigos del backend que invalidan la cookie local y obligan a borrarla. */
export function shouldClearSessionCookie(code: BackendFailureCode): boolean {
  return code === 'backend_unauthorized' || code === 'backend_forbidden';
}
