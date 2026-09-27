import 'server-only';

/** `POST /api/admin/communications/conversations/{id}/order-link`: enlace informativo a un pedido. No cambia el pedido. */

import type { NextRequest, NextResponse } from 'next/server';

import { isResourceId, parseOrderLink } from '@/features/inbox/inbox-input';
import { handleMutation, mutationError } from '@/features/session/mutation-route';
import { linkConversationOrder } from '@/lib/api/communications';

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly conversationId: string }> },
): Promise<NextResponse> {
  const { conversationId } = await context.params;

  if (!isResourceId(conversationId)) return mutationError('not_found');

  return handleMutation(request, parseOrderLink, (sessionMaterial, body) =>
    linkConversationOrder(sessionMaterial, conversationId, body),
  );
}
