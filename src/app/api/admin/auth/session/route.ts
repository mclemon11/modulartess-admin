import 'server-only';

/**
 * Frontera BFF de la sesión administrativa.
 *
 * Estas tres rutas son el **único** camino del navegador hacia la superficie administrativa del
 * backend. El navegador nunca llama al backend directamente: no conoce su URL, no tiene identidad
 * IAM y no puede leer la cookie de sesión.
 *
 * Separación de canales hacia el backend:
 *
 * - `Authorization` → solo el identity token IAM de Cloud Run (lo pone el cliente del backend).
 * - `x-modulartess-admin-session` → solo la sesión de la persona.
 *
 * Defensa CSRF: `SameSite=Strict` en la cookie más validación **exacta** de `Origin` en `POST` y
 * `DELETE`. Ver `docs/decisions/0003-admin-session-bff.md`.
 *
 * Nada se registra en ninguna rama: ni el cuerpo, ni el ID token, ni la cookie, ni el material de
 * sesión, ni el UID, ni el correo, ni las respuestas crudas del backend.
 */

import { NextResponse, type NextRequest } from 'next/server';

import {
  sessionErrorBody,
  sessionErrorFromBackendFailure,
  sessionErrorStatus,
  type SessionErrorCode,
} from '@/features/session/api-errors';
import { ORIGIN_HEADER, checkOrigin } from '@/features/session/origin-guard';
import {
  buildSessionCookie,
  buildSessionCookieRemoval,
  SESSION_COOKIE_NAME,
} from '@/features/session/session-cookie';
import {
  exceedsBodyByteLimit,
  hasJsonContentType,
  MAX_REQUEST_BODY_BYTES,
  parseSessionRequest,
} from '@/features/session/session-request';
import { readAdminOriginFromEnv } from '@/lib/api/backend-config';
import { createAdminSession, verifyAdminSession } from '@/lib/api/backend-client';
import { isBackendFailure } from '@/lib/api/errors';

/** Ninguna respuesta de esta superficie es cacheable, tampoco las de error. */
const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function errorResponse(code: SessionErrorCode): NextResponse {
  return NextResponse.json(sessionErrorBody(code), {
    status: sessionErrorStatus(code),
    headers: NO_STORE,
  });
}

/** Borra la cookie con **los mismos** atributos con los que se creó. */
function withCookieRemoval(response: NextResponse): NextResponse {
  const removal = buildSessionCookieRemoval();

  response.cookies.set(removal.name, removal.value, {
    httpOnly: removal.httpOnly,
    secure: removal.secure,
    sameSite: removal.sameSite,
    path: removal.path,
    maxAge: removal.maxAge,
  });

  return response;
}

/**
 * Valida `Origin` contra `MODULARTESS_ADMIN_ORIGIN`, y **solo** contra ella.
 *
 * Lee el origen autorizado por separado, no la configuración completa del backend. Cerrar sesión
 * no llama al backend, así que no puede depender de que la URL, la audiencia o el modo de
 * autenticación estén presentes: si lo hiciera, una configuración incompleta dejaría a la persona
 * sin poder retirar su propia cookie.
 */
function guardAdminOrigin(request: NextRequest): SessionErrorCode | null {
  const adminOrigin = readAdminOriginFromEnv();

  if (!adminOrigin.ok) {
    return 'internal_error';
  }

  const check = checkOrigin(request.headers.get(ORIGIN_HEADER), adminOrigin.adminOrigin);

  return check.ok ? null : 'invalid_origin';
}

/**
 * Intercambia un ID token de Firebase por una sesión administrativa y la guarda en la cookie
 * `__Host-`. Devuelve solo `principal` y `expiresAt`: nunca la cookie ni el ID token.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const originError = guardAdminOrigin(request);

  if (originError !== null) {
    return errorResponse(originError);
  }

  if (!hasJsonContentType(request.headers.get('content-type'))) {
    return errorResponse('invalid_request');
  }

  // Corte temprano por lo que declara el cliente: evita leer un cuerpo enorme.
  const declaredLength = Number(request.headers.get('content-length') ?? '0');

  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
    return errorResponse('invalid_request');
  }

  let raw: string;

  try {
    raw = await request.text();
  } catch {
    return errorResponse('invalid_request');
  }

  // Comprobación definitiva sobre lo recibido, medido en **bytes UTF-8**. `Content-Length` lo pone
  // el cliente y puede mentir; `raw.length` cuenta unidades UTF-16, no bytes, así que un cuerpo
  // multibyte pasaría el corte pesando varias veces el límite.
  if (exceedsBodyByteLimit(raw)) {
    return errorResponse('invalid_request');
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(raw);
  } catch {
    // El cuerpo no se registra: lleva un ID token.
    return errorResponse('invalid_request');
  }

  const parsed = parseSessionRequest(parsedJson);

  if (!parsed.ok) {
    return errorResponse('invalid_request');
  }

  try {
    const session = await createAdminSession(parsed.idToken);
    const cookie = buildSessionCookie(session.sessionMaterial, session.maxAgeSeconds);

    const response = NextResponse.json(
      { principal: session.principal, expiresAt: session.expiresAt },
      { status: 201, headers: NO_STORE },
    );

    response.cookies.set(cookie.name, cookie.value, {
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
      path: cookie.path,
      maxAge: cookie.maxAge,
    });

    return response;
  } catch (error) {
    if (isBackendFailure(error)) {
      return errorResponse(sessionErrorFromBackendFailure(error.code));
    }

    return errorResponse('internal_error');
  }
}

/**
 * Verifica la sesión contra el backend en **cada** lectura. Devuelve solo el `principal`
 * verificado.
 *
 * Esta ruta es de **solo lectura**: no renueva, no rota y **no escribe ni borra ninguna cookie**,
 * tampoco cuando el backend responde `401` o `403`. Borrar es una mutación, y una mutación no
 * pertenece a un `GET`: se hace por el `DELETE`, que valida `Origin`. Quien recibe un `401` aquí
 * sabe que debe llamar al `DELETE` (ver `SessionCleanup`).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const material = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (material === undefined || material.length === 0) {
    return errorResponse('session_required');
  }

  try {
    const principal = await verifyAdminSession(material);

    return NextResponse.json({ principal }, { status: 200, headers: NO_STORE });
  } catch (error) {
    if (isBackendFailure(error)) {
      return errorResponse(sessionErrorFromBackendFailure(error.code));
    }

    return errorResponse('internal_error');
  }
}

/**
 * Cierra la sesión **local** borrando la cookie, con exactamente los mismos atributos con los que
 * se creó.
 *
 * El contrato no publica ningún `DELETE /v1/admin/auth/session`, así que aquí no se inventa: no se
 * llama al backend. Por eso tampoco necesita su URL, su audiencia ni su modo de autenticación:
 * solo valida `Origin`. La sesión de Firebase caduca por su cuenta y el backend comprueba la
 * revocación en cada lectura.
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const originError = guardAdminOrigin(request);

  if (originError !== null) {
    return errorResponse(originError);
  }

  return withCookieRemoval(new NextResponse(null, { status: 204, headers: NO_STORE }));
}
