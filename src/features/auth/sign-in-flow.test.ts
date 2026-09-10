import { describe, expect, it } from 'vitest';

import { decideSignInOutcome } from './sign-in-flow';

describe('decideSignInOutcome', () => {
  it('pide verificar el correo cuando la cuenta no está verificada', () => {
    expect(decideSignInOutcome({ emailVerified: false })).toBe('email-verification-required');
  });

  it('no concede sesión administrativa cuando la cuenta sí está verificada', () => {
    expect(decideSignInOutcome({ emailVerified: true })).toBe('verified-session-pending');
  });

  it('solo produce estos dos resultados; ninguno abre el panel', () => {
    const outcomes = [true, false].map((emailVerified) => decideSignInOutcome({ emailVerified }));

    expect(new Set(outcomes)).toEqual(
      new Set(['verified-session-pending', 'email-verification-required']),
    );
  });
});
