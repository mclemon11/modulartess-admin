/**
 * Cierre de sesión: la decisión, aislada de la interfaz.
 *
 * La garantía que importa —**no se navega al login hasta que el BFF confirma el `204`**— se
 * comprueba aquí, sin renderizar nada. Navegar antes dejaría a la persona en el formulario con la
 * cookie todavía viva: el siguiente acceso a `/panel` volvería a entrar, y el cierre habría sido
 * una mentira.
 *
 * Módulo puro salvo por las dependencias que recibe. No registra nada.
 */

import type { LogoutOutcome } from './exchange-session';

export const LOGOUT_NETWORK_MESSAGE =
  'No pudimos cerrar la sesión porque no hay conexión con el servicio. Inténtalo de nuevo.';

export const LOGOUT_UNEXPECTED_MESSAGE =
  'No pudimos cerrar la sesión. Inténtalo de nuevo en unos momentos.';

export type LogoutFlowResult =
  { readonly ok: true } | { readonly ok: false; readonly message: string };

export type LogoutFlowDeps = {
  /** Pide al BFF el borrado de la cookie. */
  readonly end: () => Promise<LogoutOutcome>;
  /** Se invoca **solo** tras un `204` confirmado. */
  readonly navigate: () => void;
};

/** Razón de un cierre fallido, extraída del resultado cerrado de `endAdminSession`. */
export type LogoutFailureReason = Extract<LogoutOutcome, { ok: false }>['reason'];

export function describeLogoutFailure(reason: LogoutFailureReason): string {
  return reason === 'network' ? LOGOUT_NETWORK_MESSAGE : LOGOUT_UNEXPECTED_MESSAGE;
}

/**
 * Ejecuta el cierre de sesión.
 *
 * Devuelve un resultado cerrado en lugar de lanzar, para que quien llame pueda reactivar el botón
 * y permitir un reintento explícito.
 */
export async function runLogout(deps: LogoutFlowDeps): Promise<LogoutFlowResult> {
  let outcome: LogoutOutcome;

  try {
    outcome = await deps.end();
  } catch {
    // `endAdminSession` no debería lanzar, pero un fallo suyo no puede convertirse en una
    // navegación con la sesión todavía abierta.
    return { ok: false, message: LOGOUT_UNEXPECTED_MESSAGE };
  }

  if (!outcome.ok) {
    return { ok: false, message: describeLogoutFailure(outcome.reason) };
  }

  deps.navigate();

  return { ok: true };
}
