import 'server-only';

/**
 * Ficha de un pedido a través del BFF.
 *
 * Devuelve la instantánea completa que guarda el backend —líneas, cliente, dirección, totales e
 * historial—. El panel no vuelve a leer el catálogo para reconstruir nada.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { handleQuery } from '@/features/session/query-route';
import { getOrder } from '@/lib/api/orders';

export async function GET(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly orderId: string }> },
): Promise<NextResponse> {
  const { orderId } = await context.params;

  return handleQuery(request, (sessionMaterial) => getOrder(sessionMaterial, orderId));
}
