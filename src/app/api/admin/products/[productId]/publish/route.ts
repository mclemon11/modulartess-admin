import 'server-only';

/**
 * Transición de estado del producto (publish).
 *
 * El panel oculta esta acción a `moderator`, pero eso es solo usabilidad: la autoridad es el
 * backend, que rechaza la petición si el rol no la permite aunque llegue fabricada a mano.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseTransition } from '@/features/panel/product-input';
import { handleMutation } from '@/features/session/mutation-route';
import { transitionProduct } from '@/lib/api/catalog';

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly productId: string }> },
): Promise<NextResponse> {
  const { productId } = await context.params;

  return handleMutation(request, parseTransition, (sessionMaterial, body) =>
    transitionProduct(sessionMaterial, productId, 'publish', body.expectedVersion),
  );
}
