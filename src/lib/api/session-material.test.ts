import { describe, expect, it } from 'vitest';

import {
  ADMIN_SESSION_HEADER,
  isUsableSessionMaterial,
  MAX_SESSION_MATERIAL_LENGTH,
  MAX_SESSION_SECONDS,
  parseRfc3339,
  resolveSessionExpiry,
} from './session-material';

const NOW = new Date('2026-09-10T12:00:00.000Z');

describe('encabezado interno', () => {
  it('es el que declara el contrato', () => {
    expect(ADMIN_SESSION_HEADER).toBe('x-modulartess-admin-session');
  });

  it('no es Authorization: ese canal está reservado a IAM', () => {
    expect(ADMIN_SESSION_HEADER.toLowerCase()).not.toBe('authorization');
  });
});

describe('expiración válida', () => {
  it('convierte expiresAt en los segundos restantes', () => {
    const result = resolveSessionExpiry('2026-09-10T13:00:00.000Z', NOW);

    expect(result).toEqual({
      ok: true,
      expiresAt: '2026-09-10T13:00:00.000Z',
      maxAgeSeconds: 3600,
    });
  });

  it('recorta a los 28 800 segundos del contrato', () => {
    // Diez horas: por encima del tope del contrato.
    const result = resolveSessionExpiry('2026-09-10T22:00:00.000Z', NOW);

    expect(result.ok === true && result.maxAgeSeconds).toBe(MAX_SESSION_SECONDS);
  });

  it('acepta exactamente el tope del contrato', () => {
    const result = resolveSessionExpiry('2026-09-10T20:00:00.000Z', NOW);

    expect(result.ok === true && result.maxAgeSeconds).toBe(MAX_SESSION_SECONDS);
  });
});

describe('expiración RFC 3339 aceptada', () => {
  it('acepta la forma con Z', () => {
    expect(resolveSessionExpiry('2026-09-10T13:00:00Z', NOW).ok).toBe(true);
  });

  it('acepta Z con fracción de segundo', () => {
    expect(resolveSessionExpiry('2026-09-10T13:00:00.250Z', NOW).ok).toBe(true);
  });

  it('acepta la t y la z minúsculas que RFC 3339 permite', () => {
    expect(resolveSessionExpiry('2026-09-10t13:00:00z', NOW).ok).toBe(true);
  });

  it('acepta un desplazamiento positivo explícito y lo convierte a UTC', () => {
    // 15:00+02:00 es 13:00Z: una hora por delante de NOW.
    const result = resolveSessionExpiry('2026-09-10T15:00:00+02:00', NOW);

    expect(result).toEqual({
      ok: true,
      expiresAt: '2026-09-10T13:00:00.000Z',
      maxAgeSeconds: 3600,
    });
  });

  it('acepta un desplazamiento negativo explícito', () => {
    // 09:00-04:00 es 13:00Z.
    const result = resolveSessionExpiry('2026-09-10T09:00:00-04:00', NOW);

    expect(result.ok === true && result.expiresAt).toBe('2026-09-10T13:00:00.000Z');
  });

  it('respeta el 29 de febrero de un año bisiesto', () => {
    expect(parseRfc3339('2028-02-29T00:00:00Z')).not.toBeNull();
  });
});

