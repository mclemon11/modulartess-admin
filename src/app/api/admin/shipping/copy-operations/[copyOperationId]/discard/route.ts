import 'server-only';

/**
 * `POST /api/admin/shipping/copy-operations/{copyOperationId}/discard`: descartar una copia sin la clave original: `200` descartada, también al repetirlo; una terminada es `409`.
 *
 * Responde el recurso tipado de la operación con el código del backend. Sin cuerpo: el BFF solo
 * admite `{}`.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { isShippingId, parseEmpty } from '@/features/shipping/shipping-input';
import { handleMutation, mutationError } from '@/features/session/mutation-route';
import { actOnCopyOperation } from '@/lib/api/shipping';

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly copyOperationId: string }> },
): Promise<NextResponse> {
  const { copyOperationId } = await context.params;

  if (!isShippingId(copyOperationId)) return mutationError('copy_operation_not_found');

  let status = 200;

  return handleMutation(
    request,
    parseEmpty,
    async (sessionMaterial) => {
      const result = await actOnCopyOperation(sessionMaterial, copyOperationId, 'discard');

      status = result.status;

      return result.operation;
    },
    () => status,
  );
}
