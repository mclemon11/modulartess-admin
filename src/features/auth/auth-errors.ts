/**
 * Traducción de errores de Firebase Authentication a mensajes en español.
 *
 * Regla de seguridad central: **ningún mensaje puede permitir enumerar cuentas**. Un correo que
 * no existe, una contraseña equivocada, un correo mal formado y una cuenta deshabilitada producen
 * exactamente el mismo texto. Quien prueba credenciales no debe poder distinguir entre «esa
 * cuenta no existe» y «esa contraseña no es la correcta».
 *
 * Módulo puro: no importa el SDK de Firebase y no registra nada. Los errores nunca se envían a
 * `console`, porque llevarían el correo introducido a los logs del navegador.
 */

/** Único mensaje para cualquier fallo de credenciales o de estado de la cuenta. */
export const GENERIC_CREDENTIALS_MESSAGE =
  'No pudimos iniciar sesión con esos datos. Revisa el correo y la contraseña e inténtalo de nuevo.';

/**
 * Firebase bloquea temporalmente al **dispositivo** tras actividad inusual. El texto se refiere al
 * dispositivo, nunca a una cuenta concreta, para no confirmar que la cuenta exista.
 */
export const RATE_LIMITED_MESSAGE =
  'Se bloquearon temporalmente los intentos desde este dispositivo. Espera unos minutos e inténtalo de nuevo.';

export const NETWORK_MESSAGE =
  'No pudimos conectar con el servicio de autenticación. Revisa tu conexión e inténtalo de nuevo.';

export const UNEXPECTED_SIGN_IN_MESSAGE =
  'No pudimos completar el inicio de sesión. Inténtalo de nuevo en unos momentos.';

export const UNEXPECTED_VERIFICATION_MESSAGE =
  'No pudimos enviar el correo de verificación. Inténtalo de nuevo en unos momentos.';

/**
 * Códigos que revelarían si una cuenta existe, si está habilitada o si la contraseña era
 * correcta. Todos comparten un único mensaje.
 */
const ENUMERATION_SENSITIVE_CODES: ReadonlySet<string> = new Set([
  'auth/invalid-credential',
  'auth/invalid-email',
  'auth/invalid-login-credentials',
  'auth/missing-email',
  'auth/missing-password',
  'auth/user-disabled',
  'auth/user-not-found',
  'auth/wrong-password',
]);

const RATE_LIMIT_CODES: ReadonlySet<string> = new Set([
  'auth/too-many-requests',
  'auth/quota-exceeded',
]);

const NETWORK_CODES: ReadonlySet<string> = new Set(['auth/network-request-failed']);

/**
 * Extrae el `code` de un `FirebaseError` sin importar el SDK.
 *
 * Se comprueba la forma del objeto en lugar de usar `instanceof`, para que este módulo siga siendo
 * puro y comprobable sin arrancar Firebase.
 */
export function extractAuthErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }

  const { code } = error as { code: unknown };

  return typeof code === 'string' ? code : null;
}

/** Mensaje mostrado tras un intento fallido de `signInWithEmailAndPassword`. */
export function describeSignInError(error: unknown): string {
  const code = extractAuthErrorCode(error);

  if (code === null) {
    return UNEXPECTED_SIGN_IN_MESSAGE;
  }

  if (ENUMERATION_SENSITIVE_CODES.has(code)) {
    return GENERIC_CREDENTIALS_MESSAGE;
  }

  if (RATE_LIMIT_CODES.has(code)) {
    return RATE_LIMITED_MESSAGE;
  }

  if (NETWORK_CODES.has(code)) {
    return NETWORK_MESSAGE;
  }

  return UNEXPECTED_SIGN_IN_MESSAGE;
}

/**
 * Mensaje mostrado tras un intento fallido de `sendEmailVerification`.
 *
 * Aquí la persona ya se autenticó, pero el texto sigue sin nombrar la cuenta ni el correo: el
 * mensaje se muestra en pantalla y no debe filtrar el destinatario.
 */
export function describeVerificationEmailError(error: unknown): string {
  const code = extractAuthErrorCode(error);

  if (code !== null && RATE_LIMIT_CODES.has(code)) {
    return RATE_LIMITED_MESSAGE;
  }

  if (code !== null && NETWORK_CODES.has(code)) {
    return NETWORK_MESSAGE;
  }

  return UNEXPECTED_VERIFICATION_MESSAGE;
}
