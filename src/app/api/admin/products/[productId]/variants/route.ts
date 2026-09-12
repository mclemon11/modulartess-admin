import 'server-only';

/**
 * Alta de una variante a través del BFF.
 *
 * `expectedVersion` es la del **producto**: el contrato trata la colección de variantes como parte
 * de él y devuelve el producto completo con su versión nueva. Por eso las altas van en serie desde
 * el cliente, y por eso un `409` significa «alguien tocó el producto», no «esta variante ya
 * existe».
 *
 * Crear una variante exige `products.create`, el mismo permiso que crear un producto. El panel
 * oculta la acción a quien no lo tiene, pero la autoridad es el backend.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseCreateVariant } from '@/features/panel/product-input';
import { handleMutation } from '@/features/session/mutation-route';
import { createProductVariant } from '@/lib/api/catalog';

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly productId: string }> },
): Promise<NextResponse> {
  const { productId } = await context.params;

  return handleMutation(
    request,
    parseCreateVariant,
    (sessionMaterial, body) => createProductVariant(sessionMaterial, productId, body),
    201,
  );
}
