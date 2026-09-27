import 'server-only';

/**
 * Descarga de un adjunto, desde el bucket privado a través del backend.
 *
 * No hay URL pública ni firmada: los bytes pasan por aquí con la sesión de la persona, y el
 * backend comprueba el permiso y audita la descarga. Siempre como descarga —nunca en línea— y con
 * `nosniff`, para que el navegador no interprete un PDF o una imagen como otra cosa.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { safeContentType, safeDisposition } from '@/features/inbox/attachment-headers';
import { isResourceId } from '@/features/inbox/inbox-input';
import { queryError } from '@/features/session/query-route';
import { sessionErrorFromBackendFailure } from '@/features/session/api-errors';
import { SESSION_COOKIE_NAME } from '@/features/session/session-cookie';
import { downloadAttachment } from '@/lib/api/communications';
import { isBackendFailure } from '@/lib/api/errors';

export async function GET(
  request: NextRequest,
  context: {
    readonly params: Promise<{
      readonly conversationId: string;
      readonly messageId: string;
      readonly attachmentId: string;
    }>;
  },
): Promise<NextResponse> {
  const ids = await context.params;

  if (![ids.conversationId, ids.messageId, ids.attachmentId].every(isResourceId)) {
    return queryError('not_found');
  }

  const sessionMaterial = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (sessionMaterial === undefined || sessionMaterial.length === 0) {
    return queryError('session_required');
  }

  try {
    const file = await downloadAttachment(sessionMaterial, ids);

    return new NextResponse(file.bytes, {
      status: 200,
      headers: {
        'Content-Type': safeContentType(file.contentType),
        'Content-Disposition': safeDisposition(file.contentDisposition),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return isBackendFailure(error)
      ? queryError(sessionErrorFromBackendFailure(error.code), error.reference)
      : queryError('internal_error');
  }
}
