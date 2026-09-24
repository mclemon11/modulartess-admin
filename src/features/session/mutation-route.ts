import 'server-only';

/**
 * Andamiaje común de las rutas mutantes del panel.
 *
 * Las cinco mutaciones de catálogo comparten exactamente la misma frontera: validar `Origin`,
 * leer la cookie `__Host-` en el servidor, llamar al backend con la sesión y traducir el fallo a
 * un código estable. Repetirlo en cada archivo garantizaría que tarde o temprano una ruta se
 * olvide de una de las cuatro cosas.
 *
 * Se conservan los estados que el contrato distingue —400, 401, 403, 404, 409, 503—, porque el
 * cliente los necesita para reaccionar distinto: un 409 ofrece recargar, un 403 no.
 */

import { NextResponse, type NextRequest } from 'next/server';

import {
  sessionErrorBody,
  sessionErrorFromBackendFailure,
  sessionErrorStatus,
  type SessionErrorCode,
} from '@/features/session/api-errors';
import { ORIGIN_HEADER, checkOrigin } from '@/features/session/origin-guard';
import { SESSION_COOKIE_NAME } from '@/features/session/session-cookie';
import { hasJsonContentType, MAX_REQUEST_BODY_BYTES } from '@/features/session/session-request';
import { readAdminOriginFromEnv } from '@/lib/api/backend-config';
import { isBackendFailure } from '@/lib/api/errors';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export function mutationError(
  code: SessionErrorCode,
  reference: string | null = null,
): NextResponse {
  return NextResponse.json(sessionErrorBody(code, reference), {
    status: sessionErrorStatus(code),
    headers: NO_STORE,
  });
}

export function mutationOk(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

/** Valida `Origin` contra la variable server-only. Devuelve el código de error, o `null`. */
function guardOrigin(request: NextRequest): SessionErrorCode | null {
  const adminOrigin = readAdminOriginFromEnv();

  if (!adminOrigin.ok) {
    return 'internal_error';
  }

  return checkOrigin(request.headers.get(ORIGIN_HEADER), adminOrigin.adminOrigin).ok
    ? null
    : 'invalid_origin';
}

export type MutationContext = {
  readonly sessionMaterial: string;
  readonly body: unknown;
};

/**
 * Ejecuta una mutación tras pasar la frontera.
 *
 * `parse` valida y estrecha el cuerpo; devolver `null` produce un `400` sin llamar al backend. El
 * cuerpo **nunca** se registra.
 */
export async function handleMutation<TBody, TResult>(
  request: NextRequest,
  parse: (raw: unknown) => TBody | null,
  run: (sessionMaterial: string, body: TBody) => Promise<TResult>,
  successStatus = 200,
): Promise<NextResponse> {
  const originError = guardOrigin(request);

  if (originError !== null) {
    return mutationError(originError);
  }

  if (!hasJsonContentType(request.headers.get('content-type'))) {
    return mutationError('invalid_request');
  }

  const sessionMaterial = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (sessionMaterial === undefined || sessionMaterial.length === 0) {
    return mutationError('session_required');
  }

  let raw: string;

  try {
    raw = await request.text();
  } catch {
    return mutationError('invalid_request');
  }

  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BODY_BYTES) {
    return mutationError('invalid_request');
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return mutationError('invalid_request');
  }

  const body = parse(parsed);

  if (body === null) {
    return mutationError('invalid_request');
  }

  try {
    return mutationOk(await run(sessionMaterial, body), successStatus);
  } catch (error) {
    if (isBackendFailure(error)) {
      return mutationError(sessionErrorFromBackendFailure(error.code), error.reference);
    }

    return mutationError('internal_error');
  }
}
