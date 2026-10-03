import 'server-only';

/** `POST /api/admin/shipping/rules/{ruleId}/archive`: archivar una regla. Definitivo. */

import type { NextRequest, NextResponse } from 'next/server';

import { isShippingId, parseVersioned } from '@/features/shipping/shipping-input';
import { handleMutation, mutationError } from '@/features/session/mutation-route';
import { archiveRule } from '@/lib/api/shipping';

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly ruleId: string }> },
): Promise<NextResponse> {
  const { ruleId } = await context.params;

  if (!isShippingId(ruleId)) return mutationError('shipping_rule_not_found');

  return handleMutation(request, parseVersioned, (sessionMaterial, body) =>
    archiveRule(sessionMaterial, ruleId, body.expectedVersion),
  );
}
