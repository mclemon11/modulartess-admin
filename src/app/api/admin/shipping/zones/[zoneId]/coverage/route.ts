import 'server-only';

/**
 * `GET /api/admin/shipping/zones/{zoneId}/coverage`: todas las entradas de cobertura.
 * `POST /api/admin/shipping/zones/{zoneId}/coverage`: añadir y quitar entradas, por código
 * DIVIPOLA, con `expectedVersion` y como mucho 400 de cada.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { isShippingId, parseCoverageUpdate } from '@/features/shipping/shipping-input';
import { handleMutation, mutationError } from '@/features/session/mutation-route';
import { handleQuery, queryError } from '@/features/session/query-route';
import { changeCoverage, listAllCoverage } from '@/lib/api/shipping';

type Context = { readonly params: Promise<{ readonly zoneId: string }> };

export async function GET(request: NextRequest, context: Context): Promise<NextResponse> {
  const { zoneId } = await context.params;

  if (!isShippingId(zoneId)) return queryError('shipping_zone_not_found');

  return handleQuery(request, (sessionMaterial) => listAllCoverage(sessionMaterial, zoneId));
}

export async function POST(request: NextRequest, context: Context): Promise<NextResponse> {
  const { zoneId } = await context.params;

  if (!isShippingId(zoneId)) return mutationError('shipping_zone_not_found');

  return handleMutation(request, parseCoverageUpdate, (sessionMaterial, body) =>
    changeCoverage(sessionMaterial, zoneId, body),
  );
}
