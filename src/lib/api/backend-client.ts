import 'server-only';

/**
 * Cliente tipado del backend. **Solo servidor.**
 *
 * `import 'server-only'` es la barrera: si un Client Component importara este módulo —directa o
 * indirectamente— el build falla. Esa es la razón de que exista, y no un comentario pidiendo
 * cuidado.
 *
 * Los tipos vienen de `./generated/schema`, generado desde la copia comiteada del contrato
 * (`openapi/backend-v1.json`). OpenAPI es el único contrato: aquí no se inventan endpoints,
 * campos ni formas de respuesta.
 *
 * Separación de canales, que es el punto central de esta superficie:
 *
 * - `Authorization` transporta **solo** el identity token IAM de Cloud Run.
 * - `x-modulartess-admin-session` transporta **solo** la sesión de la persona.
 *
 * Nada se registra: ni el ID token, ni el material de sesión, ni la audiencia, ni el UID, ni el
 * correo, ni el cuerpo crudo de ninguna respuesta.
 */

import createClient, { type Middleware } from 'openapi-fetch';

import { readBackendConfigFromEnv, type BackendConfig } from './backend-config';
import { BackendFailure, failureCodeFromStatus } from './errors';
import type { paths } from './generated/schema';
import { getIamAuthorizationHeader } from './identity-token';
import {
  ADMIN_SESSION_HEADER,
  isUsableSessionMaterial,
  resolveSessionExpiry,
} from './session-material';

/** Corte duro por petición. Sin esto, una llamada colgada bloquearía el render de `/panel`. */
const REQUEST_TIMEOUT_MS = 8000;

export type AdminPrincipal =
  paths['/v1/admin/auth/session']['get']['responses']['200']['content']['application/json']['principal'];

export type CreatedAdminSession = {
  readonly principal: AdminPrincipal;
  readonly expiresAt: string;
  /** Material opaco para la cookie `__Host-`. **Nunca** se devuelve al navegador. */
  readonly sessionMaterial: string;
  readonly maxAgeSeconds: number;
};

function buildMiddleware(config: BackendConfig): Middleware {
  return {
    async onRequest({ request }) {
      request.headers.set('x-correlation-id', crypto.randomUUID());

      // `Authorization` se añade únicamente para IAM, y solo en modo `google-oidc`.
      if (config.authMode === 'google-oidc' && config.audience !== null) {
        request.headers.set('Authorization', await getIamAuthorizationHeader(config.audience));
      }

      return request;
    },
  };
}

function resolveConfig(): BackendConfig {
  const result = readBackendConfigFromEnv();

  if (!result.ok) {
    // El motivo no se registra ni se propaga al navegador: nombra variables de entorno.
    throw new BackendFailure('backend_misconfigured');
  }

  return result.config;
}

type BackendClient = ReturnType<typeof createClient<paths>>;

/**
 * Cliente configurado para esta petición.
 *
 * Se expone para que el módulo de catálogo reutilice exactamente la misma configuración: mismo
 * `Authorization` de IAM, mismo `x-correlation-id`, mismo `no-store` y mismo temporizador. Dos
 * clientes distintos acabarían divergiendo.
 */
export function backendClient(): BackendClient {
  return buildClient(resolveConfig());
}

function buildClient(config: BackendConfig): BackendClient {
  const client = createClient<paths>({
    baseUrl: config.baseUrl,
    // Ninguna respuesta de esta superficie es cacheable.
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  client.use(buildMiddleware(config));

  return client;
}

/**
 * Intercambia un ID token de Firebase por una sesión administrativa.
 *
 * Exige el encabezado `x-modulartess-admin-session` y un `expiresAt` válido. Si el encabezado
 * falta, viene vacío o la expiración no sirve, falla con `backend_contract_violation` y **no** se
 * crea ninguna cookie: una cookie sin material verificable sería peor que no tener sesión.
 */
export async function createAdminSession(idToken: string): Promise<CreatedAdminSession> {
  const config = resolveConfig();
  const client = buildClient(config);

  let response;

  try {
    response = await client.POST('/v1/admin/auth/session', { body: { idToken } });
  } catch (error) {
    if (error instanceof BackendFailure) {
      throw error;
    }

    // Red, DNS o temporizador. El error original no se propaga ni se registra.
    throw new BackendFailure('backend_unavailable');
  }

  if (response.error !== undefined || response.data === undefined) {
    throw new BackendFailure(failureCodeFromStatus(response.response.status));
  }

  const sessionMaterial = response.response.headers.get(ADMIN_SESSION_HEADER);

  if (!isUsableSessionMaterial(sessionMaterial)) {
    throw new BackendFailure('backend_contract_violation');
  }

  const expiry = resolveSessionExpiry(response.data.expiresAt, new Date());

  if (!expiry.ok) {
    throw new BackendFailure('backend_contract_violation');
  }

  return {
    principal: response.data.principal,
    expiresAt: expiry.expiresAt,
    sessionMaterial,
    maxAgeSeconds: expiry.maxAgeSeconds,
  };
}

/**
 * Verifica la sesión contra el backend. Se llama en **cada** lectura protegida: el backend
 * comprueba la revocación en cada llamada y es la única autoridad sobre la validez.
 *
 * No rota ni renueva nada, y no devuelve material de sesión.
 */
export async function verifyAdminSession(sessionMaterial: string): Promise<AdminPrincipal> {
  const config = resolveConfig();
  const client = buildClient(config);

  let response;

  try {
    response = await client.GET('/v1/admin/auth/session', {
      headers: { [ADMIN_SESSION_HEADER]: sessionMaterial },
    });
  } catch (error) {
    if (error instanceof BackendFailure) {
      throw error;
    }

    throw new BackendFailure('backend_unavailable');
  }

  if (response.error !== undefined || response.data === undefined) {
    throw new BackendFailure(failureCodeFromStatus(response.response.status));
  }

  return response.data.principal;
}
