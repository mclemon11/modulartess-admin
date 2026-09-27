import 'server-only';

/** `POST /api/admin/communications/conversations/{id}/replies`: responder desde el alias de la cola, con `Idempotency-Key`. */

import type { NextRequest, NextResponse } from 'next/server';

import { isResourceId, parseReply } from '@/features/inbox/inbox-input';
import { handleMutation, mutationError } from '@/features/session/mutation-route';
import { replyToConversation } from '@/lib/api/communications';

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly conversationId: string }> },
): Promise<NextResponse> {
  const { conversationId } = await context.params;

  if (!isResourceId(conversationId)) return mutationError('not_found');

  // 201: la respuesta queda en cola; el estado de entrega llega después.
  return handleMutation(
    request,
    parseReply,
    (sessionMaterial, body) =>
      replyToConversation(sessionMaterial, conversationId, body.idempotencyKey, {
        expectedVersion: body.expectedVersion,
        text: body.text,
      }),
    201,
  );
}
