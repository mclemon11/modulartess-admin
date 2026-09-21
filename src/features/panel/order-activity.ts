/**
 * Novedades del pedido: todo lo que le ha pasado, en una sola lectura.
 *
 * El diseño enseña una única corriente de novedades, pero lo que la alimenta son **tres** fuentes
 * distintas que el contrato publica por separado: el historial del pedido (`timeline`), el
 * historial del pago (`paymentEvents`) y el buzón de avisos (`notifications`). Aquí se mezclan
 * **para mostrarlas** y en ningún momento se confunden: cada entrada conserva su `kind`, y los
 * tipos de origen siguen viviendo separados en `@/lib/api/orders`. Una sola lista plana perdería de
 * qué habla cada línea justo cuando importa —un pago rechazado y un pedido cancelado no son lo
 * mismo—, y ese error es difícil de deshacer.
 *
 * Los títulos son los que publica el backend: `timeline[].label` y `paymentEvents[].label`. El
 * panel no reescribe esas etiquetas.
 *
 * **El desempate es explícito, no un `sort` por fecha.** El contrato avisa de que un evento de pago
 * y una entrada del pedido se escriben en la misma transacción y pueden llevar la misma marca de
 * tiempo, así que ordenar solo por `at` no decide entre ellas. El orden canónico cuando empatan es:
 *
 *   1. el evento de **pago**, que es la causa;
 *   2. la entrada del **pedido**, que es la consecuencia;
 *   3. el **aviso**, que es lo que se manda después de las dos.
 *
 * Esta función devuelve la secuencia **cronológica** —de lo más antiguo a lo más reciente—, que es
 * donde esa regla se lee tal cual. La tarjeta la invierte para pintar lo último arriba.
 *
 * Nada de lo que sale de aquí expone interioridades: ni identificadores de evento, ni el origen
 * interno, ni cuerpos, ni destinatarios, ni direcciones.
 *
 * Módulo puro.
 */

import { describeNotificationEvent, describeNotificationStatus } from './notification-labels';

import type { AdminNotification, AdminPaymentEvent, OrderTimelineEntry } from '@/lib/api/orders';

/** Tono de la marca de la entrada. Es color, no vocabulario: el texto lo pone el backend. */
export type ActivityTone = 'brand' | 'success' | 'danger' | 'warning' | 'info' | 'neutral';

export type ActivityEntry = {
  /** De qué corriente viene. La discriminación es lo que impide aplanar tres cosas en una. */
  readonly kind: 'order' | 'payment' | 'notification';
  /** Clave estable para React. No se muestra. */
  readonly id: string;
  readonly at: string;
  readonly tone: ActivityTone;
  /** La etiqueta publicada por el backend, o el nombre amigable del aviso. */
  readonly title: string;
  /** Qué significó eso, dicho en una línea. Nunca una cifra ni un dato inventado. */
  readonly detail: string;
};

/**
 * Qué significó cada cambio de estado del pedido.
 *
 * No son etiquetas —esas las manda el backend— sino la frase que explica el cambio. Un estado que
 * el panel todavía no conozca cae en una frase neutra en lugar de dejar la línea muda.
 */
const ORDER_DETAIL: Readonly<Record<string, string>> = {
  pending_payment: 'El pedido entró a la tienda y espera el pago.',
  paid: 'El pedido quedó confirmado y pasa a la cola de producción.',
  preparing: 'El pedido se está fabricando.',
  ready_to_ship: 'La producción terminó y el pedido espera al transportador.',
  shipped: 'El pedido salió hacia la dirección de entrega.',
  delivered: 'El pedido llegó a su destino.',
  cancelled: 'El pedido se canceló y no vuelve a avanzar.',
};

const ORDER_TONE: Readonly<Record<string, ActivityTone>> = {
  pending_payment: 'warning',
  paid: 'success',
  preparing: 'brand',
  ready_to_ship: 'brand',
  shipped: 'info',
  delivered: 'success',
  cancelled: 'danger',
};

/** Qué significó cada resultado del pago, cuando el evento no trae un `publicMessage` propio. */
const PAYMENT_DETAIL: Readonly<Record<string, string>> = {
  pending: 'El pago quedó a la espera.',
  processing: 'Se abrió un intento de pago y está en curso.',
  approved: 'El pago se aprobó y el pedido avanzó con él.',
  declined: 'El intento de pago se rechazó.',
  expired: 'El intento de pago venció sin completarse.',
  error: 'El intento de pago terminó con un error técnico.',
};

