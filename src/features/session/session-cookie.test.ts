import { describe, expect, it } from 'vitest';

import { MAX_SESSION_SECONDS } from '@/lib/api/session-material';

import {
  buildSessionCookie,
  buildSessionCookieRemoval,
  SESSION_COOKIE_ATTRIBUTES,
  SESSION_COOKIE_NAME,
} from './session-cookie';

describe('nombre de la cookie', () => {
  it('es exactamente el decidido en la ADR 0003', () => {
    expect(SESSION_COOKIE_NAME).toBe('__Host-modulartess-admin-session');
  });

  it('usa el prefijo __Host-, que el navegador hace cumplir', () => {
    expect(SESSION_COOKIE_NAME.startsWith('__Host-')).toBe(true);
  });
});

describe('atributos exactos', () => {
  it('son HttpOnly, Secure, SameSite=Strict y Path=/', () => {
    expect(SESSION_COOKIE_ATTRIBUTES).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
    });
  });

  it('no declara Domain: el prefijo __Host- lo prohíbe', () => {
    expect(SESSION_COOKIE_ATTRIBUTES).not.toHaveProperty('domain');
  });

  it('la escritura lleva los atributos completos', () => {
    expect(buildSessionCookie('material-de-prueba', 600)).toEqual({
      name: '__Host-modulartess-admin-session',
      value: 'material-de-prueba',
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 600,
    });
  });
});

describe('tope de expiración', () => {
  it('recorta a los 28 800 segundos del contrato', () => {
    expect(buildSessionCookie('x', MAX_SESSION_SECONDS + 5000).maxAge).toBe(MAX_SESSION_SECONDS);
  });

  it('respeta una duración menor que el tope', () => {
    expect(buildSessionCookie('x', 120).maxAge).toBe(120);
  });

  it('nunca produce un Max-Age negativo', () => {
    expect(buildSessionCookie('x', -10).maxAge).toBe(0);
  });

  it('trunca fracciones de segundo', () => {
    expect(buildSessionCookie('x', 90.9).maxAge).toBe(90);
  });
});

describe('borrado', () => {
  it('usa el mismo nombre y los mismos atributos que la creación', () => {
    const written = buildSessionCookie('material', 600);
    const removal = buildSessionCookieRemoval();

    expect(removal.name).toBe(written.name);
    expect(removal.httpOnly).toBe(written.httpOnly);
    expect(removal.secure).toBe(written.secure);
    expect(removal.sameSite).toBe(written.sameSite);
    expect(removal.path).toBe(written.path);
  });

  it('vacía el valor y pone Max-Age a cero', () => {
    expect(buildSessionCookieRemoval().value).toBe('');
    expect(buildSessionCookieRemoval().maxAge).toBe(0);
  });
});
