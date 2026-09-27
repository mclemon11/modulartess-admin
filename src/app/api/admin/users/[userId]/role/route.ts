import 'server-only';

/** `PATCH /api/admin/users/{userId}/role`: cambiar el rol, con `expectedVersion` y clave. */

import type { NextRequest, NextResponse } from 'next/server';

import { handleMutation, mutationError } from '@/features/session/mutation-route';
import { isUserId, parseChangeRole } from '@/features/users/user-input';
import { changeAdminUserRole } from '@/lib/api/admin-users';

export async function PATCH(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly userId: string }> },
): Promise<NextResponse> {
  const { userId } = await context.params;

  if (!isUserId(userId)) return mutationError('not_found');

  return handleMutation(request, parseChangeRole, (sessionMaterial, input) =>
    changeAdminUserRole(sessionMaterial, userId, input.idempotencyKey, {
      expectedVersion: input.expectedVersion,
      role: input.role,
    }),
  );
}
