import 'server-only';

/**
 * Elimina un video. Sale de la tienda de inmediato y sus objetos se borran después; repetirlo es
 * inocuo. La interfaz pide confirmación antes de llamar.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseTransition } from '@/features/panel/product-input';
import { handleMutation } from '@/features/session/mutation-route';
import { deleteProductVideo } from '@/lib/api/catalog';

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly productId: string; readonly videoId: string }> },
): Promise<NextResponse> {
  const { productId, videoId } = await context.params;

  return handleMutation(request, parseTransition, (sessionMaterial, body) =>
    deleteProductVideo(sessionMaterial, productId, videoId, body.expectedVersion),
  );
}
