import 'server-only';

/**
 * Cancelación del pedido.
 *
 * El panel oculta la acción a `moderator` y solo la ofrece sobre `pending_payment`, pero el backend
 * vuelve a comprobar las dos cosas. Un pedido pagado responde `order_cancellation_requires_refund`,
 * que el panel traduce a una explicación en lugar de a un error genérico.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseOrderCancel } from '@/features/panel/order-input';
import { handleMutation } from '@/features/session/mutation-route';
import { cancelOrder } from '@/lib/api/orders';

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly orderId: string }> },
): Promise<NextResponse> {
  const { orderId } = await context.params;

  return handleMutation(request, parseOrderCancel, (sessionMaterial, body) =>
    cancelOrder(sessionMaterial, orderId, body),
  );
}
