import 'server-only';

/**
 * Subida de un video MP4 a la galería a través del BFF.
 *
 * El BFF comprueba origen, sesión, clave de idempotencia, tamaño y título; el contenedor real lo
 * inspecciona el backend. El archivo se reenvía tal cual: el panel nunca habla con Cloud Storage.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { handleMultipartUpload, multipartFailure } from '@/features/session/multipart-route';
import { uploadProductVideo } from '@/lib/api/catalog';
import { VIDEO_MAX_BYTES, VIDEO_TITLE_MAX_LENGTH } from '@/lib/api/video-limits';

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly productId: string }> },
): Promise<NextResponse> {
  const { productId } = await context.params;

  return handleMultipartUpload(request, {
    maxFileBytes: VIDEO_MAX_BYTES,
    fileProblem: (problem) =>
      multipartFailure('video_invalid', problem === 'empty' ? 'video_empty' : 'video_too_large'),
    requireIdempotencyKey: true,
    textFields: {
      title: (value) => {
        const title = value.trim();
        return title.length === 0 || title.length > VIDEO_TITLE_MAX_LENGTH ? null : title;
      },
    },
    run: ({ sessionMaterial, idempotencyKey, form }) =>
      uploadProductVideo(sessionMaterial, productId, idempotencyKey ?? '', form),
  });
}
