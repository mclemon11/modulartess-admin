/**
 * Llamadas del navegador al BFF del panel.
 *
 * Este módulo sí corre en el navegador, y por eso **solo** conoce la ruta local del BFF. No conoce
 * la URL del backend, no tiene identidad IAM y no puede leer la cookie que el BFF escribe.
 *
 * Los dos resultados son **cerrados**. El éxito se decide por el estado HTTP **exacto** que el
 * contrato del BFF define, no por `response.ok`: ese rango incluye 200, 202 o 205, que en estas
 * rutas significarían que algo se comportó de forma distinta a la esperada. Tratar un 200 como
 * sesión creada dejaría al panel navegando sin cookie.
 *
 * No se registra nada: ni el cuerpo, ni el ID token, ni el estado, ni ningún detalle interno.
 */

/** Ruta del BFF. El navegador nunca llama al backend directamente. */
export const SESSION_ENDPOINT = '/api/admin/auth/session';

/** Estado exacto de un canje correcto, según el contrato del BFF. */
export const SESSION_CREATED_STATUS = 201;

/** Estado exacto de un cierre de sesión correcto. */
export const SESSION_DELETED_STATUS = 204;

export type ExchangeOutcome = { readonly ok: true } | { readonly ok: false; readonly code: string };

/** Lee el `code` estable de una respuesta de error. Devuelve `null` si no hay uno utilizable. */
async function readStableCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();

    if (typeof body === 'object' && body !== null && 'code' in body) {
      const { code } = body as { code: unknown };

      if (typeof code === 'string' && code.length > 0) {
        return code;
      }
    }
  } catch {
    // Cuerpo ilegible o ausente: se cae al código genérico.
  }

  return null;
}

/**
 * Canjea el ID token por una sesión administrativa.
 *
 * Solo un `201` exacto cuenta como éxito. Cualquier otro 2xx se considera un estado inesperado.
 */
export async function exchangeIdTokenForSession(idToken: string): Promise<ExchangeOutcome> {
  let response: Response;

  try {
    response = await fetch(SESSION_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken }),
      // La cookie `__Host-` es del mismo origen; no hace falta relajar nada.
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    return { ok: false, code: 'service_unavailable' };
  }

  if (response.status === SESSION_CREATED_STATUS) {
    return { ok: true };
  }

  // Un 2xx que no sea 201 no trae el error estable y tampoco garantiza la cookie.
  if (response.status >= 200 && response.status < 300) {
    return { ok: false, code: 'unexpected_status' };
  }

  return { ok: false, code: (await readStableCode(response)) ?? 'internal_error' };
}

export type LogoutOutcome =
  | { readonly ok: true }
  /** La petición no llegó a completarse: red, DNS, cancelación. */
  | { readonly ok: false; readonly reason: 'network' }
  /** El BFF respondió, pero con un estado distinto de `204`. */
  | { readonly ok: false; readonly reason: 'unexpected_status' };

/**
 * Pide al BFF que borre la cookie de sesión.
 *
 * Solo un `204` exacto significa que la cookie se retiró. Un fallo **no** se ignora: el resultado
 * lo devuelve al llamante, para que no navegue al login dejando una cookie viva.
 */
export async function endAdminSession(): Promise<LogoutOutcome> {
  let response: Response;

  try {
    response = await fetch(SESSION_ENDPOINT, {
      method: 'DELETE',
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    return { ok: false, reason: 'network' };
  }

  return response.status === SESSION_DELETED_STATUS
    ? { ok: true }
    : { ok: false, reason: 'unexpected_status' };
}
