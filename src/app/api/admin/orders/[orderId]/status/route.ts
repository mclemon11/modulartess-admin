import 'server-only';

/**
 * Transición operativa del pedido.
 *
 * El panel solo ofrece la transición que el backend admite desde el estado actual, pero eso es
 * usabilidad: la autoridad es el backend, que rechaza la petición si el rol, el estado o la versión
 * no la permiten aunque llegue fabricada a mano.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseOrderStatusChange } from '@/features/panel/order-input';
import { handleMutation } from '@/features/session/mutation-route';
import { changeOrderStatus } from '@/lib/api/orders';

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly orderId: string }> },
): Promise<NextResponse> {
  const { orderId } = await context.params;

  return handleMutation(request, parseOrderStatusChange, (sessionMaterial, body) =>
    changeOrderStatus(sessionMaterial, orderId, body),
  );
}
