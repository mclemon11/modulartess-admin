/**
 * Configuración server-only del backend.
 *
 * Módulo puro: no importa `server-only` porque no toca ninguna API de servidor, y así puede
 * comprobarse sin arrancar Next.js. Ninguna de estas variables lleva prefijo `NEXT_PUBLIC_`, de
 * modo que Next.js no las sustituye en el bundle del cliente y el navegador no puede leerlas.
 *
 * La validación es estricta a propósito: una URL con ruta, consulta, fragmento o credenciales
 * embebidas, o una audiencia que no sea el origen canónico, se rechazan en lugar de normalizarse
 * en silencio. Una audiencia equivocada produce un identity token que el backend rechaza, y ese
 * fallo es mucho más difícil de diagnosticar que un error de arranque.
 */

export const BACKEND_ENV_VAR_NAMES = {
  baseUrl: 'MODULARTESS_BACKEND_URL',
  authMode: 'MODULARTESS_BACKEND_AUTH_MODE',
  audience: 'MODULARTESS_BACKEND_AUDIENCE',
  adminOrigin: 'MODULARTESS_ADMIN_ORIGIN',
} as const;

export type BackendEnvKey = keyof typeof BACKEND_ENV_VAR_NAMES;

/** `none` para desarrollo local; `google-oidc` para Cloud Run detrás de IAM. */
export const BACKEND_AUTH_MODES = ['none', 'google-oidc'] as const;

export type BackendAuthMode = (typeof BACKEND_AUTH_MODES)[number];

export type BackendConfig = {
  /** Origen del backend, ya canonizado y sin barra final. */
  readonly baseUrl: string;
  readonly authMode: BackendAuthMode;
  /** Solo presente —y solo obligatoria— en modo `google-oidc`. */
  readonly audience: string | null;
  /** Origen exacto autorizado para las peticiones mutantes del BFF. */
  readonly adminOrigin: string;
};

export type BackendConfigResult =
  | { readonly ok: true; readonly config: BackendConfig }
  | { readonly ok: false; readonly reason: string };

export type RawBackendEnv = Readonly<Partial<Record<BackendEnvKey, string | undefined>>>;

/**
 * Política de esquema aplicable a un origen.
 *
 * `https-only` no admite `http` en ningún caso. `https-or-loopback` lo admite **solo** para
 * loopback (`localhost`, `127.0.0.1`, `::1`), que es el único sitio donde el tráfico en claro no
 * sale de la máquina. Un host remoto por `http` se rechaza siempre: enviaría la sesión
 * administrativa sin cifrar.
 */
export type OriginPolicy = 'https-only' | 'https-or-loopback';

/**
 * Hosts de loopback. `URL` normaliza el IPv6 entre corchetes (`http://[::1]` → `[::1]`), así que
 * se aceptan las dos formas.
 */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

/**
 * Canoniza un origen. Devuelve `null` si el valor no es exactamente un origen admisible.
 *
 * Se rechazan: la ruta, la consulta, el fragmento, las credenciales embebidas, los esquemas que no
 * sean `http`/`https`, el host vacío y `http` fuera de loopback según la política.
 */
export function parseOrigin(value: string, policy: OriginPolicy): string | null {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null;
  }

  // Credenciales embebidas: no forman parte de un origen.
  if (url.username !== '' || url.password !== '') {
    return null;
  }

  // Ruta, consulta o fragmento: no es un origen, es una URL.
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    return null;
  }

  // `new URL` acepta algunos casos límite con host vacío.
  if (url.hostname === '') {
    return null;
  }

  if (url.protocol === 'http:' && (policy === 'https-only' || !isLoopbackHost(url.hostname))) {
    return null;
  }

  return url.origin;
}

