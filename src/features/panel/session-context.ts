import 'server-only';

/**
 * Sesión administrativa resuelta para una petición del panel.
 *
 * Centraliza el paso que repiten todas las pantallas protegidas: leer la cookie `__Host-` en el
 * servidor y obtener el principal verificado. Ni la cookie ni el material salen de aquí hacia el
 * cliente; lo que se pasa a los componentes es el rol, que es lo único que la interfaz necesita.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { SESSION_COOKIE_NAME } from '@/features/session/session-cookie';
import { verifyAdminSession } from '@/lib/api/backend-client';
import { isBackendFailure } from '@/lib/api/errors';

export type PanelSession = {
  /** Material opaco de la cookie. **Solo servidor**: se usa para llamar al backend. */
  readonly sessionMaterial: string;
  readonly role: string;
};

export type PanelSessionResult =
  | { readonly kind: 'active'; readonly session: PanelSession }
  /** La cookie ya no vale: hay que limpiarla desde una frontera cliente antes de ir al login. */
  | { readonly kind: 'invalid' }
  /** El backend no responde: la sesión puede seguir siendo buena, no se expulsa a nadie. */
  | { readonly kind: 'unavailable' };

/** Lee la cookie sin verificarla. Devuelve `null` si no está. */
export async function readSessionMaterial(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(SESSION_COOKIE_NAME)?.value;

  return value === undefined || value.length === 0 ? null : value;
}

/**
 * Resuelve la sesión contra el backend.
 *
 * Sin cookie redirige directamente: no hay nada que limpiar. Con cookie inválida **no** redirige,
 * porque borrarla es una mutación y esto es un Server Component; devuelve `invalid` para que la
 * página delegue en la frontera cliente.
 */
export async function resolvePanelSession(): Promise<PanelSessionResult> {
  const sessionMaterial = await readSessionMaterial();

  if (sessionMaterial === null) {
    redirect('/iniciar-sesion');
  }

  try {
    const principal = await verifyAdminSession(sessionMaterial);

    return { kind: 'active', session: { sessionMaterial, role: principal.role } };
  } catch (error) {
    if (isBackendFailure(error)) {
      return error.code === 'backend_unauthorized' || error.code === 'backend_forbidden'
        ? { kind: 'invalid' }
        : { kind: 'unavailable' };
    }

    throw error;
  }
}
