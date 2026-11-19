import 'server-only';

/**
 * Compra de prueba con TikTok.
 *
 * Un único parámetro: el código de «Eventos de prueba». El backend envía un `CompletePayment` con
 * el token guardado; TikTok lo muestra solo en esa pestaña y nunca lo cuenta como conversión.
 * Exige `integrations.manage` porque es una llamada saliente.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseTikTokTest } from '@/features/panel/integration-input';
import { handleMutation } from '@/features/session/mutation-route';
import { testTikTokConnection } from '@/lib/api/integrations';

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleMutation(request, parseTikTokTest, (sessionMaterial, body) =>
    testTikTokConnection(sessionMaterial, body),
  );
}
