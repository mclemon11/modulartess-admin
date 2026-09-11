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
