import 'server-only';

/** Título o posición en la galería de un video. */

import type { NextRequest, NextResponse } from 'next/server';

import { parseUpdateProductVideo } from '@/features/panel/product-input';
import { handleMutation } from '@/features/session/mutation-route';
import { updateProductVideo } from '@/lib/api/catalog';

export async function PATCH(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly productId: string; readonly videoId: string }> },
): Promise<NextResponse> {
  const { productId, videoId } = await context.params;

  return handleMutation(request, parseUpdateProductVideo, (sessionMaterial, body) =>
    updateProductVideo(sessionMaterial, productId, videoId, body),
  );
}
