/**
 * Validación del material de sesión que devuelve el backend.
 *
 * Módulo puro y sin `server-only`, para poder comprobarlo aisladamente. El nombre del encabezado
 * interno vive aquí porque lo comparten el cliente del backend y las rutas del BFF.
 *
 * `x-modulartess-admin-session` transporta **exclusivamente** la sesión de la persona.
 * `Authorization` queda reservado a IAM. Son dos canales separados a propósito: así el backend
 * puede distinguir «quién invoca el servicio» de «en nombre de quién».
 */

/** Encabezado interno del contrato. No es una cookie y nunca llega al navegador. */
export const ADMIN_SESSION_HEADER = 'x-modulartess-admin-session';

/** Duración máxima del contrato, en segundos. Ninguna cookie puede superarla. */
export const MAX_SESSION_SECONDS = 28_800;

/** Longitud defensiva máxima del material de sesión, para no aceptar un encabezado absurdo. */
export const MAX_SESSION_MATERIAL_LENGTH = 8192;

export type SessionExpiryResult =
  | { readonly ok: true; readonly expiresAt: string; readonly maxAgeSeconds: number }
  | { readonly ok: false };

/**
 * Gramática RFC 3339 `date-time`, con la zona **obligatoria**: `Z` o un desplazamiento explícito.
 *
 * No se usa `Date.parse` como validador porque acepta formatos informales
 * (`"2026-09-10"`, `"Sep 10 2026"`, `"2026/09/10 12:00"`) e interpreta una fecha sin zona como
 * hora **local**, que en un servidor equivale a una expiración que depende de su reloj.
 */
const RFC3339_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:([Zz])|([+-])(\d{2}):(\d{2}))$/;

function daysInMonth(year: number, month: number): number {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const lengths = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return lengths[month - 1] ?? 0;
}

/**
 * Interpreta un `date-time` de RFC 3339 y devuelve el instante en milisegundos, o `null`.
 *
 * Valida los componentes uno a uno en lugar de dejar que `Date` los normalice: `Date.UTC` convierte
 * `2026-02-30` en el 2 de marzo en silencio, y una expiración desplazada por normalización no es
 * la que devolvió el backend.
 */
export function parseRfc3339(value: string): number | null {
  const match = RFC3339_DATE_TIME.exec(value);

  if (match === null) {
    return null;
  }

  const [
    ,
    rawYear,
    rawMonth,
    rawDay,
    rawHour,
    rawMinute,
    rawSecond,
    rawFraction,
    zulu,
    sign,
    rawOffsetHour,
    rawOffsetMinute,
  ] = match;

  const year = Number(rawYear);
  const month = Number(rawMonth);
  const day = Number(rawDay);
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  const second = Number(rawSecond);

  if (month < 1 || month > 12) {
    return null;
  }

  if (day < 1 || day > daysInMonth(year, month)) {
    return null;
  }

  // Los segundos intercalados (`:60`) son legales en RFC 3339 pero no representables en `Date`, así
  // que se rechazan en lugar de desplazarse un segundo.
  if (hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  let offsetMinutes = 0;

  if (zulu === undefined) {
    const offsetHour = Number(rawOffsetHour);
    const offsetMinute = Number(rawOffsetMinute);

    if (offsetHour > 23 || offsetMinute > 59) {
      return null;
    }

    offsetMinutes = (offsetHour * 60 + offsetMinute) * (sign === '-' ? -1 : 1);
  }

  // La fracción se recorta a milisegundos, que es la resolución de `Date`.
  const milliseconds =
    rawFraction === undefined ? 0 : Number(rawFraction.slice(0, 3).padEnd(3, '0'));

  return (
    Date.UTC(year, month - 1, day, hour, minute, second, milliseconds) - offsetMinutes * 60_000
  );
}

/**
 * Convierte el `expiresAt` del backend en un `Max-Age` utilizable.
 *
 * Reglas:
 *
 * - `expiresAt` debe ser un `date-time` **RFC 3339** válido, con `Z` o desplazamiento explícito.
 * - Debe estar en el futuro respecto a `now`.
 * - El resultado se recorta a `MAX_SESSION_SECONDS`: la cookie **nunca** vive más que el contrato,
 *   ni más que el `expiresAt` que devolvió el backend.
 *
 * El valor se toma **tal cual**, sin recortar espacios. Un timestamp con relleno alrededor no es
 * el que define el contrato: normalizarlo aquí sería aceptar en silencio una respuesta que no lo
 * cumple, y esconder un backend que serializa mal.
 */
export function resolveSessionExpiry(expiresAt: unknown, now: Date): SessionExpiryResult {
  if (typeof expiresAt !== 'string') {
    return { ok: false };
  }

  const expiryMs = parseRfc3339(expiresAt);

  if (expiryMs === null) {
    return { ok: false };
  }

  const remainingSeconds = Math.floor((expiryMs - now.getTime()) / 1000);

  if (remainingSeconds <= 0) {
    return { ok: false };
  }

  return {
    ok: true,
    expiresAt: new Date(expiryMs).toISOString(),
    maxAgeSeconds: Math.min(remainingSeconds, MAX_SESSION_SECONDS),
  };
}

/** Comprueba que el encabezado interno trae material usable. */
export function isUsableSessionMaterial(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= MAX_SESSION_MATERIAL_LENGTH
  );
}
