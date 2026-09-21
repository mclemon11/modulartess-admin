import 'server-only';

/**
 * Cierre de una incidencia de pago.
 *
 * `expectedVersion` viaja siempre: dos administradores mirando la misma bandeja podrían cerrarla
 * con motivos distintos, y sin la versión el segundo pisaría al primero sin que nadie lo notara.
 *
 * El motivo sale de un vocabulario cerrado que valida `parseIncidentResolution`. **No se acepta
 * texto libre**, ni siquiera vacío: el contrato no lo admite, y una nota acabaría guardando el
 * correo de quien pagó o un fragmento de la respuesta del proveedor.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseIncidentResolution } from '@/features/panel/integration-input';
import { handleMutation } from '@/features/session/mutation-route';
import { resolvePaymentIncident } from '@/lib/api/payment-incidents';

export async function PATCH(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly incidentId: string }> },
): Promise<NextResponse> {
  const { incidentId } = await context.params;

  return handleMutation(request, parseIncidentResolution, (sessionMaterial, body) =>
    resolvePaymentIncident(sessionMaterial, incidentId, body),
  );
}