const PAYMENT_TONE: Readonly<Record<string, ActivityTone>> = {
  pending: 'neutral',
  processing: 'info',
  approved: 'success',
  declined: 'danger',
  expired: 'warning',
  error: 'danger',
};

/** Cómo se nombra a quién iba dirigido un aviso. El destinatario concreto no se publica. */
const AUDIENCE: Readonly<Record<string, string>> = {
  customer: 'Cliente',
  admin: 'Administración',
};

/** Orden canónico cuando dos entradas comparten marca de tiempo. Causa, consecuencia, aviso. */
const RANK: Readonly<Record<ActivityEntry['kind'], number>> = {
  payment: 0,
  order: 1,
  notification: 2,
};

export type OrderActivitySources = {
  readonly timeline: readonly OrderTimelineEntry[];
  readonly paymentEvents: readonly AdminPaymentEvent[];
  readonly notifications: readonly AdminNotification[];
};

/**
 * Los avisos de un mismo evento se cuentan **una vez**.
 *
 * Un `payment_approved` escribe un correo para el cliente y otro para administración. Emitir una
 * línea por cada uno repetiría «Pago confirmado» dos veces seguidas y haría parecer que el pago se
 * aprobó dos veces. Se agrupan por `eventKey`, con la fecha del primero, y el detalle dice a quién
 * iban y cómo acabaron.
 */
function notificationEntries(
  notifications: readonly AdminNotification[],
): readonly { readonly entry: ActivityEntry; readonly order: number }[] {
  const groups = new Map<string, AdminNotification[]>();

  for (const notification of notifications) {
    const existing = groups.get(notification.eventKey);

    if (existing === undefined) {
      groups.set(notification.eventKey, [notification]);
    } else {
      existing.push(notification);
    }
  }

  return [...groups.entries()].map(([eventKey, group], index) => {
    const at = group
      .map((notification) => notification.createdAt)
      .reduce((left, right) => (Date.parse(right) < Date.parse(left) ? right : left));

    const audiences = [
      ...new Set(
        group.map((notification) => AUDIENCE[notification.audience] ?? notification.audience),
      ),
    ];
    const outcomes = [
      ...new Set(group.map((notification) => describeNotificationStatus(notification.status))),
    ];

    return {
      entry: {
        kind: 'notification' as const,
        id: `notification:${eventKey}`,
        at,
        tone: 'neutral' as const,
        title: `Avisos de «${describeNotificationEvent(eventKey)}»`,
        detail: `${audiences.join(' y ')} · ${outcomes.join(' · ')}`,
      },
      order: index,
    };
  });
}

/**
 * Entradas de novedades en orden **cronológico**, de lo más antiguo a lo más reciente.
 *
 * Cuando dos entradas comparten marca de tiempo manda `RANK`; si además coinciden en corriente, se
 * conserva el orden en que llegaron del backend, que es el orden en que se escribieron.
 */
export function buildOrderActivity({
  timeline,
  paymentEvents,
  notifications,
}: OrderActivitySources): readonly ActivityEntry[] {
  const collected: { readonly entry: ActivityEntry; readonly order: number }[] = [
    ...paymentEvents.map((event, index) => ({
      entry: {
        kind: 'payment' as const,
        id: `payment:${index}`,
        at: event.occurredAt,
        tone: PAYMENT_TONE[event.status] ?? 'neutral',
        title: event.label,
        detail: event.publicMessage ?? PAYMENT_DETAIL[event.status] ?? 'El pago cambió de estado.',
      },
      order: index,
    })),
    ...timeline.map((entry, index) => ({
      entry: {
        kind: 'order' as const,
        id: `order:${index}`,
        at: entry.at,
        tone: ORDER_TONE[entry.status] ?? 'neutral',
        title: entry.label,
        detail: ORDER_DETAIL[entry.status] ?? 'El pedido cambió de estado.',
      },
      order: index,
    })),
    ...notificationEntries(notifications),
  ];

  return collected
    .map((item, index) => ({ ...item, index }))
    .sort((a, b) => {
      const byTime = Date.parse(a.entry.at) - Date.parse(b.entry.at);

      if (byTime !== 0) {
        return byTime;
      }

      const byKind = RANK[a.entry.kind] - RANK[b.entry.kind];

      return byKind !== 0 ? byKind : a.order - b.order;
    })
    .map(({ entry }) => entry);
}
