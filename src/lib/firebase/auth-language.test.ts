import { describe, expect, it } from 'vitest';

import {
  AUTH_LANGUAGE_CODE,
  applyAdminAuthLanguage,
  hasAdminAuthLanguage,
  type LocalizableAuth,
} from './auth-language';

/** Doble de `Auth` con la única propiedad que interviene. No abre ninguna conexión. */
function fakeAuth(languageCode: string | null = null): LocalizableAuth {
  return { languageCode };
}

describe('AUTH_LANGUAGE_CODE', () => {
  it('es español', () => {
    expect(AUTH_LANGUAGE_CODE).toBe('es');
  });
});

describe('applyAdminAuthLanguage', () => {
  it('fija el idioma cuando el SDK aún no tiene ninguno', () => {
    const auth = fakeAuth(null);

    applyAdminAuthLanguage(auth);

    expect(auth.languageCode).toBe('es');
  });

  it('sobrescribe el idioma que el SDK hubiera deducido del navegador', () => {
    for (const browserLanguage of ['en', 'en-US', 'pt-BR', 'fr']) {
      const auth = fakeAuth(browserLanguage);

      applyAdminAuthLanguage(auth);

      expect(auth.languageCode).toBe('es');
    }
  });

  it('es idempotente', () => {
    const auth = fakeAuth('en-US');

    applyAdminAuthLanguage(auth);
    applyAdminAuthLanguage(auth);

    expect(auth.languageCode).toBe('es');
  });

  it('deja la instancia lista antes de enviar cualquier correo', () => {
    const auth = fakeAuth('en-US');

    expect(hasAdminAuthLanguage(auth)).toBe(false);
    expect(hasAdminAuthLanguage(applyAdminAuthLanguage(auth))).toBe(true);
  });
});
