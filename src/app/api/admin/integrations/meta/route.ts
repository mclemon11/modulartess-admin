import 'server-only';

/**
 * Configuración de Meta: ID del conjunto de datos (píxel) y token de la API de conversiones.
 *
 * Misma frontera que TikTok: `Origin` exacto, sesión desde la cookie `__Host-`, cuerpo estrechado
 * campo a campo y error cerrado. **El token pasa por aquí en claro y nada se registra.** Guardar
 * nunca activa nada: eso es `activation`, una operación aparte con confirmación.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseMetaUpdate } from '@/features/panel/integration-input';
import { handleMutation } from '@/features/session/mutation-route';
import { updateMetaIntegration } from '@/lib/api/integrations';

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  return handleMutation(request, parseMetaUpdate, (sessionMaterial, body) =>
    updateMetaIntegration(sessionMaterial, body),
  );
}
