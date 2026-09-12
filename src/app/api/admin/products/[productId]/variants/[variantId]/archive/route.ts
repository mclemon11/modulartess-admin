import 'server-only';

/**
 * Archivado de una variante. Exige `products.archive`, que `moderator` no tiene.
 *
 * Es una transición de estado, no una edición: la variante sale de las opciones vendibles y su SKU
 * queda reservado para siempre. El panel oculta la acción a quien no puede hacerla; el backend la
 * rechaza igualmente si llega fabricada a mano.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseTransition } from '@/features/panel/product-input';
import { handleMutation } from '@/features/session/mutation-route';
import { archiveProductVariant } from '@/lib/api/catalog';

export async function POST(
  request: NextRequest,
  context: {
    readonly params: Promise<{ readonly productId: string; readonly variantId: string }>;
  },
): Promise<NextResponse> {
  const { productId, variantId } = await context.params;

  return handleMutation(request, parseTransition, (sessionMaterial, body) =>
    archiveProductVariant(sessionMaterial, productId, variantId, body.expectedVersion),
  );
}
