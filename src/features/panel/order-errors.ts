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
 */

export const ORDER_MESSAGES: Readonly<Record<string, string>> = {
  invalid_request: 'Revisa los datos: el backend los rechazó por no cumplir el contrato.',
  session_required: 'Tu sesión administrativa caducó. Vuelve a iniciar sesión.',
  admin_role_required: 'Tu rol no permite esta acción.',
  not_found: 'Ese pedido ya no existe.',
  version_conflict: 'El pedido cambió mientras lo mirabas.',
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

/** ¿Este fallo se resuelve recargando? Solo el conflicto de versión. */
export function offersReload(code: string): boolean {
  return code === 'version_conflict';
}
