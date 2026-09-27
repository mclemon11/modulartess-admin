import 'server-only';

/**
 * Recordatorio manual del estado actual al cliente.
 *
 * El panel oculta la acción a quien no tiene `notifications.send_reminder`, pero el backend vuelve
 * a comprobarlo, igual que la versión y el estado del pedido. Del navegador solo llega
 * `expectedVersion`: el destinatario, el texto y el enlace los compone el backend.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { parseStatusReminder } from '@/features/panel/order-input';
import { handleMutation } from '@/features/session/mutation-route';
import { sendStatusReminder } from '@/lib/api/orders';

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly orderId: string }> },
): Promise<NextResponse> {
  const { orderId } = await context.params;

  return handleMutation(request, parseStatusReminder, (sessionMaterial, body) =>
    sendStatusReminder(sessionMaterial, orderId, body),
  );
}
