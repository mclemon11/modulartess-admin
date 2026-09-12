import 'server-only';

/**
 * Ajuste de inventario de una variante. Exige `inventory.adjust`: el mismo permiso que el ajuste
 * base, sin ningún rol nuevo.
 *
 * La `Idempotency-Key` la genera el cliente y viaja en el cuerpo; aquí se traslada al encabezado
 * que exige el contrato. Reenviar la misma clave en un reintento hace que el backend responda
 * `replayed: true` en vez de aplicar el delta dos veces.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseInventoryAdjustment } from '@/features/panel/product-input';
import { handleMutation } from '@/features/session/mutation-route';
import { adjustVariantInventory } from '@/lib/api/catalog';

export async function POST(
  request: NextRequest,
  context: {
    readonly params: Promise<{ readonly productId: string; readonly variantId: string }>;
  },
): Promise<NextResponse> {
  const { productId, variantId } = await context.params;

  return handleMutation(request, parseInventoryAdjustment, (sessionMaterial, input) =>
    adjustVariantInventory(sessionMaterial, productId, variantId, input.idempotencyKey, {
      expectedVersion: input.expectedVersion,
      delta: input.delta,
      reason: input.reason,
    }),
  );
}
