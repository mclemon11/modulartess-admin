import 'server-only';

/**
 * Configuración de Addi (ADR 0015).
 *
 * Misma frontera que Wompi: `Origin` exacto, sesión desde la cookie `__Host-`, cuerpo estrechado
 * campo a campo y error cerrado. **Las credenciales pasan por aquí en claro y nada se registra.**
 * Guardar nunca activa pagos: eso es `activation`, una operación aparte con confirmación.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseAddiUpdate } from '@/features/panel/integration-input';
import { handleMutation } from '@/features/session/mutation-route';
import { updateAddiIntegration } from '@/lib/api/integrations';

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  return handleMutation(request, parseAddiUpdate, (sessionMaterial, body) =>
    updateAddiIntegration(sessionMaterial, body),
  );
}
