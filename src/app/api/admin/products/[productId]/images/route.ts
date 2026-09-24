import 'server-only';

/**
 * Subida de imágenes a través del BFF.
 *
 * No usa `handleMutation`: ese ayudante es para cuerpos JSON, y aquí el contrato exige
 * `multipart/form-data`. El archivo se reenvía tal cual, sin leerlo ni reescribirlo: el backend es
 * quien comprueba la firma real del archivo contra el `Content-Type` declarado.
 *
 * El tamaño no se valida aquí más allá del límite del contrato: la autoridad sobre el contenido es
 * el backend, y duplicar la comprobación solo añadiría un sitio donde equivocarse.
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
import { IMAGE_ALT_MAX_LENGTH, IMAGE_MAX_BYTES, uploadProductImage } from '@/lib/api/catalog';
import { isBackendFailure } from '@/lib/api/errors';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function fail(code: SessionErrorCode, reference: string | null = null): NextResponse {
  return NextResponse.json(sessionErrorBody(code, reference), {
    status: sessionErrorStatus(code),
    headers: NO_STORE,
  });
}

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly productId: string }> },
): Promise<NextResponse> {
  const adminOrigin = readAdminOriginFromEnv();

  if (!adminOrigin.ok) {
    return fail('internal_error');
  }

  if (!checkOrigin(request.headers.get(ORIGIN_HEADER), adminOrigin.adminOrigin).ok) {
    return fail('invalid_origin');
  }

  const sessionMaterial = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (sessionMaterial === undefined || sessionMaterial.length === 0) {
    return fail('session_required');
  }

  // La clave la genera el cliente y se conserva entre reintentos de la misma subida.
  const idempotencyKey = request.headers.get('x-idempotency-key');

  if (idempotencyKey === null || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    return fail('invalid_request');
  }

  let incoming: FormData;

  try {
    incoming = await request.formData();
  } catch {
    return fail('invalid_request');
  }

  const file = incoming.get('file');
  const altText = incoming.get('altText');
  const expectedVersion = incoming.get('expectedVersion');

  if (!(file instanceof File) || file.size === 0 || file.size > IMAGE_MAX_BYTES) {
    return fail('invalid_request');
  }

  if (
    typeof altText !== 'string' ||
    altText.trim().length === 0 ||
    altText.length > IMAGE_ALT_MAX_LENGTH
  ) {
    return fail('invalid_request');
  }

  if (typeof expectedVersion !== 'string' || !/^\d+$/.test(expectedVersion)) {
    return fail('invalid_request');
  }

  // Se reconstruye el formulario con exactamente los tres campos del contrato: nada más viaja.
  const outgoing = new FormData();

  outgoing.set('file', file, file.name);
  outgoing.set('altText', altText.trim());
  outgoing.set('expectedVersion', expectedVersion);

  const { productId } = await context.params;

  try {
    const result = await uploadProductImage(sessionMaterial, productId, idempotencyKey, outgoing);

    return NextResponse.json(result, { status: 201, headers: NO_STORE });
  } catch (error) {
    if (isBackendFailure(error)) {
      return fail(sessionErrorFromBackendFailure(error.code), error.reference);
    }

    return fail('internal_error');
  }
}
