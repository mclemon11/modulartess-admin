import 'server-only';

/**
 * Ajuste de inventario.
 *
 * La `Idempotency-Key` la genera el cliente y viaja en el cuerpo; aquí se traslada al encabezado
 * `Idempotency-Key` que exige el contrato. Reenviar la misma clave en un reintento hace que el
 * backend responda `replayed: true` en vez de aplicar el delta dos veces, que es justo lo que se
 * quiere cuando la red falla después de que el ajuste ya se aplicó.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseInventoryAdjustment } from '@/features/panel/product-input';
import { handleMutation } from '@/features/session/mutation-route';
import { adjustInventory } from '@/lib/api/catalog';

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly productId: string }> },
): Promise<NextResponse> {
  const { productId } = await context.params;

  return handleMutation(request, parseInventoryAdjustment, (sessionMaterial, input) =>
    adjustInventory(sessionMaterial, productId, input.idempotencyKey, {
      expectedVersion: input.expectedVersion,
      delta: input.delta,
      reason: input.reason,
    }),
  );
}
