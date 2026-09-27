/**
 * Lógica del recordatorio manual, sin React.
 *
 * Vive aparte del componente para poder probar lo que importa —un solo envío por mucho que se
 * pulse, qué pasa con cada respuesta— sin DOM. El componente solo la conecta.
 *
 * Módulo puro: recibe sus dependencias.
 */

import type { StatusReminderResult } from './orders-client';

import { can } from '@/features/session/permissions';
import type { AdminOrder } from '@/lib/api/orders';

export type ReminderOutcome =
  | { readonly kind: 'queued' }
  | { readonly kind: 'already_queued' }
  | { readonly kind: 'failure'; readonly code: string };

/** ¿Se pinta la acción? Solo con el permiso. El backend lo vuelve a comprobar. */
export function canSendStatusReminder(role: string): boolean {
  return can(role, 'notifications.send_reminder');
}

export type ReminderDependencies = {
  readonly send: (orderId: string, expectedVersion: number) => Promise<StatusReminderResult>;
  readonly reload: (orderId: string) => Promise<AdminOrder | null>;
  readonly onUpdated: (order: AdminOrder) => void;
  readonly refresh: () => void;
};

/**
 * Crea el ejecutor del envío, con un **candado síncrono**.
 *
 * El candado se toma antes del primer `await`: un segundo clic mientras el primero sigue en vuelo
 * devuelve `null` sin llamar a nada. El estado de React no llega a tiempo para eso, y un segundo
 * clic aquí sería un segundo correo si el backend no deduplicara.
 *
 * Tras `queued` vuelve a leer la ficha para pintar el aviso nuevo; si no puede, refresca la página.
 * `already_queued` no relee: no se escribió nada.
 */
export function createReminderRunner(
  dependencies: ReminderDependencies,
): (order: AdminOrder) => Promise<ReminderOutcome | null> {
  let running = false;

  return async (order) => {
    if (running) {
      return null;
    }

    running = true;

    try {
      const result = await dependencies.send(order.id, order.version);

      if (!result.ok) {
        return { kind: 'failure', code: result.code };
      }

      if (result.status === 'queued') {
        const fresh = await dependencies.reload(order.id);

        if (fresh === null) {
          dependencies.refresh();
        } else {
          dependencies.onUpdated(fresh);
        }
      }

      return { kind: result.status };
    } finally {
      running = false;
    }
  };
}
