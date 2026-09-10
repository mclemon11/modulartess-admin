import { describe, expect, it } from 'vitest';

import { checkOrigin } from './origin-guard';

const ALLOWED = 'https://panel.example.invalid';

describe('Origin ausente', () => {
  it.each([null, '', '   '])('rechaza %o', (received) => {
    expect(checkOrigin(received, ALLOWED)).toEqual({ ok: false, reason: 'missing' });
  });
});

describe('Origin malformado', () => {
  it.each([
    ['el literal null de un contexto opaco', 'null'],
    ['un valor sin esquema', 'panel.example.invalid'],
    ['una ruta relativa', '/panel'],
    ['con credenciales embebidas', 'https://u:p@panel.example.invalid'],
    ['texto arbitrario', 'no-es-un-origen'],
    ['un esquema que no es http ni https', 'ftp://panel.example.invalid'],
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:text/html,<p>x</p>'],
    ['file:', 'file:///etc/passwd'],
  ])('rechaza %s', (_label, received) => {
    expect(checkOrigin(received, ALLOWED)).toEqual({ ok: false, reason: 'malformed' });
  });
});

describe('el origen autorizado con ruta, consulta o fragmento NO pasa', () => {
  /**
   * `url.origin` descarta en silencio la ruta, la consulta y el fragmento: los cuatro valores de
   * abajo producen exactamente `https://panel.example.invalid`. Si la comparación se hiciera solo
   * sobre `url.origin`, todos pasarían.
   */
  it.each([
    ['una ruta', 'https://panel.example.invalid/ruta'],
    ['una ruta profunda', 'https://panel.example.invalid/a/b/c'],
    ['una consulta', 'https://panel.example.invalid?x=1'],
    ['un fragmento', 'https://panel.example.invalid#frag'],
    ['ruta y consulta', 'https://panel.example.invalid/ruta?x=1'],
  ])('rechaza el origen autorizado con %s', (_label, received) => {
    // Prueba de la premisa: `url.origin` sí coincide.
    expect(new URL(received).origin).toBe(ALLOWED);
    // Y aun así se rechaza.
    expect(checkOrigin(received, ALLOWED)).toEqual({ ok: false, reason: 'malformed' });
  });
});

describe('Origin distinto', () => {
  it.each([
    ['otro host', 'https://atacante.example.invalid'],
    ['sufijo engañoso', 'https://panel.example.invalid.atacante.tld'],
    ['prefijo engañoso', 'https://atacante-panel.example.invalid'],
    ['subdominio no autorizado', 'https://sub.panel.example.invalid'],
    ['esquema distinto', 'http://panel.example.invalid'],
    ['puerto distinto', 'https://panel.example.invalid:8443'],
  ])('rechaza %s', (_label, received) => {
    expect(checkOrigin(received, ALLOWED)).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('no acepta coincidencias por sufijo, que es el fallo clásico', () => {
    expect(checkOrigin('https://evil-panel.example.invalid', ALLOWED).ok).toBe(false);
  });
});

describe('Origin autorizado', () => {
  it('acepta el origen exacto', () => {
    expect(checkOrigin(ALLOWED, ALLOWED)).toEqual({ ok: true });
  });

  it('acepta la forma con el puerto por defecto explícito', () => {
    expect(checkOrigin('https://panel.example.invalid:443', ALLOWED)).toEqual({ ok: true });
  });

  it('acepta un origen local exacto en desarrollo', () => {
    expect(checkOrigin('http://localhost:3000', 'http://localhost:3000')).toEqual({ ok: true });
  });
});
