/**
 * Lógica del recordatorio manual, sin React.
 *
 * Vive aparte del componente para poder probar lo que importa —un solo envío por mucho que se
 * pulse, qué pasa con cada respuesta y cómo se sigue el aviso hasta su estado real— sin DOM. El
 * componente solo la conecta.
 *
 * **Pedir no es enviar.** `queued` significa que el backend escribió el aviso en el outbox; lo
 * manda el trabajador después. `already_queued`, que ese aviso ya existía. Ninguno de los dos dice
 * que el correo haya salido, y menos que haya llegado: eso solo lo cuenta el estado del aviso.
 *
 * Módulo puro: recibe sus dependencias.
 */

import { isTerminalNotificationStatus } from './notification-labels';
import type { StatusReminderResult } from './orders-client';

import { can } from '@/features/session/permissions';
import type { AdminOrder } from '@/lib/api/orders';

export type ReminderOutcome =
  | { readonly kind: 'queued'; readonly notificationId: string }
  | { readonly kind: 'already_queued'; readonly notificationId: string }
  | { readonly kind: 'failure'; readonly code: string };

/** ¿Se pinta la acción? Solo con el permiso. El backend lo vuelve a comprobar. */
export function canSendStatusReminder(role: string): boolean {
  return can(role, 'notifications.send_reminder');
}

/** Lo que se le dice a la persona tras pedirlo. Nunca «enviado». */
export const REMINDER_QUEUED_MESSAGE = 'Recordatorio programado para envío.';
export const REMINDER_ALREADY_QUEUED_MESSAGE = 'Ya existe un recordatorio para este estado.';

export type ReminderDependencies = {
  readonly send: (orderId: string, expectedVersion: number) => Promise<StatusReminderResult>;
};

/**
 * Crea el ejecutor del envío, con un **candado síncrono**.
 *
 * El candado se toma antes del primer `await`: un segundo clic mientras el primero sigue en vuelo
 * devuelve `null` sin llamar a nada. El estado de React no llega a tiempo para eso.
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

      return result.ok
        ? { kind: result.status, notificationId: result.notificationId }
        : { kind: 'failure', code: result.code };
    } finally {
      running = false;
    }
  };
}

/** Estado del seguimiento: el del aviso tal como lo publica el backend, o que se agotó la espera. */
export type ReminderTracking =
  | { readonly kind: 'status'; readonly status: string; readonly terminal: boolean }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'timeout'; readonly lastStatus: string | null };

export type TrackingDependencies = {
  /** Vuelve a leer la ficha. `null` si no se pudo. */
  readonly reload: (orderId: string) => Promise<AdminOrder | null>;
  /** Sustituye la ficha que se está viendo: actualiza la tarjeta sin recargar la página. */
  readonly onUpdated: (order: AdminOrder) => void;
  /** Informa de cada cambio de estado del seguimiento. */
  readonly onProgress: (tracking: ReminderTracking) => void;
  readonly wait: (ms: number) => Promise<void>;
  /** Pide parar: el componente se desmontó. */
  readonly cancelled?: () => boolean;
};

/**
 * Sigue el aviso hasta un estado terminal, con un límite.
 *
 * El trabajador pasa cada dos minutos, así que la espera por omisión —36 consultas cada 5 s— cubre
 * una pasada y media. Cada lectura sustituye la ficha, así que la tarjeta de notificaciones enseña
 * el estado real sin recargar la página. Si se agota, se dice que sigue sin terminar: no se da por
 * enviado nada que no se haya visto enviado.
 */
export async function trackReminder(
  orderId: string,
  notificationId: string,
  dependencies: TrackingDependencies,
  options: { readonly intervalMs?: number; readonly maxPolls?: number } = {},
): Promise<ReminderTracking> {
  const intervalMs = options.intervalMs ?? 5000;
  const maxPolls = options.maxPolls ?? 36;
  let lastStatus: string | null = null;

  for (let poll = 0; poll < maxPolls; poll += 1) {
    if (dependencies.cancelled?.() === true) {
      break;
    }

    const order = await dependencies.reload(orderId);

    if (order !== null) {
      dependencies.onUpdated(order);
      const notification = order.notifications.find((entry) => entry.id === notificationId);

      if (notification === undefined) {
        dependencies.onProgress({ kind: 'unknown' });
      } else {
        lastStatus = notification.status;
        const tracking: ReminderTracking = {
          kind: 'status',
          status: notification.status,
          terminal: isTerminalNotificationStatus(notification.status),
        };
        dependencies.onProgress(tracking);

        if (tracking.terminal) {
          return tracking;
        }
      }
    }

    await dependencies.wait(intervalMs);
  }

  const timeout: ReminderTracking = { kind: 'timeout', lastStatus };
  dependencies.onProgress(timeout);

  return timeout;
}
