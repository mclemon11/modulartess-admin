import { describe, expect, it } from 'vitest';

import {
  GENERIC_CREDENTIALS_MESSAGE,
  NETWORK_MESSAGE,
  RATE_LIMITED_MESSAGE,
  UNEXPECTED_SIGN_IN_MESSAGE,
  UNEXPECTED_VERIFICATION_MESSAGE,
  describeSignInError,
  describeVerificationEmailError,
  extractAuthErrorCode,
} from './auth-errors';

/** Reproduce la forma de un `FirebaseError` sin importar el SDK ni tocar la red. */
function firebaseError(code: string): unknown {
  return { name: 'FirebaseError', code, message: `Firebase: (${code}).` };
}

/**
 * Códigos que distinguirían «la cuenta no existe» de «la contraseña es incorrecta». Todos deben
 * producir exactamente el mismo texto: es la defensa contra la enumeración de cuentas.
 */
const ENUMERATION_SENSITIVE_CODES = [
  'auth/user-not-found',
  'auth/wrong-password',
  'auth/invalid-credential',
  'auth/invalid-login-credentials',
  'auth/invalid-email',
  'auth/missing-email',
  'auth/missing-password',
  'auth/user-disabled',
] as const;

describe('extractAuthErrorCode', () => {
  it('extrae el código de un error con forma de FirebaseError', () => {
    expect(extractAuthErrorCode(firebaseError('auth/user-not-found'))).toBe('auth/user-not-found');
  });

  it('devuelve null para valores sin código utilizable', () => {
    expect(extractAuthErrorCode(new Error('boom'))).toBeNull();
    expect(extractAuthErrorCode(null)).toBeNull();
    expect(extractAuthErrorCode('auth/user-not-found')).toBeNull();
    expect(extractAuthErrorCode({ code: 42 })).toBeNull();
  });
});

describe('describeSignInError', () => {
  it('devuelve el mismo mensaje genérico para todos los códigos que permitirían enumerar', () => {
    const messages = ENUMERATION_SENSITIVE_CODES.map((code) =>
      describeSignInError(firebaseError(code)),
    );

    expect(new Set(messages)).toEqual(new Set([GENERIC_CREDENTIALS_MESSAGE]));
  });

  it('no menciona la cuenta, el correo ni la contraseña por separado', () => {
    expect(GENERIC_CREDENTIALS_MESSAGE).not.toMatch(
      /no existe|no encontrad|incorrecta|desactivad/i,
    );
  });

  it('describe el bloqueo por intentos en términos del dispositivo, no de la cuenta', () => {
    expect(describeSignInError(firebaseError('auth/too-many-requests'))).toBe(RATE_LIMITED_MESSAGE);
    expect(RATE_LIMITED_MESSAGE).toMatch(/dispositivo/i);
    expect(RATE_LIMITED_MESSAGE).not.toMatch(/cuenta|correo/i);
  });

  it('distingue el fallo de red, que no revela nada de la cuenta', () => {
    expect(describeSignInError(firebaseError('auth/network-request-failed'))).toBe(NETWORK_MESSAGE);
  });

  it('cae en un mensaje neutro ante códigos desconocidos o errores sin código', () => {
    expect(describeSignInError(firebaseError('auth/internal-error'))).toBe(
      UNEXPECTED_SIGN_IN_MESSAGE,
    );
    expect(describeSignInError(new Error('boom'))).toBe(UNEXPECTED_SIGN_IN_MESSAGE);
    expect(describeSignInError(undefined)).toBe(UNEXPECTED_SIGN_IN_MESSAGE);
  });

  it('nunca deja escapar el código de Firebase en el texto mostrado', () => {
    const codes = [...ENUMERATION_SENSITIVE_CODES, 'auth/internal-error', 'auth/too-many-requests'];

    for (const code of codes) {
      expect(describeSignInError(firebaseError(code))).not.toContain('auth/');
    }
  });
});

describe('describeVerificationEmailError', () => {
  it('usa un mensaje neutro para cualquier fallo de envío', () => {
    expect(describeVerificationEmailError(firebaseError('auth/internal-error'))).toBe(
      UNEXPECTED_VERIFICATION_MESSAGE,
    );
    expect(describeVerificationEmailError(new Error('boom'))).toBe(UNEXPECTED_VERIFICATION_MESSAGE);
  });

  it('conserva la distinción de red y de bloqueo temporal', () => {
    expect(describeVerificationEmailError(firebaseError('auth/network-request-failed'))).toBe(
      NETWORK_MESSAGE,
    );
    expect(describeVerificationEmailError(firebaseError('auth/too-many-requests'))).toBe(
      RATE_LIMITED_MESSAGE,
    );
  });

  it('no nombra el destinatario del correo', () => {
    expect(UNEXPECTED_VERIFICATION_MESSAGE).not.toMatch(/@/);
  });
});
