/**
 * Lectura y validación de la configuración cliente de Firebase.
 *
 * Este módulo es puro: no importa el SDK de Firebase, no inicializa nada y no depende del
 * navegador. Solo traduce variables de entorno a una configuración válida, o informa de cuáles
 * faltan. Eso permite probarlo sin red y sin credenciales.
 *
 * Los cuatro valores son identificadores públicos del cliente Firebase, no secretos: viajan al
 * navegador por diseño. Aun así, sus valores concretos viven en `.env` o `.env.local`, que nunca
 * se comitean. Este repositorio solo declara los nombres.
 */

/** Nombres de las variables de entorno, en el orden en que se documentan en `.env.example`. */
export const FIREBASE_ENV_VAR_NAMES = {
  apiKey: 'NEXT_PUBLIC_FIREBASE_API_KEY',
  authDomain: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  projectId: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  appId: 'NEXT_PUBLIC_FIREBASE_APP_ID',
} as const;

export type FirebaseConfigKey = keyof typeof FIREBASE_ENV_VAR_NAMES;

/** Configuración mínima para Firebase Authentication. No incluye Storage ni Analytics. */
export type FirebaseClientConfig = Readonly<Record<FirebaseConfigKey, string>>;

export type RawFirebaseEnv = Readonly<Partial<Record<FirebaseConfigKey, string | undefined>>>;

export type FirebaseConfigResult =
  | { readonly ok: true; readonly config: FirebaseClientConfig }
  | { readonly ok: false; readonly missing: readonly string[] };

const CONFIG_KEYS = Object.keys(FIREBASE_ENV_VAR_NAMES) as readonly FirebaseConfigKey[];

/**
 * Valida un conjunto de valores de entorno.
 *
 * Devuelve la configuración solo cuando las cuatro variables están presentes y no están vacías.
 * En caso contrario devuelve los **nombres** de las que faltan; nunca devuelve ni registra los
 * valores recibidos.
 */
export function readFirebaseConfig(raw: RawFirebaseEnv): FirebaseConfigResult {
  const missing: string[] = [];
  const entries: Partial<Record<FirebaseConfigKey, string>> = {};

  for (const key of CONFIG_KEYS) {
    const value = raw[key]?.trim();

    if (value === undefined || value.length === 0) {
      missing.push(FIREBASE_ENV_VAR_NAMES[key]);
      continue;
    }

    entries[key] = value;
  }

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  return { ok: true, config: entries as FirebaseClientConfig };
}

/**
 * Lee la configuración desde `process.env`.
 *
 * Cada variable se accede con su nombre literal: es la única forma de que Next.js sustituya el
 * valor en el bundle del cliente. No se construyen nombres dinámicamente.
 */
export function readFirebaseConfigFromEnv(): FirebaseConfigResult {
  return readFirebaseConfig({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
}
