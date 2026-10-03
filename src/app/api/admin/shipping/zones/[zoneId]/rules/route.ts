import 'server-only';

/**
 * `GET /api/admin/shipping/zones/{zoneId}/rules`: reglas de la zona, activas y archivadas.
 * `POST /api/admin/shipping/zones/{zoneId}/rules`: crear una regla con su tarifa y su alcance.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { isShippingId, parseRuleCreate } from '@/features/shipping/shipping-input';
import { handleMutation, mutationError } from '@/features/session/mutation-route';
import { handleQuery, queryError } from '@/features/session/query-route';
import { createRule, listRules } from '@/lib/api/shipping';

type Context = { readonly params: Promise<{ readonly zoneId: string }> };

export async function GET(request: NextRequest, context: Context): Promise<NextResponse> {
  const { zoneId } = await context.params;

  if (!isShippingId(zoneId)) return queryError('shipping_zone_not_found');

  return handleQuery(request, (sessionMaterial) => listRules(sessionMaterial, zoneId));
}

export async function POST(request: NextRequest, context: Context): Promise<NextResponse> {
  const { zoneId } = await context.params;

  if (!isShippingId(zoneId)) return mutationError('shipping_zone_not_found');

  return handleMutation(
    request,
    parseRuleCreate,
    (sessionMaterial, body) => createRule(sessionMaterial, zoneId, body),
    201,
  );
}
