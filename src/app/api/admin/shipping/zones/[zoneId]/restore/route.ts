import 'server-only';

/**
 * `POST /api/admin/shipping/zones/{zoneId}/restore`: restaurar una zona archivada **como borrador**.
 * Nunca la deja activa. Con `expectedVersion`.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { isShippingId, parseVersioned } from '@/features/shipping/shipping-input';
import { handleMutation, mutationError } from '@/features/session/mutation-route';
import { transitionZone } from '@/lib/api/shipping';

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly zoneId: string }> },
): Promise<NextResponse> {
  const { zoneId } = await context.params;

  if (!isShippingId(zoneId)) return mutationError('shipping_zone_not_found');

  return handleMutation(request, parseVersioned, (sessionMaterial, body) =>
    transitionZone(sessionMaterial, zoneId, 'restore', body.expectedVersion),
  );
}
