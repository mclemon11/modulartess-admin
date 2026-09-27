import 'server-only';

/** `POST /api/admin/communications/conversations/{id}/status`: cambiar el estado, con `expectedVersion`. */

import type { NextRequest, NextResponse } from 'next/server';

import { isResourceId, parseStatus } from '@/features/inbox/inbox-input';
import { handleMutation, mutationError } from '@/features/session/mutation-route';
import { setConversationStatus } from '@/lib/api/communications';

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly conversationId: string }> },
): Promise<NextResponse> {
  const { conversationId } = await context.params;

  if (!isResourceId(conversationId)) return mutationError('not_found');

  return handleMutation(request, parseStatus, (sessionMaterial, body) =>
    setConversationStatus(sessionMaterial, conversationId, body),
  );
}
