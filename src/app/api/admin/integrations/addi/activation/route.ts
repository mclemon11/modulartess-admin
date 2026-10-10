import 'server-only';

/**
 * Activar o desactivar pagos nuevos con Addi (ADR 0015).
 *
 * Separado de guardar credenciales a propósito, y con `confirm: true` obligatorio en el cuerpo. El
 * backend vuelve a exigir el permiso, la configuración completa, la prueba superada y la guardia de
 * despliegue: nada de eso se decide aquí.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseAddiActivation } from '@/features/panel/integration-input';
import { handleMutation } from '@/features/session/mutation-route';
import { setAddiActivation } from '@/lib/api/integrations';

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleMutation(request, parseAddiActivation, (sessionMaterial, body) =>
    setAddiActivation(sessionMaterial, body),
  );
}
