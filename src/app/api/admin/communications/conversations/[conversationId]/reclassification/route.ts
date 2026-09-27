import 'server-only';

/** `POST /api/admin/communications/conversations/{id}/reclassification`: mover una conversación de revisión a una cola. Solo `super_admin`. */

import type { NextRequest, NextResponse } from 'next/server';

import { isResourceId, parseReclassify } from '@/features/inbox/inbox-input';
import { handleMutation, mutationError } from '@/features/session/mutation-route';
import { reclassifyConversation } from '@/lib/api/communications';

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly conversationId: string }> },
): Promise<NextResponse> {
  const { conversationId } = await context.params;

  if (!isResourceId(conversationId)) return mutationError('not_found');

  return handleMutation(request, parseReclassify, (sessionMaterial, body) =>
    reclassifyConversation(sessionMaterial, conversationId, body),
  );
}
