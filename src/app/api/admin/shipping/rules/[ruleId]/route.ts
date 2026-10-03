import 'server-only';

/**
 * `GET /api/admin/shipping/rules/{ruleId}`: leer una regla.
 * `PATCH /api/admin/shipping/rules/{ruleId}`: editar nombre, tarifa o tránsito. El alcance es
 * inmutable, así que no se admite en el cuerpo.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { isShippingId, parseRuleUpdate } from '@/features/shipping/shipping-input';
import { handleMutation, mutationError } from '@/features/session/mutation-route';
import { handleQuery, queryError } from '@/features/session/query-route';
import { getRule, updateRule } from '@/lib/api/shipping';

type Context = { readonly params: Promise<{ readonly ruleId: string }> };

export async function GET(request: NextRequest, context: Context): Promise<NextResponse> {
  const { ruleId } = await context.params;

  if (!isShippingId(ruleId)) return queryError('shipping_rule_not_found');

  return handleQuery(request, (sessionMaterial) => getRule(sessionMaterial, ruleId));
}

export async function PATCH(request: NextRequest, context: Context): Promise<NextResponse> {
  const { ruleId } = await context.params;

  if (!isShippingId(ruleId)) return mutationError('shipping_rule_not_found');

  return handleMutation(request, parseRuleUpdate, (sessionMaterial, body) =>
    updateRule(sessionMaterial, ruleId, body),
  );
}
