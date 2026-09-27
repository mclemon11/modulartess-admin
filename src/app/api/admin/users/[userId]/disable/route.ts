import 'server-only';

/** `POST /api/admin/users/{userId}/disable`: deshabilitar la cuenta y revocar sus sesiones. Con `expectedVersion` y clave. */

import type { NextRequest, NextResponse } from 'next/server';

import { handleMutation, mutationError } from '@/features/session/mutation-route';
import { isUserId, parseUserTransition } from '@/features/users/user-input';
import { transitionAdminUser } from '@/lib/api/admin-users';

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly userId: string }> },
): Promise<NextResponse> {
  const { userId } = await context.params;

  if (!isUserId(userId)) return mutationError('not_found');

  return handleMutation(request, parseUserTransition, (sessionMaterial, input) =>
    transitionAdminUser(
      sessionMaterial,
      userId,
      'disable',
      input.idempotencyKey,
      input.expectedVersion,
    ),
  );
}
