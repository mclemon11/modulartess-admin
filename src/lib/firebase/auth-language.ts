/**
 * Idioma del SDK de Firebase Authentication.
 *
 * Firebase localiza los correos que envía (entre ellos el de verificación) según el
 * `languageCode` de la instancia de `Auth`. Si no se fija, el SDK deduce el idioma del navegador,
 * que es una fuente variable: la misma cuenta recibiría el correo en un idioma distinto según el
 * equipo desde el que se inicie sesión.
 *
 * El panel lo fija **explícitamente a español** y nunca llama a `useDeviceLanguage()`.
 *
 * Módulo puro: no importa el SDK. Solo describe la parte de `Auth` que necesita tocar, para poder
 * comprobar el comportamiento sin abrir ninguna conexión con Firebase.
 */

/** Idioma con el que Firebase envía los correos del panel. */
export const AUTH_LANGUAGE_CODE = 'es';

/** Porción de `Auth` que interviene aquí. El `Auth` real del SDK la satisface. */
export type LocalizableAuth = {
  languageCode: string | null;
};

/**
 * Fija el idioma a español. Es idempotente y sobrescribe cualquier valor previo, incluido el que
 * el SDK hubiera deducido del navegador.
 */
export function applyAdminAuthLanguage(auth: LocalizableAuth): LocalizableAuth {
  auth.languageCode = AUTH_LANGUAGE_CODE;

  return auth;
}

/** Comprueba que una instancia quedó configurada en español. */
export function hasAdminAuthLanguage(auth: LocalizableAuth): boolean {
  return auth.languageCode === AUTH_LANGUAGE_CODE;
}
