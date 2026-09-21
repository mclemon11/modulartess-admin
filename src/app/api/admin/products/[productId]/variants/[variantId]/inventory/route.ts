import 'server-only';

/**
 * Inventario de una variante: **se establece**, con las mismas garantías que el del producto base.
 *
 * `expectedVersion` es la versión del **producto**, no la de la variante: el contrato versiona el
 * producto entero, y por eso dos ediciones sobre variantes distintas del mismo producto también se
 * detectan como conflicto en lugar de pisarse.
 *
 * El precio y los atributos siguen viajando por el `PATCH` de la variante. El inventario tiene su
 * propia ruta porque es su propia operación: cambiar «quedan 3» no debería arrastrar consigo el
 * precio que otra persona acaba de corregir.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseSetInventoryInput } from '@/features/panel/product-input';
import { handleMutation } from '@/features/session/mutation-route';
import { setVariantInventory } from '@/lib/api/catalog';

export async function PUT(
  request: NextRequest,
  context: {
    readonly params: Promise<{ readonly productId: string; readonly variantId: string }>;
  },
): Promise<NextResponse> {
  const { productId, variantId } = await context.params;

  return handleMutation(request, parseSetInventoryInput, (sessionMaterial, input) =>
    setVariantInventory(sessionMaterial, productId, variantId, input.idempotencyKey, {
      expectedVersion: input.body.expectedVersion,
      inventory: input.body.inventory,
    }),
  );
}
