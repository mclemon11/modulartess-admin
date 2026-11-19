import 'server-only';

/**
 * Configuración de TikTok: Pixel ID y token de Events API.
 *
 * Misma frontera que Addi: `Origin` exacto, sesión desde la cookie `__Host-`, cuerpo estrechado
 * campo a campo y error cerrado. **El token pasa por aquí en claro y nada se registra.** Guardar
 * nunca activa nada: eso es `activation`, una operación aparte con confirmación.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseTikTokUpdate } from '@/features/panel/integration-input';
import { handleMutation } from '@/features/session/mutation-route';
import { updateTikTokIntegration } from '@/lib/api/integrations';

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  return handleMutation(request, parseTikTokUpdate, (sessionMaterial, body) =>
    updateTikTokIntegration(sessionMaterial, body),
  );
}
