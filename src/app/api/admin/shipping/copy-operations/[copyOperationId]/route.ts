import 'server-only';

/**
 * `GET /api/admin/shipping/copy-operations/{copyOperationId}`: progreso de una copia.
 *
 * Se lee siempre del backend, así que la pantalla de la operación se reconstruye igual tras recargar
 * o volver a abrir el navegador. La `Idempotency-Key` original no viaja nunca.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { isShippingId } from '@/features/shipping/shipping-input';
import { handleQuery, queryError } from '@/features/session/query-route';
import { getCopyOperation } from '@/lib/api/shipping';

export async function GET(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly copyOperationId: string }> },
): Promise<NextResponse> {
  const { copyOperationId } = await context.params;

  if (!isShippingId(copyOperationId)) return queryError('copy_operation_not_found');

  return handleQuery(request, (sessionMaterial) =>
    getCopyOperation(sessionMaterial, copyOperationId),
  );
}
