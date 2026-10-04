import 'server-only';

/** Orden conjunto de la galería: todas las imágenes y videos activos, cada uno una vez. */

import type { NextRequest, NextResponse } from 'next/server';

import { parseReorderMedia } from '@/features/panel/product-input';
import { handleMutation } from '@/features/session/mutation-route';
import { reorderProductMedia } from '@/lib/api/catalog';

export async function PUT(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly productId: string }> },
): Promise<NextResponse> {
  const { productId } = await context.params;

  return handleMutation(request, parseReorderMedia, (sessionMaterial, body) =>
    reorderProductMedia(sessionMaterial, productId, body),
  );
}