export type AdminOriginResult =
  | { readonly ok: true; readonly adminOrigin: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Lee y valida **solo** `MODULARTESS_ADMIN_ORIGIN`.
 *
 * Está separada de `readBackendConfig` a propósito: el cierre de sesión local no llama al backend,
 * así que no debe fallar porque falten la URL, la audiencia o el modo de autenticación. Lo único
 * que necesita para validar `Origin` es este valor.
 *
 * Exige `https`, salvo loopback para desarrollo local.
 */
export function readAdminOrigin(
  raw: Readonly<{ adminOrigin?: string | undefined }>,
): AdminOriginResult {
  const value = raw.adminOrigin?.trim() ?? '';

  if (value.length === 0) {
    return {
      ok: false,
      reason: `falta la variable de entorno: ${BACKEND_ENV_VAR_NAMES.adminOrigin}`,
    };
  }

  const adminOrigin = parseOrigin(value, 'https-or-loopback');

  if (adminOrigin === null) {
    return {
      ok: false,
      reason: `${BACKEND_ENV_VAR_NAMES.adminOrigin} debe ser un origen HTTPS exacto (o loopback en desarrollo local), sin ruta, consulta, fragmento ni credenciales`,
    };
  }

  return { ok: true, adminOrigin };
}

/** Lee el origen autorizado desde `process.env`. Solo se ejecuta en el servidor. */
export function readAdminOriginFromEnv(): AdminOriginResult {
  return readAdminOrigin({ adminOrigin: process.env.MODULARTESS_ADMIN_ORIGIN });
}

function readTrimmed(raw: RawBackendEnv, key: BackendEnvKey): string {
  return raw[key]?.trim() ?? '';
}

/**
 * Valida el entorno completo del backend.
 *
 * Reglas de esquema:
 *
 * - `google-oidc`: la URL y la audiencia deben ser **orígenes HTTPS canónicos** y, tras
 *   canonizarlos, **exactamente iguales**. Una audiencia que no coincida con el servicio invocado
 *   produce un identity token que Cloud Run rechaza, y ese fallo es difícil de diagnosticar.
 * - `none`: la URL admite `http` **solo** para loopback. Cualquier host remoto exige `https`.
 */
export function readBackendConfig(raw: RawBackendEnv): BackendConfigResult {
  const rawBaseUrl = readTrimmed(raw, 'baseUrl');
  const rawAuthMode = readTrimmed(raw, 'authMode');
  const rawAudience = readTrimmed(raw, 'audience');

  const adminOriginResult = readAdminOrigin({ adminOrigin: raw.adminOrigin });

  const missing = (
    [
      ['baseUrl', rawBaseUrl],
      ['authMode', rawAuthMode],
    ] as const
  )
    .filter(([, value]) => value.length === 0)
    .map(([key]) => BACKEND_ENV_VAR_NAMES[key]);

  if (missing.length > 0) {
    return { ok: false, reason: `faltan variables de entorno: ${missing.join(', ')}` };
  }

  if (!adminOriginResult.ok) {
    return { ok: false, reason: adminOriginResult.reason };
  }

  const { adminOrigin } = adminOriginResult;

  if (!isAuthMode(rawAuthMode)) {
    return {
      ok: false,
      reason: `${BACKEND_ENV_VAR_NAMES.authMode} debe ser "none" o "google-oidc"`,
    };
  }

  if (rawAuthMode === 'none') {
    const baseUrl = parseOrigin(rawBaseUrl, 'https-or-loopback');

    if (baseUrl === null) {
      return {
        ok: false,
        reason: `${BACKEND_ENV_VAR_NAMES.baseUrl} debe ser un origen HTTPS (o loopback en modo "none"), sin ruta, consulta, fragmento ni credenciales`,
      };
    }

    // En modo `none` la audiencia es irrelevante: no se emite ningún identity token.
    return { ok: true, config: { baseUrl, authMode: 'none', audience: null, adminOrigin } };
  }

  const baseUrl = parseOrigin(rawBaseUrl, 'https-only');

  if (baseUrl === null) {
    return {
      ok: false,
      reason: `${BACKEND_ENV_VAR_NAMES.baseUrl} debe ser un origen HTTPS canónico en modo "google-oidc", sin ruta, consulta, fragmento ni credenciales`,
    };
  }

  if (rawAudience.length === 0) {
    return {
      ok: false,
      reason: `${BACKEND_ENV_VAR_NAMES.audience} es obligatoria en modo "google-oidc"`,
    };
  }

  const audience = parseOrigin(rawAudience, 'https-only');

  if (audience === null) {
    return {
      ok: false,
      reason: `${BACKEND_ENV_VAR_NAMES.audience} debe ser el origen HTTPS canónico del backend, sin ruta, consulta, fragmento ni credenciales`,
    };
  }

  if (audience !== baseUrl) {
    return {
      ok: false,
      reason: `${BACKEND_ENV_VAR_NAMES.audience} y ${BACKEND_ENV_VAR_NAMES.baseUrl} deben ser el mismo origen tras canonizarlos`,
    };
  }

  return { ok: true, config: { baseUrl, authMode: 'google-oidc', audience, adminOrigin } };
}

function isAuthMode(value: string): value is BackendAuthMode {
  return (BACKEND_AUTH_MODES as readonly string[]).includes(value);
}

/** Lee la configuración completa desde `process.env`. Solo se ejecuta en el servidor. */
export function readBackendConfigFromEnv(): BackendConfigResult {
  return readBackendConfig({
    baseUrl: process.env.MODULARTESS_BACKEND_URL,
    authMode: process.env.MODULARTESS_BACKEND_AUTH_MODE,
    audience: process.env.MODULARTESS_BACKEND_AUDIENCE,
    adminOrigin: process.env.MODULARTESS_ADMIN_ORIGIN,
  });
}
