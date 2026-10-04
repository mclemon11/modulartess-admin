import 'server-only';

/**
 * Rutas multipart del BFF para la galería multimedia (video y póster).
 *
 * Misma frontera que la subida de imágenes: origen, sesión, formulario reconstruido solo con los
 * campos del contrato y fallos traducidos a códigos estables. Además, el `Content-Length` declarado
 * se comprueba **antes** de leer el cuerpo: un video de 20 MB que no cabe no debe llegar a memoria
 * para que lo rechacen después. El cliente puede mentir en esa cabecera, pero entonces el límite
 * del archivo —y el de 32 MiB de Cloud Run— lo cortan igual.
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
import { readAdminOriginFromEnv } from '@/lib/api/backend-config';
import { isBackendFailure } from '@/lib/api/errors';
import { MULTIPART_MARGIN_BYTES } from '@/lib/api/video-limits';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export function multipartFailure(
  code: SessionErrorCode,
  reference: string | null = null,
): NextResponse {
  return NextResponse.json(sessionErrorBody(code, reference), {
    status: sessionErrorStatus(code),
    headers: NO_STORE,
  });
}

export async function handleMultipartUpload<T>(
  request: NextRequest,
  options: {
    readonly maxFileBytes: number;
    /** Código con el que se rechaza un archivo ausente, vacío o grande, con su motivo. */
    readonly fileProblem: (problem: 'empty' | 'too_large') => NextResponse;
    readonly requireIdempotencyKey: boolean;
    /** Campos de texto del contrato, además de `file` y `expectedVersion`. */
    readonly textFields: Readonly<Record<string, (value: string) => string | null>>;
    readonly run: (input: {
      sessionMaterial: string;
      idempotencyKey: string | null;
      form: FormData;
    }) => Promise<T>;
  },
): Promise<NextResponse> {
  const adminOrigin = readAdminOriginFromEnv();

  if (!adminOrigin.ok) return multipartFailure('internal_error');

  if (!checkOrigin(request.headers.get(ORIGIN_HEADER), adminOrigin.adminOrigin).ok) {
    return multipartFailure('invalid_origin');
  }

  const sessionMaterial = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (sessionMaterial === undefined || sessionMaterial.length === 0) {
    return multipartFailure('session_required');
  }

  const idempotencyKey = request.headers.get('x-idempotency-key');

  if (
    options.requireIdempotencyKey &&
    (idempotencyKey === null || idempotencyKey.length < 8 || idempotencyKey.length > 128)
  ) {
    return multipartFailure('invalid_request');
  }

  const declared = Number(request.headers.get('content-length') ?? '0');

  if (Number.isFinite(declared) && declared > options.maxFileBytes + MULTIPART_MARGIN_BYTES) {
    return options.fileProblem('too_large');
  }

  let incoming: FormData;

  try {
    incoming = await request.formData();
  } catch {
    return multipartFailure('invalid_request');
  }

  const file = incoming.get('file');
  const expectedVersion = incoming.get('expectedVersion');

  if (!(file instanceof File) || file.size === 0) return options.fileProblem('empty');
  if (file.size > options.maxFileBytes) return options.fileProblem('too_large');

  if (typeof expectedVersion !== 'string' || !/^\d+$/.test(expectedVersion)) {
    return multipartFailure('invalid_request');
  }

  // Se reconstruye con exactamente los campos del contrato: nada más viaja.
  const outgoing = new FormData();

  outgoing.set('file', file, file.name);
  outgoing.set('expectedVersion', expectedVersion);

  for (const [name, normalise] of Object.entries(options.textFields)) {
    const value = incoming.get(name);
    const normalised = typeof value === 'string' ? normalise(value) : null;

    if (normalised === null) return multipartFailure('invalid_request');

    outgoing.set(name, normalised);
  }

  try {
    const result = await options.run({ sessionMaterial, idempotencyKey, form: outgoing });

    return NextResponse.json(result, { status: 201, headers: NO_STORE });
  } catch (error) {
    if (isBackendFailure(error)) {
      return multipartFailure(sessionErrorFromBackendFailure(error.code), error.reference);
    }

    return multipartFailure('internal_error');
  }
}