describe('expiración no RFC 3339 rechazada', () => {
  it.each([
    ['solo fecha, sin hora ni zona', '2026-09-10'],
    ['sin zona', '2026-09-10T13:00:00'],
    ['sin zona y con espacio', '2026-09-10 13:00:00'],
    ['formato informal en inglés', 'Sep 10 2026 13:00:00 GMT'],
    ['formato con barras', '2026/09/10 13:00:00'],
    ['zona por nombre', '2026-09-10T13:00:00 UTC'],
    ['texto adicional al final', '2026-09-10T13:00:00Z extra'],
    ['texto adicional al principio', 'expira 2026-09-10T13:00:00Z'],
    ['desplazamiento sin dos puntos', '2026-09-10T13:00:00+0200'],
    ['desplazamiento incompleto', '2026-09-10T13:00:00+02'],
    ['mes imposible', '2026-13-10T13:00:00Z'],
    ['día imposible', '2026-02-30T13:00:00Z'],
    ['día 31 en un mes de 30', '2026-04-31T13:00:00Z'],
    ['29 de febrero en año no bisiesto', '2027-02-29T13:00:00Z'],
    ['hora imposible', '2026-09-10T24:00:00Z'],
    ['minuto imposible', '2026-09-10T13:60:00Z'],
    ['segundo intercalar, no representable', '2026-09-10T13:00:60Z'],
    ['desplazamiento de horas imposible', '2026-09-10T13:00:00+24:00'],
    ['epoch en milisegundos como texto', '1789000000000'],
  ])('rechaza %s', (_label, value) => {
    expect(resolveSessionExpiry(value, NOW)).toEqual({ ok: false });
  });

  it('rechaza formatos informales que Date.parse sí acepta', () => {
    // Prueba de la premisa: sin validación estricta, estos entrarían.
    for (const informal of ['2026-09-10', 'Sep 10 2026 13:00:00 GMT', '2026/09/10 13:00:00']) {
      expect(Number.isNaN(Date.parse(informal))).toBe(false);
      expect(resolveSessionExpiry(informal, NOW)).toEqual({ ok: false });
    }
  });

  it.each([
    ['con un espacio al principio', ' 2026-09-10T13:00:00Z'],
    ['con un espacio al final', '2026-09-10T13:00:00Z '],
    ['con tabulador y salto de línea', '\t2026-09-10T13:00:00Z\n'],
    ['con espacios a ambos lados', '  2026-09-10T13:00:00Z  '],
    ['con un salto de línea interno', '2026-09-10T13:00:00Z\n'],
  ])('rechaza un timestamp %s: no se recorta el relleno', (_label, value) => {
    // El contenido interior sí sería válido; lo que se rechaza es el valor exacto recibido.
    expect(parseRfc3339(value.trim())).not.toBeNull();
    expect(resolveSessionExpiry(value, NOW)).toEqual({ ok: false });
  });

  it('acepta el mismo timestamp sin relleno', () => {
    expect(resolveSessionExpiry('2026-09-10T13:00:00Z', NOW).ok).toBe(true);
  });

  it('una fecha sin zona no se interpreta como hora local', () => {
    // Interpretada como local podría caer en el futuro y crear una cookie con vida arbitraria.
    expect(resolveSessionExpiry('2026-09-10T13:00:00', NOW)).toEqual({ ok: false });
  });
});

describe('expiración inválida', () => {
  it.each([
    ['ausente', undefined],
    ['nula', null],
    ['vacía', ''],
    ['solo espacios', '   '],
    ['no interpretable', 'mañana'],
    ['numérica', 1_760_000_000],
    ['objeto', { expiresAt: '2026-09-10T13:00:00.000Z' }],
  ])('rechaza una expiración %s', (_label, value) => {
    expect(resolveSessionExpiry(value, NOW)).toEqual({ ok: false });
  });

  it('rechaza una expiración ya pasada', () => {
    expect(resolveSessionExpiry('2026-09-10T11:59:00.000Z', NOW)).toEqual({ ok: false });
  });

  it('rechaza una expiración exactamente igual al presente', () => {
    expect(resolveSessionExpiry(NOW.toISOString(), NOW)).toEqual({ ok: false });
  });
});

describe('material de sesión utilizable', () => {
  it('acepta una cadena no vacía dentro del límite', () => {
    expect(isUsableSessionMaterial('material-opaco')).toBe(true);
  });

  it.each([
    ['nulo', null],
    ['ausente', undefined],
    ['vacío', ''],
    ['solo espacios', '   '],
    ['no string', 12345],
  ])('rechaza material %s', (_label, value) => {
    expect(isUsableSessionMaterial(value)).toBe(false);
  });

  it('rechaza un encabezado desproporcionado', () => {
    expect(isUsableSessionMaterial('a'.repeat(MAX_SESSION_MATERIAL_LENGTH + 1))).toBe(false);
  });
});
