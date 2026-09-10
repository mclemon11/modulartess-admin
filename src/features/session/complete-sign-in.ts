/**
 * Cierre del inicio de sesión de una cuenta verificada.
 *
 * Se aísla del componente para poder comprobar sin renderizar nada, y sin Firebase real, las dos
 * cosas que importan:
 *
 * 1. El cierre de la sesión cliente se **intenta siempre**, salga bien o mal el canje.
 * 2. El resultado dice **si ese cierre se confirmó**. Ese dato no es informativo: decide si basta
 *    con una navegación SPA o hace falta una navegación completa que destruya el documento.
 *
 * Lo segundo es la corrección de un error anterior. `inMemoryPersistence` vive mientras viva el
 * documento, así que un `signOut` fallido dejaba a Firebase autenticado en la misma pestaña
 * mientras el panel navegaba con el enrutador. Un fallo de `signOut` **no es inocuo**.
 */

import type { ExchangeOutcome } from './exchange-session';

export type CompleteSignInDeps = {
  /** Obtiene un ID token reciente. El contrato exige un inicio de sesión de menos de 300 s. */
  readonly getIdToken: () => Promise<string>;
  /** Canjea el ID token contra el BFF del panel. */
  readonly exchange: (idToken: string) => Promise<ExchangeOutcome>;
  /** Cierra la sesión cliente de Firebase. Devuelve `true` solo si el cierre se confirmó. */
  readonly closeSession: () => Promise<boolean>;
};

export type CompleteSignInResult = (
  { readonly ok: true } | { readonly ok: false; readonly code: string }
) & {
  /** `false` obliga a una navegación completa: el SDK puede seguir autenticado. */
  readonly clientSessionClosed: boolean;
};

/** Un `closeSession` que lanza cuenta como cierre no confirmado, nunca como éxito. */
async function attemptClose(close: () => Promise<boolean>): Promise<boolean> {
  try {
    return await close();
  } catch {
    // El error no se registra: podría llevar el correo de la cuenta.
    return false;
  }
}

export async function completeSignIn(deps: CompleteSignInDeps): Promise<CompleteSignInResult> {
  let outcome: ExchangeOutcome;

  try {
    const idToken = await deps.getIdToken();

    outcome = await deps.exchange(idToken);
  } catch {
    // Ni el error de Firebase ni el de red se propagan ni se registran.
    outcome = { ok: false, code: 'internal_error' };
  }

  // Se intenta pase lo que pase con el canje, y **después** de él: el ID token debía seguir
  // sirviendo mientras se canjeaba.
  const clientSessionClosed = await attemptClose(deps.closeSession);

  return outcome.ok
    ? { ok: true, clientSessionClosed }
    : { ok: false, code: outcome.code, clientSessionClosed };
}
