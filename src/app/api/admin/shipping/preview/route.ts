import 'server-only';

/**
 * `POST /api/admin/shipping/preview`: vista previa de la resolución para un destino y un carrito.
 *
 * No crea pedidos ni modifica datos: el contrato dice «Creates nothing». Es un `POST` porque lleva
 * un cuerpo, y por eso pasa por la misma frontera de `Origin` que cualquier mutación.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parsePreview } from '@/features/shipping/shipping-input';
import { handleMutation } from '@/features/session/mutation-route';
import { previewShipping } from '@/lib/api/shipping';

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleMutation(request, parsePreview, previewShipping);
}
