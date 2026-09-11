import 'server-only';

/**
 * Archiva una imagen.
 *
 * Sale de la proyección pública de inmediato, pero **el objeto no se borra**: su URL pública sigue
 * funcionando para quien ya la tenga. La interfaz lo advierte antes de archivar.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseTransition } from '@/features/panel/product-input';
import { handleMutation } from '@/features/session/mutation-route';
import { archiveProductImage } from '@/lib/api/catalog';

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly productId: string; readonly imageId: string }> },
): Promise<NextResponse> {
  const { productId, imageId } = await context.params;

  return handleMutation(request, parseTransition, (sessionMaterial, body) =>
    archiveProductImage(sessionMaterial, productId, imageId, body.expectedVersion),
  );
}
