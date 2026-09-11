import 'server-only';

/**
 * Edición de una imagen: texto alternativo, posición o designarla como principal.
 *
 * `isPrimary` solo acepta `true`. El contrato cambia la principal designando otra, nunca quitando
 * la marca a la actual, así que enviar `false` no tiene significado.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseUpdateProductImage } from '@/features/panel/product-input';
import { handleMutation } from '@/features/session/mutation-route';
import { updateProductImage } from '@/lib/api/catalog';

export async function PATCH(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly productId: string; readonly imageId: string }> },
): Promise<NextResponse> {
  const { productId, imageId } = await context.params;

  return handleMutation(request, parseUpdateProductImage, (sessionMaterial, body) =>
    updateProductImage(sessionMaterial, productId, imageId, body),
  );
}
