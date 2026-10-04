import 'server-only';

/** Póster de un video: una imagen, con los límites de imagen. El backend valida su firma real. */

import type { NextRequest, NextResponse } from 'next/server';

import { handleMultipartUpload, multipartFailure } from '@/features/session/multipart-route';
import { uploadProductVideoPoster } from '@/lib/api/catalog';
import { IMAGE_MAX_BYTES } from '@/lib/api/image-limits';

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly productId: string; readonly videoId: string }> },
): Promise<NextResponse> {
  const { productId, videoId } = await context.params;

  return handleMultipartUpload(request, {
    maxFileBytes: IMAGE_MAX_BYTES,
    fileProblem: () => multipartFailure('video_invalid', 'poster_invalid'),
    requireIdempotencyKey: false,
    textFields: {},
    run: ({ sessionMaterial, form }) =>
      uploadProductVideoPoster(sessionMaterial, productId, videoId, form),
  });
}
