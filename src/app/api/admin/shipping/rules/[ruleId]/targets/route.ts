import 'server-only';

/**
 * `GET /api/admin/shipping/rules/{ruleId}/targets?pageToken=`: una página de asignaciones de la regla.
 * `POST /api/admin/shipping/rules/{ruleId}/targets`: asignar y retirar en bloque, con la versión
 * de la regla y una `Idempotency-Key` que genera el navegador. Cada elemento vuelve con su
 * desenlace; los que fallan no impiden los demás.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { isShippingId, parseTargets } from '@/features/shipping/shipping-input';
import { handleMutation, mutationError } from '@/features/session/mutation-route';
import { handleQuery, queryError } from '@/features/session/query-route';
import { changeTargets, listTargets } from '@/lib/api/shipping';

type Context = { readonly params: Promise<{ readonly ruleId: string }> };

export async function GET(request: NextRequest, context: Context): Promise<NextResponse> {
  const { ruleId } = await context.params;

  if (!isShippingId(ruleId)) return queryError('shipping_rule_not_found');

  const pageToken = request.nextUrl.searchParams.get('pageToken') ?? '';

  if (pageToken.length > 512) return queryError('invalid_request');

  return handleQuery(request, (sessionMaterial) =>
    listTargets(sessionMaterial, ruleId, pageToken === '' ? undefined : pageToken),
  );
}

export async function POST(request: NextRequest, context: Context): Promise<NextResponse> {
  const { ruleId } = await context.params;

  if (!isShippingId(ruleId)) return mutationError('shipping_rule_not_found');

  return handleMutation(request, parseTargets, (sessionMaterial, input) =>
    changeTargets(sessionMaterial, ruleId, input.idempotencyKey, {
      expectedVersion: input.expectedVersion,
      add: input.add,
      remove: input.remove,
    }),
  );
}
