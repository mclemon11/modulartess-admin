import 'server-only';

/**
 * `GET /api/admin/shipping/products/{productId}/relations?pageToken=`: relaciones del producto con
 * las zonas, directas y heredadas, paginadas por el backend.
 * `POST /api/admin/shipping/products/{productId}/relations`: asignar o retirar **solo relaciones
 * directas**, con la versión de cada regla y una `Idempotency-Key` que genera el navegador.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { isShippingId, parseRelationChanges } from '@/features/shipping/shipping-input';
import { handleMutation, mutationError } from '@/features/session/mutation-route';
import { handleQuery, queryError } from '@/features/session/query-route';
import { changeProductRelations, listProductRelations } from '@/lib/api/shipping';

type Context = { readonly params: Promise<{ readonly productId: string }> };

export async function GET(request: NextRequest, context: Context): Promise<NextResponse> {
  const { productId } = await context.params;
  const pageToken = request.nextUrl.searchParams.get('pageToken') ?? '';

  if (!isShippingId(productId)) return queryError('shipping_product_not_found');

  return handleQuery(request, (sessionMaterial) =>
    listProductRelations(sessionMaterial, productId, pageToken === '' ? undefined : pageToken),
  );
}

export async function POST(request: NextRequest, context: Context): Promise<NextResponse> {
  const { productId } = await context.params;

  if (!isShippingId(productId)) return mutationError('shipping_product_not_found');

  return handleMutation(request, parseRelationChanges, (sessionMaterial, input) =>
    changeProductRelations(sessionMaterial, productId, input.idempotencyKey, input.changes),
  );
}
