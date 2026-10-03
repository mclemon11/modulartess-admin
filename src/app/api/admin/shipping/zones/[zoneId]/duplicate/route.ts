import 'server-only';

/**
 * `POST /api/admin/shipping/zones/{zoneId}/duplicate`: copiar una zona como borrador nuevo.
 *
 * El navegador manda la clave que generó; el BFF la pasa al encabezado `Idempotency-Key`. La
 * respuesta es el recurso tipado de la operación de copia con el mismo código que el backend:
 * `201` lista, `202` copiando o fallida, `200` descartada. Un fallo anterior a la operación es el
 * error normal, sin identificador.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { isShippingId, parseDuplicate } from '@/features/shipping/shipping-input';
import { handleMutation, mutationError } from '@/features/session/mutation-route';
import { duplicateZone } from '@/lib/api/shipping';

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly zoneId: string }> },
): Promise<NextResponse> {
  const { zoneId } = await context.params;

  if (!isShippingId(zoneId)) return mutationError('shipping_zone_not_found');

  let status = 200;

  return handleMutation(
    request,
    parseDuplicate,
    async (sessionMaterial, input) => {
      const result = await duplicateZone(sessionMaterial, zoneId, input.idempotencyKey, {
        expectedVersion: input.expectedVersion,
        ...(input.name === undefined ? {} : { name: input.name }),
      });

      status = result.status;

      return result.operation;
    },
    () => status,
  );
}
