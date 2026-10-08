import 'server-only';

/**
 * Edición controlada del pedido: estado, notas internas y productos (ADR 0013).
 *
 * El BFF solo comprueba la forma del cuerpo. Precios, envío, totales, transiciones, pagos y permisos
 * los decide el backend, que rechaza cualquier petición fabricada a mano.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseOrderEdit } from '@/features/panel/order-edit';
import { handleMutation } from '@/features/session/mutation-route';
import { editOrder } from '@/lib/api/orders';

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly orderId: string }> },
): Promise<NextResponse> {
  const { orderId } = await context.params;

  return handleMutation(request, parseOrderEdit, (sessionMaterial, body) =>
    editOrder(sessionMaterial, orderId, body, { preview: false }),
  );
}
