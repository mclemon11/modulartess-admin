import 'server-only';

/**
 * Andamiaje común de las rutas de **lectura** del panel.
 *
 * Es el gemelo de `mutation-route`, con una diferencia deliberada: una lectura no valida `Origin`.
 * `Origin` protege contra escrituras provocadas desde otro sitio; en un `GET` no hay nada que
 * provocar, y exigirlo rompería una navegación normal sin añadir seguridad. Lo que sí comparte es
 * todo lo demás: cookie leída en el servidor, traducción a códigos estables y `no-store`.
 */

import { NextResponse, type NextRequest } from 'next/server';

import {
  sessionErrorBody,
  sessionErrorFromBackendFailure,
  sessionErrorStatus,
  type SessionErrorCode,
} from '@/features/session/api-errors';
import { SESSION_COOKIE_NAME } from '@/features/session/session-cookie';
import { isBackendFailure } from '@/lib/api/errors';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export function queryError(code: SessionErrorCode): NextResponse {
  return NextResponse.json(sessionErrorBody(code), {
    status: sessionErrorStatus(code),
    headers: NO_STORE,
  });
}

/**
 * Ejecuta una lectura tras pasar la frontera.
 *
 * El material de sesión no sale nunca de aquí: se lee de la cookie `__Host-` en el servidor y se
 * entrega al cliente tipado, que lo pone en el encabezado interno. El navegador no lo ve.
 */
export async function handleQuery<TResult>(
  request: NextRequest,
  run: (sessionMaterial: string) => Promise<TResult>,
): Promise<NextResponse> {
  const sessionMaterial = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (sessionMaterial === undefined || sessionMaterial.length === 0) {
    return queryError('session_required');
  }

  try {
    return NextResponse.json(await run(sessionMaterial), { headers: NO_STORE });
  } catch (error) {
    if (isBackendFailure(error)) {
      return queryError(sessionErrorFromBackendFailure(error.code));
    }

    return queryError('internal_error');
  }
}
