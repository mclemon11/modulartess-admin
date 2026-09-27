import 'server-only';

import { can } from '@/features/session/permissions';
import { getCommunicationsSummary } from '@/lib/api/communications';

import { totalUnread } from './inbox-labels';

/**
 * Contador de la entrada «Bandeja» de la barra lateral.
 *
 * Solo se pide con `communications.read`. Si el backend no responde, la entrada se pinta sin
 * contador: un número inventado o un error en la barra lateral serían peores que no decir nada, y
 * la pantalla de la bandeja informa del fallo por su cuenta.
 */
export async function inboxBadge(
  role: string,
  sessionMaterial: string,
): Promise<Readonly<Record<string, number>>> {
  if (!can(role, 'communications.read')) {
    return {};
  }

  try {
    const summary = await getCommunicationsSummary(sessionMaterial);

    return { '/panel/bandeja': totalUnread(summary.unread) };
  } catch {
    return {};
  }
}
