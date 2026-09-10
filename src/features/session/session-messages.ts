/**
 * Mensajes en español para los fallos del intercambio de sesión, tal como los ve la persona.
 *
 * Se traducen desde el `code` estable que devuelve el BFF. Módulo puro, sin dependencias.
 */

const MESSAGES: Readonly<Record<string, string>> = {
  admin_role_required:
    'Tu cuenta se autenticó, pero no tiene permisos administrativos en el panel.',
  admin_surface_disabled:
    'La superficie administrativa está desactivada en este despliegue. Inténtalo más tarde.',
  too_many_requests: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  service_unavailable: 'El servicio administrativo no está disponible ahora mismo.',
  session_required: 'No pudimos abrir la sesión administrativa. Vuelve a iniciar sesión.',
  invalid_origin: 'No pudimos abrir la sesión administrativa desde este origen.',
  invalid_request: 'No pudimos abrir la sesión administrativa. Vuelve a iniciar sesión.',
};

export const GENERIC_EXCHANGE_MESSAGE =
  'No pudimos abrir la sesión administrativa. Inténtalo de nuevo en unos momentos.';

/** Devuelve el mensaje del código, o el genérico si el código es desconocido. */
export function describeExchangeFailure(code: string): string {
  return MESSAGES[code] ?? GENERIC_EXCHANGE_MESSAGE;
}
