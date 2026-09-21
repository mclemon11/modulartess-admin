import 'server-only';

/**
 * Inventario del producto base: **se establece**, no se ajusta.
 *
 * La diferencia con `inventory-adjustments` no es de estilo. Ahí se manda una diferencia («entran
 * 7») y el resultado depende de lo que hubiera; aquí se manda el estado final («hay 15») y el
 * resultado es el que se escribió. Con `expectedVersion` de por medio, lo segundo es verificable y
 * lo primero no del todo: dos deltas concurrentes se suman, dos totales no se pueden confundir.
 *
 * La `Idempotency-Key` llega en el cuerpo y sale en el encabezado que exige el contrato. El
 * cliente la conserva durante el reintento de **la misma** operación, así que un segundo intento
 * tras un fallo de red devuelve `replayed: true` en lugar de escribir otra vez.
 *
 * El cuerpo se construye campo a campo en `parseSetInventoryInput`: aquí no se reenvía nada de lo
 * que llegó del navegador sin pasar por ahí.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseSetInventoryInput } from '@/features/panel/product-input';
import { handleMutation } from '@/features/session/mutation-route';
import { setProductInventory } from '@/lib/api/catalog';

export async function PUT(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly productId: string }> },
): Promise<NextResponse> {
  const { productId } = await context.params;

  return handleMutation(request, parseSetInventoryInput, (sessionMaterial, input) =>
    setProductInventory(sessionMaterial, productId, input.idempotencyKey, {
      expectedVersion: input.body.expectedVersion,
      inventory: input.body.inventory,
    }),
  );
}
