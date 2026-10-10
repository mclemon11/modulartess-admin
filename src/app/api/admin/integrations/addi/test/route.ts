import 'server-only';

/**
 * Prueba de autenticación con Addi (ADR 0015).
 *
 * Sin parámetros: el backend pide un JWT con las credenciales guardadas y lo descarta. No crea
 * solicitudes ni mueve dinero. Exige `integrations.manage` porque es una llamada saliente.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { handleMutation } from '@/features/session/mutation-route';
import { testAddiConnection } from '@/lib/api/integrations';

/** El cuerpo se ignora: la prueba no toma parámetros. Solo se exige que sea un objeto. */
function parseEmptyBody(raw: unknown): Record<string, never> | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? {} : null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleMutation(request, parseEmptyBody, (sessionMaterial) =>
    testAddiConnection(sessionMaterial),
  );
}
