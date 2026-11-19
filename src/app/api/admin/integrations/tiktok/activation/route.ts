import 'server-only';

/**
 * Activar o desactivar TikTok.
 *
 * Separado de guardar a propósito, y con `confirm: true` obligatorio en el cuerpo. El backend vuelve
 * a exigir el permiso, la configuración completa y la prueba superada: nada de eso se decide aquí.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseTikTokActivation } from '@/features/panel/integration-input';
import { handleMutation } from '@/features/session/mutation-route';
import { setTikTokActivation } from '@/lib/api/integrations';

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleMutation(request, parseTikTokActivation, (sessionMaterial, body) =>
    setTikTokActivation(sessionMaterial, body),
  );
}
