import 'server-only';

/**
 * Compra de prueba con Meta.
 *
 * Un único parámetro: el código de «Probar eventos». El backend envía un `Purchase` con el token
 * guardado; Meta lo muestra solo en esa pestaña y nunca lo cuenta como conversión. Exige
 * `integrations.manage` porque es una llamada saliente.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseMetaTest } from '@/features/panel/integration-input';
import { handleMutation } from '@/features/session/mutation-route';
import { testMetaConnection } from '@/lib/api/integrations';

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleMutation(request, parseMetaTest, (sessionMaterial, body) =>
    testMetaConnection(sessionMaterial, body),
  );
}
