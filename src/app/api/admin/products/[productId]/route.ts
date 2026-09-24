import 'server-only';

/**
 * Edición de un producto. `expectedVersion` es obligatorio y un `409` significa que alguien lo
 * modificó entre la lectura y el envío: se conserva ese estado para que la pantalla pueda ofrecer
 * recargar en lugar de pisar el cambio ajeno.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseUpdateProduct } from '@/features/panel/product-input';
import { handleMutation } from '@/features/session/mutation-route';
import { handleQuery } from '@/features/session/query-route';
import { getProduct, updateProduct } from '@/lib/api/catalog';

/**
 * Relee el producto con la sesión de la persona.
 *
 * Lo usa la recuperación del alta tras un `product_version_conflict`: en lugar de reintentar con la
 * versión vieja —que volvería a fallar— o con una nueva a ciegas —que pisaría el cambio ajeno—, se
 * relee y se enseña. Solo lectura: no toca nada.
 */
export async function GET(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly productId: string }> },
): Promise<NextResponse> {
  const { productId } = await context.params;

  return handleQuery(request, (sessionMaterial) => getProduct(sessionMaterial, productId));
}

export async function PATCH(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly productId: string }> },
): Promise<NextResponse> {
  const { productId } = await context.params;

  return handleMutation(request, parseUpdateProduct, (sessionMaterial, body) =>
    updateProduct(sessionMaterial, productId, body),
  );
}
