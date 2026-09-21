/**
 * Mensajes en español para los fallos de pedidos, tal como los ve la persona.
 *
 * Se traducen desde el código estable del BFF. Nunca se muestra el mensaje original: puede llevar
 * identificadores internos y su forma cambia sin aviso.
 *
 * Dos códigos merecen un texto propio, y por eso el BFF los distingue:
 *
 *   - `version_conflict`: alguien movió el pedido. **No se reintenta solo**; se dice qué pasó y se
 *     ofrece recargar, porque reintentar a ciegas repetiría una transición sobre un estado que ya
 *     no es el que se vio.
 *   - `refund_required`: el pedido está pagado y cancelarlo exigiría devolver el dinero. Recargar
 *     no arregla eso, así que no se ofrece.
 *   - `payment_transition_invalid`: el resultado no cabe desde el estado actual del pago. La
 *     pantalla estaba desfasada, así que sí se ofrece recargar.
 *   - `payment_conflict`: el mismo `eventId` se usó con otro resultado. Recargar no lo arregla y
 *     repetir tampoco: el intento ya quedó registrado.
 *   - `simulator_disabled`: este despliegue no tiene el simulador encendido. No es un fallo del
 *     pedido.
 *
 * Solo se traduce lo que el contrato publica como código cerrado. Todo lo demás cae en el mensaje
 * genérico en lugar de enseñar un valor interno.
 */

import type { BackendFailureCode } from '@/lib/api/errors';

export const ORDER_MESSAGES: Readonly<Record<string, string>> = {
  invalid_request: 'Revisa los datos: el backend los rechazó por no cumplir el contrato.',
  session_required: 'Tu sesión administrativa caducó. Vuelve a iniciar sesión.',
  admin_role_required: 'Tu rol no permite esta acción.',
  not_found: 'Ese pedido ya no existe.',
  version_conflict: 'El pedido cambió mientras lo mirabas.',
  payment_transition_invalid:
    'Ese resultado no cabe desde el estado actual del pago. Recarga el pedido para ver en qué punto está.',
  payment_conflict:
    'Ese intento de pago ya se registró con otro resultado. No se aplicó nada nuevo.',
  simulator_disabled: 'El simulador de pagos no está habilitado en este despliegue.',
  integration_invalid:
    'La configuración no cumple lo que exige la pasarela. Revisa el ambiente y los prefijos de las credenciales.',
  integration_conflict:
    'La configuración cambió mientras la editabas. Recarga para ver la versión actual.',
  live_payments_not_enabled:
    'Los pagos reales están bloqueados en este despliegue. No es una casilla de configuración.',
  incident_not_found: 'Esa incidencia ya no existe.',
  provider_unavailable: 'La pasarela no respondió. Inténtalo de nuevo en unos momentos.',
  refund_required:
    'Este pedido ya está pagado y cancelarlo exigiría devolver el dinero. El flujo de reembolso todavía no está disponible.',
  invalid_origin: 'La petición no proviene de un origen autorizado.',
  admin_surface_disabled: 'La superficie administrativa no está disponible en este despliegue.',
  too_many_requests: 'Demasiadas peticiones seguidas. Espera unos segundos.',
  service_unavailable: 'El servicio de pedidos no responde ahora mismo.',
};

export const GENERIC_ORDER_MESSAGE =
  'No pudimos completar la operación. Inténtalo de nuevo en unos momentos.';

export function describeOrderFailure(code: string): string {
  return ORDER_MESSAGES[code] ?? GENERIC_ORDER_MESSAGE;
}

/**
 * ¿Este fallo se resuelve recargando?
 *
 * Los dos que vienen de mirar una pantalla desfasada. Un `payment_conflict` no: el intento ya quedó
 * registrado con otro resultado, y volver a leer no lo cambia. Un `refund_required` tampoco.
 */
export function offersReload(code: string): boolean {
  return (
    code === 'version_conflict' ||
    code === 'payment_transition_invalid' ||
    // La configuración o la incidencia cambió entre la lectura y la escritura: releer la resuelve.
    code === 'integration_conflict'
  );
}

/**
 * Traduce un fallo del cliente server-only al mensaje que se pinta en una pantalla de pedidos.
 *
 * Existe para no reutilizar el del catálogo: con aquel, un `404` de un pedido acababa diciendo «Ese
 * producto ya no existe», que es lo que se vio en el despliegue. Los dos mapas viven separados a
 * propósito, porque las dos superficies hablan de cosas distintas.
 *
 * `scope` distingue qué significa un `404`:
 *
 *   - en `detail`, el pedido no existe;
 *   - en `list`, no puede significar eso —un listado no es un pedido—, así que se lee como que ese
 *     despliegue no tiene la superficie de pedidos.
 */
export function describeOrderBackendFailure(
  code: BackendFailureCode,
  scope: 'list' | 'detail',
): string {
  switch (code) {
    case 'backend_unauthorized':
      return ORDER_MESSAGES.session_required ?? GENERIC_ORDER_MESSAGE;
    case 'backend_forbidden':
      return ORDER_MESSAGES.admin_role_required ?? GENERIC_ORDER_MESSAGE;
    case 'backend_not_found':
      return scope === 'detail'
        ? (ORDER_MESSAGES.not_found ?? GENERIC_ORDER_MESSAGE)
        : (ORDER_MESSAGES.admin_surface_disabled ?? GENERIC_ORDER_MESSAGE);
    case 'backend_surface_disabled':
      return ORDER_MESSAGES.admin_surface_disabled ?? GENERIC_ORDER_MESSAGE;
    case 'backend_conflict':
      return ORDER_MESSAGES.version_conflict ?? GENERIC_ORDER_MESSAGE;
    case 'backend_payment_transition_invalid':
      return ORDER_MESSAGES.payment_transition_invalid ?? GENERIC_ORDER_MESSAGE;
    case 'backend_payment_conflict':
      return ORDER_MESSAGES.payment_conflict ?? GENERIC_ORDER_MESSAGE;
    case 'backend_simulator_disabled':
      return ORDER_MESSAGES.simulator_disabled ?? GENERIC_ORDER_MESSAGE;
    case 'backend_invalid_request':
      return ORDER_MESSAGES.invalid_request ?? GENERIC_ORDER_MESSAGE;
    case 'backend_rate_limited':
      return ORDER_MESSAGES.too_many_requests ?? GENERIC_ORDER_MESSAGE;
    case 'backend_unavailable':
      return ORDER_MESSAGES.service_unavailable ?? GENERIC_ORDER_MESSAGE;
    default:
      return GENERIC_ORDER_MESSAGE;
  }
}
