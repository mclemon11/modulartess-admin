import 'server-only';

/**
 * Edición de una variante: sus atributos o su precio. Exige `products.update`.
 *
 * El SKU y el stock no viajan por aquí: el contrato hace el SKU inmutable y mueve el stock solo
 * mediante un ajuste de inventario, que además es idempotente.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseUpdateVariant } from '@/features/panel/product-input';
import { handleMutation } from '@/features/session/mutation-route';
import { updateProductVariant } from '@/lib/api/catalog';

export async function PATCH(
  request: NextRequest,
  context: {
    readonly params: Promise<{ readonly productId: string; readonly variantId: string }>;
  },
): Promise<NextResponse> {
  const { productId, variantId } = await context.params;

  return handleMutation(request, parseUpdateVariant, (sessionMaterial, body) =>
    updateProductVariant(sessionMaterial, productId, variantId, body),
  );
}
