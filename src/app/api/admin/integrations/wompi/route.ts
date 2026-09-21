import 'server-only';

/**
 * Configuración de Wompi.
 *
 * El navegador llama a esta ruta local y a ninguna otra: no conoce la URL del backend, no tiene
 * identidad IAM y no puede leer la cookie de sesión. Aquí se valida la forma del cuerpo, se
 * recupera la sesión de la cookie `__Host-` y se invoca el endpoint publicado.
 *
 * **Las cuatro credenciales pasan por aquí en claro, y por eso este archivo no registra nada.** No
 * hay `console.log`, no hay traza del cuerpo y el error que se devuelve es un código cerrado: la
 * frontera compartida traduce el fallo sin tocar el `message` del backend, que en esta superficie
 * puede nombrar campos de credencial.
 *
 * El panel oculta esta pantalla a quien no tenga `integrations.manage`, pero eso es usabilidad: la
 * autoridad es el backend, que vuelve a exigir el permiso y rechaza la petición aunque llegue
 * fabricada a mano.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseWompiUpdate } from '@/features/panel/integration-input';
import { handleMutation } from '@/features/session/mutation-route';
import { updateWompiIntegration } from '@/lib/api/integrations';

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  return handleMutation(request, parseWompiUpdate, (sessionMaterial, body) =>
    updateWompiIntegration(sessionMaterial, body),
  );
}
