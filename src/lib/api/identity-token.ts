import 'server-only';

/**
 * Identity tokens de IAM para invocar Cloud Run.
 *
 * `Authorization` está **reservado a IAM**: transporta solo este identity token, obtenido con la
 * identidad de ejecución del propio servicio Next.js. La sesión de la persona nunca viaja aquí;
 * va en el encabezado interno `x-modulartess-admin-session`.
 *
 * El `IdTokenClient` se cachea **por audiencia**, porque construirlo consulta el servidor de
 * metadatos. Se cachea la promesa, no el cliente resuelto, para que dos llamadas simultáneas
 * compartan una sola construcción; si falla, la promesa se retira de la caché para que el
 * siguiente intento vuelva a probar en lugar de quedar atrapado en el error.
 *
 * Nada de lo que ocurre aquí se registra: ni la audiencia, ni el token, ni el error original.
 */

import { GoogleAuth, type IdTokenClient } from 'google-auth-library';

import { BackendFailure } from './errors';

const clientsByAudience = new Map<string, Promise<IdTokenClient>>();

let auth: GoogleAuth | null = null;

function sharedAuth(): GoogleAuth {
  auth ??= new GoogleAuth();

  return auth;
}

/** Vacía la caché. Existe para las pruebas y para no arrastrar estado entre ellas. */
export function resetIdentityTokenCache(): void {
  clientsByAudience.clear();
  auth = null;
}

async function resolveClient(audience: string): Promise<IdTokenClient> {
  const cached = clientsByAudience.get(audience);

  if (cached !== undefined) {
    return cached;
  }

  const pending = sharedAuth().getIdTokenClient(audience);

  clientsByAudience.set(audience, pending);

  try {
    return await pending;
  } catch (error) {
    // Se retira la promesa fallida: si no, la audiencia quedaría envenenada para siempre.
    clientsByAudience.delete(audience);
    throw error;
  }
}

/**
 * Devuelve el valor completo del encabezado `Authorization` (`Bearer <identity token>`).
 *
 * Se pide a la librería en lugar de componerlo a mano para que la caducidad y la renovación del
 * token queden en su terreno.
 */
export async function getIamAuthorizationHeader(audience: string): Promise<string> {
  try {
    const client = await resolveClient(audience);
    const headers = await client.getRequestHeaders(audience);
    const authorization = headers.get('authorization');

    if (authorization === null || authorization.length === 0) {
      throw new BackendFailure('backend_misconfigured');
    }

    return authorization;
  } catch (error) {
    if (error instanceof BackendFailure) {
      throw error;
    }

    // El error original no se propaga ni se registra: puede contener la audiencia y detalles del
    // servidor de metadatos.
    throw new BackendFailure('backend_unavailable');
  }
}
