import { describe, expect, it } from 'vitest';

import {
  exceedsBodyByteLimit,
  hasJsonContentType,
  ID_TOKEN_MAX_LENGTH,
  ID_TOKEN_MIN_LENGTH,
  MAX_REQUEST_BODY_BYTES,
  parseSessionRequest,
  utf8ByteLength,
} from './session-request';

/** Cadena de forma válida y longitud suficiente. No es un token real. */
const FAKE_TOKEN = 'a'.repeat(ID_TOKEN_MIN_LENGTH);

describe('content-type', () => {
  it.each(['application/json', 'application/json; charset=utf-8', 'APPLICATION/JSON'])(
    'acepta %o',
    (value) => {
      expect(hasJsonContentType(value)).toBe(true);
    },
  );

  it.each([
    null,
    '',
    'text/plain',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'application/json-patch+json',
  ])('rechaza %o', (value) => {
    expect(hasJsonContentType(value)).toBe(false);
  });
});

describe('forma del cuerpo', () => {
  it('acepta exactamente { idToken: string }', () => {
    expect(parseSessionRequest({ idToken: FAKE_TOKEN })).toEqual({ ok: true, idToken: FAKE_TOKEN });
  });

  it('rechaza campos adicionales en lugar de ignorarlos', () => {
    expect(parseSessionRequest({ idToken: FAKE_TOKEN, role: 'super_admin' }).ok).toBe(false);
    expect(parseSessionRequest({ idToken: FAKE_TOKEN, uid: 'x' }).ok).toBe(false);
  });

  it.each([
    ['objeto vacío', {}],
    ['nulo', null],
    ['array', [FAKE_TOKEN]],
    ['cadena', FAKE_TOKEN],
    ['número', 1],
    ['campo mal nombrado', { id_token: FAKE_TOKEN }],
    ['idToken no string', { idToken: 12345 }],
    ['idToken nulo', { idToken: null }],
  ])('rechaza %s', (_label, value) => {
    expect(parseSessionRequest(value).ok).toBe(false);
  });
});

describe('límites del contrato', () => {
  it('rechaza por debajo del mínimo', () => {
    expect(parseSessionRequest({ idToken: 'a'.repeat(ID_TOKEN_MIN_LENGTH - 1) }).ok).toBe(false);
  });

  it('acepta el mínimo exacto', () => {
    expect(parseSessionRequest({ idToken: 'a'.repeat(ID_TOKEN_MIN_LENGTH) }).ok).toBe(true);
  });

  it('acepta el máximo exacto', () => {
    expect(parseSessionRequest({ idToken: 'a'.repeat(ID_TOKEN_MAX_LENGTH) }).ok).toBe(true);
  });

  it('rechaza por encima del máximo', () => {
    expect(parseSessionRequest({ idToken: 'a'.repeat(ID_TOKEN_MAX_LENGTH + 1) }).ok).toBe(false);
  });

  it('replica los límites que publica el contrato', () => {
    expect([ID_TOKEN_MIN_LENGTH, ID_TOKEN_MAX_LENGTH]).toEqual([32, 4096]);
  });
});

describe('medición del cuerpo en bytes UTF-8', () => {
  it('cuenta un byte por carácter ASCII', () => {
    expect(utf8ByteLength('abc')).toBe(3);
  });

  it('cuenta los bytes reales de los caracteres multibyte', () => {
    // 'ñ' ocupa 2 bytes, '€' 3, y un emoji 4.
    expect(utf8ByteLength('ñ')).toBe(2);
    expect(utf8ByteLength('€')).toBe(3);
    expect(utf8ByteLength('😀')).toBe(4);
  });

  it('rechaza un cuerpo cuyos caracteres caben pero cuyos bytes no', () => {
    // Un emoji por carácter: 4 bytes cada uno y 2 unidades UTF-16.
    const emoji = '😀'.repeat(3000);

    // La premisa: por número de caracteres pasaría el límite holgadamente...
    expect([...emoji].length).toBeLessThan(MAX_REQUEST_BODY_BYTES);
    // ...y con `String.length` también, porque cuenta unidades UTF-16.
    expect(emoji.length).toBeLessThan(MAX_REQUEST_BODY_BYTES);
    // Pero en bytes reales pesa muy por encima.
    expect(utf8ByteLength(emoji)).toBeGreaterThan(MAX_REQUEST_BODY_BYTES);
    expect(exceedsBodyByteLimit(emoji)).toBe(true);
  });

  it('acepta exactamente el límite en bytes', () => {
    expect(exceedsBodyByteLimit('a'.repeat(MAX_REQUEST_BODY_BYTES))).toBe(false);
  });

  it('rechaza un solo byte por encima del límite', () => {
    expect(exceedsBodyByteLimit('a'.repeat(MAX_REQUEST_BODY_BYTES + 1))).toBe(true);
  });

  it('un cuerpo de caracteres de 3 bytes rebasa el límite con un tercio de los caracteres', () => {
    const euros = '€'.repeat(Math.floor(MAX_REQUEST_BODY_BYTES / 3) + 1);

    expect(euros.length).toBeLessThan(MAX_REQUEST_BODY_BYTES);
    expect(exceedsBodyByteLimit(euros)).toBe(true);
  });
});
