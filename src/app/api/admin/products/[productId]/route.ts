import 'server-only';

/**
 * Edición de un producto. `expectedVersion` es obligatorio y un `409` significa que alguien lo
 * modificó entre la lectura y el envío: se conserva ese estado para que la pantalla pueda ofrecer
 * recargar en lugar de pisar el cambio ajeno.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseUpdateProduct } from '@/features/panel/product-input';
import { handleMutation } from '@/features/session/mutation-route';
import { updateProduct } from '@/lib/api/catalog';

export async function PATCH(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly productId: string }> },
): Promise<NextResponse> {
  const { productId } = await context.params;

  return handleMutation(request, parseUpdateProduct, (sessionMaterial, body) =>
    updateProduct(sessionMaterial, productId, body),
  );
}
