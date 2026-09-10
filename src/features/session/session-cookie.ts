/**
 * Política de la cookie de sesión administrativa.
 *
 * Módulo puro: describe la cookie, no la escribe. Las rutas del BFF y `/panel` consumen estas
 * constantes para no repetir atributos —un atributo olvidado en un solo sitio bastaría para
 * romper la garantía—.
 *
 * Decisiones fijadas en `docs/decisions/0003-admin-session-bff.md`.
 */

import { MAX_SESSION_SECONDS } from '@/lib/api/session-material';

/**
 * Nombre fijo de la cookie.
 *
 * El prefijo `__Host-` no es decorativo: el navegador **rechaza** la cookie si no viene con
 * `Secure`, si trae `Domain` o si `Path` no es `/`. Convierte la política en algo que el navegador
 * hace cumplir, no solo en algo que el servidor promete.
 */
export const SESSION_COOKIE_NAME = '__Host-modulartess-admin-session';

/**
 * Atributos de la cookie. Son los mismos al crearla y al borrarla: si difirieran, el navegador
 * trataría el borrado como una cookie distinta y la sesión sobreviviría al cierre.
 */
export const SESSION_COOKIE_ATTRIBUTES = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/',
  // Sin `domain`: `__Host-` lo prohíbe y limita la cookie al host exacto.
} as const satisfies {
  readonly httpOnly: true;
  readonly secure: true;
  readonly sameSite: 'strict';
  readonly path: '/';
};

export type SessionCookieWrite = typeof SESSION_COOKIE_ATTRIBUTES & {
  readonly name: typeof SESSION_COOKIE_NAME;
  readonly value: string;
  readonly maxAge: number;
};

/**
 * Describe la escritura de la cookie.
 *
 * `maxAge` se recorta dos veces: nunca supera el `expiresAt` que devolvió el backend (ya aplicado
 * al calcular `maxAgeSeconds`) ni los `28800` segundos del contrato. No hay renovación silenciosa:
 * cuando caduca, hace falta un nuevo inicio de sesión.
 */
export function buildSessionCookie(value: string, maxAgeSeconds: number): SessionCookieWrite {
  return {
    ...SESSION_COOKIE_ATTRIBUTES,
    name: SESSION_COOKIE_NAME,
    value,
    maxAge: Math.max(0, Math.min(Math.floor(maxAgeSeconds), MAX_SESSION_SECONDS)),
  };
}

/**
 * Describe el borrado de la cookie: mismo nombre y mismos atributos, `Max-Age` a cero.
 */
export function buildSessionCookieRemoval(): SessionCookieWrite {
  return {
    ...SESSION_COOKIE_ATTRIBUTES,
    name: SESSION_COOKIE_NAME,
    value: '',
    maxAge: 0,
  };
}
