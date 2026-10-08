import 'server-only';

/**
 * Vista previa de la edición: el backend aplica todas las comprobaciones y calcula los importes,
 * pero **no guarda nada**. Es lo que el panel enseña como resumen antes de confirmar.
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
    editOrder(sessionMaterial, orderId, body, { preview: true }),
  );
}
