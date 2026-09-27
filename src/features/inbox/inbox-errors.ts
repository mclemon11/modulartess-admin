/**
 * Fallos de la bandeja, uno a uno, en español. Se traduce desde el código, nunca desde el mensaje.
 */

const MESSAGES: Readonly<Record<string, string>> = {
  invalid_request: 'Revisa los datos: el backend los rechazó por no cumplir el contrato.',
  invalid_origin: 'La petición no proviene de un origen autorizado.',
  session_required: 'Tu sesión terminó. Vuelve a iniciar sesión.',
  admin_role_required: 'Tu rol no permite esta acción en la bandeja.',
  not_found: 'Esa conversación, pedido o adjunto no existe.',
  version_conflict:
    'La conversación cambió mientras la mirabas. Recarga para ver la versión actual.',
  conversation_state_conflict:
    'Esa acción no aplica a la conversación en su estado actual. Recarga para ver cómo está.',
  idempotency_conflict: 'Esa respuesta ya se envió con otro texto. No se mandó nada nuevo.',
  attachment_unavailable:
    'Ese adjunto no se puede descargar: se rechazó, está retenido o aún no se guardó.',
  reply_unavailable: 'Las respuestas están apagadas en este despliegue. No se envió nada.',
  too_many_requests: 'Demasiadas peticiones seguidas. Espera unos segundos.',
  service_unavailable:
    'El servicio no respondió. Si era una respuesta, recarga antes de repetirla: pudo haberse encolado.',
  internal_error: 'No pudimos completar la operación. Inténtalo de nuevo en unos momentos.',
};

export const GENERIC_INBOX_MESSAGE =
  'No pudimos completar la operación. Inténtalo de nuevo en unos momentos.';

export function describeInboxFailure(code: string): string {
  return MESSAGES[code] ?? GENERIC_INBOX_MESSAGE;
}

/** Solo los fallos de mirar una pantalla desfasada se arreglan recargando. */
export function offersReload(code: string): boolean {
  return code === 'version_conflict' || code === 'conversation_state_conflict';
}
