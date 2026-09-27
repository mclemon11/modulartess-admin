import 'server-only';

/** `POST /api/admin/communications/conversations/{id}/read`: marcar como leída. */

import type { NextRequest, NextResponse } from 'next/server';

import { isResourceId, parseMarkRead } from '@/features/inbox/inbox-input';
import { handleMutation, mutationError } from '@/features/session/mutation-route';
import { markConversationRead } from '@/lib/api/communications';

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly conversationId: string }> },
): Promise<NextResponse> {
  const { conversationId } = await context.params;

  if (!isResourceId(conversationId)) return mutationError('not_found');

  return handleMutation(request, parseMarkRead, (sessionMaterial) =>
    markConversationRead(sessionMaterial, conversationId),
  );
}
