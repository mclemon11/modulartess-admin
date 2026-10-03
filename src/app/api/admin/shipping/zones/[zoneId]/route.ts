import 'server-only';

/**
 * `GET /api/admin/shipping/zones/{zoneId}`: leer una zona (recargar tras un conflicto).
 * `PATCH /api/admin/shipping/zones/{zoneId}`: editarla, con `expectedVersion`.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { isShippingId, parseZoneUpdate } from '@/features/shipping/shipping-input';
import { handleMutation, mutationError } from '@/features/session/mutation-route';
import { handleQuery, queryError } from '@/features/session/query-route';
import { getZone, updateZone } from '@/lib/api/shipping';

type Context = { readonly params: Promise<{ readonly zoneId: string }> };

export async function GET(request: NextRequest, context: Context): Promise<NextResponse> {
  const { zoneId } = await context.params;

  if (!isShippingId(zoneId)) return queryError('shipping_zone_not_found');

  return handleQuery(request, (sessionMaterial) => getZone(sessionMaterial, zoneId));
}

export async function PATCH(request: NextRequest, context: Context): Promise<NextResponse> {
  const { zoneId } = await context.params;

  if (!isShippingId(zoneId)) return mutationError('shipping_zone_not_found');

  return handleMutation(request, parseZoneUpdate, (sessionMaterial, body) =>
    updateZone(sessionMaterial, zoneId, body),
  );
}
