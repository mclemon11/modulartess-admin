import 'server-only';

/**
 * Resultado de pago simulado. **Solo staging.**
 *
 * El navegador llama a esta ruta local y a ninguna otra: no conoce la URL del backend, no tiene
 * identidad IAM y no puede leer la cookie de sesión. Aquí se valida el cuerpo contra el contrato
 * —evento de la lista cerrada, `expectedVersion` y `eventId`—, se recupera la sesión de la cookie
 * `__Host-` y se invoca el endpoint publicado, que devuelve el `AdminOrderDto` actualizado.
 *
 * El panel oculta el simulador salvo a `super_admin` y solo cuando el pedido lo declara disponible,
 * pero eso es usabilidad: la autoridad es el backend, que exige `payments.simulate` y responde
 * `404` como si la ruta no existiera cuando el simulador está apagado en ese despliegue.
 *
 * Ningún mensaje del backend se propaga: la frontera compartida traduce el fallo a un código
 * estable y la respuesta va con `no-store`.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parsePaymentSimulation } from '@/features/panel/order-input';
import { handleMutation } from '@/features/session/mutation-route';
import { simulateOrderPayment } from '@/lib/api/orders';

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly orderId: string }> },
): Promise<NextResponse> {
  const { orderId } = await context.params;

  return handleMutation(request, parsePaymentSimulation, (sessionMaterial, body) =>
    simulateOrderPayment(sessionMaterial, orderId, body),
  );
}
