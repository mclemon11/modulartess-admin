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
  'sku_conflict',
  'slug_conflict',
  'variant_sku_conflict',
  'variant_combination_conflict',
  'image_limit',
  'idempotency_conflict',
  'category_not_found',
  'category_archived',
  'category_name_conflict',
  'category_slug_conflict',
  'category_version_conflict',
  'category_invalid',
  'conflict_unrecognized',
  'refund_required',
  'payment_transition_invalid',
  'payment_conflict',
  'simulator_disabled',
  'integration_invalid',
  'credentials_environment_mismatch',
  'credential_prefix_invalid',
  'credentials_incomplete',
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
  /**
   * El código original del backend cuando el panel no lo reconoce. Es un identificador validado
   * con `safeErrorReference`, nunca un mensaje: sirve para diagnosticar, no para explicar.
   */
  readonly reference?: string;
};

const MESSAGES: Readonly<Record<SessionErrorCode, string>> = {
  invalid_origin: 'La petición no proviene de un origen autorizado.',
  invalid_request: 'La petición no tiene el formato esperado.',
  not_found: 'No encontramos ese recurso.',
  version_conflict:
    'Alguien modificó estos datos mientras los editabas. Recarga para ver la versión actual.',
  sku_conflict: 'Ese SKU ya está reservado, incluso si pertenece a un producto archivado.',
  slug_conflict: 'Esa URL ya está reservada, incluso si pertenece a un producto archivado.',
  variant_sku_conflict: 'Ese SKU de variante ya está reservado.',
  variant_combination_conflict: 'Ya existe una variante con esa combinación.',
  image_limit: 'El producto ya tiene el máximo de imágenes activas.',
  idempotency_conflict: 'Esa operación ya se envió con otros datos.',
  category_not_found: 'Esa categoría no existe.',
  category_archived: 'Esa categoría está archivada.',
  category_name_conflict: 'Ya existe una categoría con ese nombre.',
  category_slug_conflict: 'Ya existe una categoría con ese slug.',
  category_version_conflict: 'La categoría cambió mientras la editabas.',
  category_invalid: 'El nombre o el slug de la categoría no tienen una forma válida.',
  conflict_unrecognized: 'El backend rechazó la operación por un conflicto.',
  refund_required:
    'Este pedido ya está pagado y cancelarlo exigiría devolver el dinero. El flujo de reembolso todavía no está disponible.',
  payment_transition_invalid:
    'Ese resultado no cabe desde el estado actual del pago. Recarga el pedido para ver en qué punto está.',
  payment_conflict:
    'Ese intento de pago ya se registró con otro resultado. No se aplicó nada nuevo.',
  simulator_disabled: 'El simulador de pagos no está habilitado en este despliegue.',
  integration_invalid:
    'La configuración no cumple lo que exige la pasarela. Revisa los campos marcados.',
  credentials_environment_mismatch:
    'Estas llaves son del otro ambiente. Cambia el ambiente y vuelve a guardarlas.',
  credential_prefix_invalid:
    'Estos valores no parecen llaves de Wompi. Cópialos de nuevo desde Wompi.',
  credentials_incomplete: 'Faltan llaves. Hacen falta las cuatro del ambiente seleccionado.',
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
  sku_conflict: 409,
  slug_conflict: 409,
  variant_sku_conflict: 409,
  variant_combination_conflict: 409,
  image_limit: 409,
  idempotency_conflict: 409,
  category_not_found: 404,
  category_archived: 409,
  category_name_conflict: 409,
  category_slug_conflict: 409,
  category_version_conflict: 409,
  category_invalid: 400,
  conflict_unrecognized: 409,
  refund_required: 409,
  payment_transition_invalid: 409,
  payment_conflict: 409,
  simulator_disabled: 404,
  integration_invalid: 400,
  credentials_environment_mismatch: 400,
  credential_prefix_invalid: 400,
  credentials_incomplete: 400,
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

export function sessionErrorBody(
  code: SessionErrorCode,
  reference: string | null = null,
): SessionErrorBody {
  return reference === null
    ? { code, message: MESSAGES[code] }
    : { code, message: MESSAGES[code], reference };
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
    case 'backend_product_sku_conflict':
      return 'sku_conflict';
    case 'backend_product_slug_conflict':
      return 'slug_conflict';
    case 'backend_product_variant_sku_conflict':
      return 'variant_sku_conflict';
    case 'backend_product_variant_combination_conflict':
      return 'variant_combination_conflict';
    case 'backend_product_image_limit':
      return 'image_limit';
    case 'backend_idempotency_conflict':
      return 'idempotency_conflict';
    case 'backend_product_category_not_found':
      return 'category_not_found';
    case 'backend_product_category_archived':
      return 'category_archived';
    case 'backend_product_category_name_conflict':
      return 'category_name_conflict';
    case 'backend_product_category_slug_conflict':
      return 'category_slug_conflict';
    case 'backend_product_category_version_conflict':
      return 'category_version_conflict';
    case 'backend_product_category_invalid':
      return 'category_invalid';
    case 'backend_conflict_unrecognized':
      return 'conflict_unrecognized';
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
    case 'backend_wompi_credentials_environment_mismatch':
      return 'credentials_environment_mismatch';
    case 'backend_wompi_credential_prefix_invalid':
      return 'credential_prefix_invalid';
    case 'backend_wompi_credentials_incomplete':
      return 'credentials_incomplete';
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
