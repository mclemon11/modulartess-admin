import 'server-only';

/**
 * `POST /api/admin/communications/conversations/{id}/assignment`.
 *
 * El navegador pide «a mí» o «a nadie»: no conoce ningún UID, ni el propio. El BFF resuelve el de
 * la sesión verificada y es el backend quien decide si esa cuenta puede recibir la conversación.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { isResourceId, parseAssign } from '@/features/inbox/inbox-input';
import { handleMutation, mutationError } from '@/features/session/mutation-route';
import { verifyAdminSession } from '@/lib/api/backend-client';
import { assignConversation } from '@/lib/api/communications';

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly conversationId: string }> },
): Promise<NextResponse> {
  const { conversationId } = await context.params;

  if (!isResourceId(conversationId)) return mutationError('not_found');

  return handleMutation(request, parseAssign, async (sessionMaterial, body) => {
    const assignedAdminId =
      body.assignee === 'me' ? (await verifyAdminSession(sessionMaterial)).uid : null;

    return assignConversation(sessionMaterial, conversationId, {
      expectedVersion: body.expectedVersion,
      assignedAdminId,
    });
  });
}
