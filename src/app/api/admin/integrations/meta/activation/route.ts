import 'server-only';

/**
 * Activar o desactivar Meta.
 *
 * Separado de guardar a propósito, y con `confirm: true` obligatorio en el cuerpo. El backend vuelve
 * a exigir el permiso, la configuración completa y la prueba superada: nada de eso se decide aquí.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseMetaActivation } from '@/features/panel/integration-input';
import { handleMutation } from '@/features/session/mutation-route';
import { setMetaActivation } from '@/lib/api/integrations';

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleMutation(request, parseMetaActivation, (sessionMaterial, body) =>
    setMetaActivation(sessionMaterial, body),
  );
}
