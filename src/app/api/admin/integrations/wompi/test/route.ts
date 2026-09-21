import 'server-only';

/**
 * Prueba de conexión con Wompi.
 *
 * No lleva cuerpo —qué llave se prueba lo decide el backend, que es quien la guarda— pero sigue
 * siendo una mutación a efectos de frontera: valida `Origin`, exige la sesión y hace una llamada
 * **saliente** contra el proveedor. Por eso el contrato pide `integrations.manage` y no
 * `integrations.read`.
 *
 * La respuesta nunca incluye el cuerpo remoto: el contrato lo declara y este archivo no lo
 * reintroduce.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { handleMutation } from '@/features/session/mutation-route';
import { testWompiConnection } from '@/lib/api/integrations';

/** El cuerpo se ignora: la prueba no toma parámetros. Solo se exige que sea un objeto. */
function parseEmptyBody(raw: unknown): Record<string, never> | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? {} : null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleMutation(request, parseEmptyBody, (sessionMaterial) =>
    testWompiConnection(sessionMaterial),
  );
}
