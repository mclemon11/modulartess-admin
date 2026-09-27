/**
 * Fallos de la administración de cuentas, uno a uno, en español.
 *
 * Se traduce desde el **código**, nunca desde el mensaje. Un código desconocido cae en un texto
 * genérico que no promete nada.
 */

const MESSAGES: Readonly<Record<string, string>> = {
  invalid_request: 'Revisa los datos: el correo, el nombre o el rol no tienen una forma válida.',
  invalid_origin: 'La petición no proviene de un origen autorizado.',
  session_required: 'Tu sesión terminó. Vuelve a iniciar sesión.',
  admin_role_required: 'Tu rol no puede administrar esa cuenta. No se cambió nada.',
  not_found: 'Esa cuenta ya no existe.',
  version_conflict:
    'La cuenta cambió mientras la mirabas. Recarga para ver su estado actual; no se aplicó nada.',
  idempotency_conflict: 'Esa operación ya se envió con otros datos. No se aplicó nada nuevo.',
  account_email_taken:
    'Ese correo no se puede usar: ya pertenece a una cuenta del panel o a otra identidad.',
  last_super_admin: 'Tiene que quedar al menos un super administrador activo. No se cambió nada.',
  account_self_change: 'No puedes deshabilitar tu propia cuenta ni cambiarte el rol.',
  account_state_conflict:
    'Esa acción no aplica a la cuenta en su estado actual. Recarga para ver cómo está.',
  invitation_recently_sent:
    'La invitación salió hace menos de un minuto. Espera un poco antes de reenviarla.',
  account_sync_pending:
    'El cambio quedó registrado y la cuenta ya no puede entrar, pero falta terminar de aplicarlo. Repite la misma acción.',
  too_many_requests: 'Demasiados intentos seguidos. Espera un minuto.',
  service_unavailable: 'El servicio no respondió. Inténtalo de nuevo en unos momentos.',
  internal_error: 'No pudimos completar la operación. Inténtalo de nuevo en unos momentos.',
};

export function describeUserFailure(code: string, reference?: string): string {
  const message = MESSAGES[code];

  if (message !== undefined) return message;
  if (code === 'conflict_unrecognized' && reference !== undefined) {
    return `El backend rechazó la operación (${reference}). No se aplicó nada.`;
  }

  return 'No pudimos completar la operación. No se aplicó nada nuevo.';
}

/** Solo el conflicto de versión y el estado desactualizado ofrecen recargar. */
export function offersReload(code: string): boolean {
  return code === 'version_conflict' || code === 'account_state_conflict' || code === 'not_found';
}

/**
 * ¿Se conserva la clave para reintentar?
 *
 * Sí cuando el desenlace es incierto o quedó a medias: red, 5xx y `account_sync_pending`. Repetir
 * con la misma clave termina la operación en el backend en lugar de lanzar otra.
 */
export function keepsKey(code: string): boolean {
  return (
    code === 'service_unavailable' ||
    code === 'internal_error' ||
    code === 'account_sync_pending' ||
    code === 'too_many_requests'
  );
}
