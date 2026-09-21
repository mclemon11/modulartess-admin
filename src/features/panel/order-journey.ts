/**
 * Recorrido del pedido: el camino que recorre una compra que sale bien.
 *
 * Son **siete** hitos —pedido recibido, pago confirmado, pedido confirmado, en producción, listo
 * para envío, enviado y entregado— y se construyen combinando **dos** historiales distintos: el del
 * pedido (`timeline`) y el del pago (`paymentEvents`). Los dos los publica el contrato, y el propio
 * contrato explica por qué no se pueden aplanar en una sola lista ordenada por fecha:
 *
 *   «When a payment entry and an order entry share the same `at`, the payment one comes first:
 *   approving the payment is what causes the order to advance… They are written in the same
 *   transaction and may carry the same timestamp, so sorting by `at` alone does not decide between
 *   them.»
 *
 * Por eso cada hito se resuelve **por separado** contra su propia fuente. No hay ningún `sort` que
 * tenga que desempatar: el orden de los hitos es el del diseño, y la fecha de cada uno es la que
 * registró su historial. Las fechas no se tocan.
 *
 * Módulo puro: entran los dos historiales, sale una lista. Sin React, sin fechas del reloj y sin
 * ninguna regla de negocio: qué transiciones son válidas lo decide el backend.
 */

import type { AdminPaymentEvent, OrderTimelineEntry } from '@/lib/api/orders';

export type JourneyMilestone = {
  /** Identificador estable del hito. No se muestra. */
  readonly key: string;
  readonly label: string;
  /** Momento en el que se alcanzó, o `null` si todavía no. */
  readonly at: string | null;
  readonly reached: boolean;
  /** El hito donde está el pedido ahora mismo. Un pedido cancelado no tiene ninguno. */
  readonly current: boolean;
  /**
   * El pedido ya pasó de largo sin que este hito quedara registrado.
   *
   * Es el caso de un pedido antiguo cuyo recorrido fue `preparing → shipped` cuando
   * `ready_to_ship` todavía no existía. **No** se le inventa el hito ni se le da una fecha: se
   * marca como no registrado, que es una afirmación distinta de «está pendiente» y distinta de
   * «ocurrió».
   */
  readonly notRecorded: boolean;
};

export type OrderJourney = {
  readonly milestones: readonly JourneyMilestone[];
  /**
   * Cancelar no es un octavo paso: es salirse del recorrido. Se informa aparte para que la
   * pantalla conserve los hitos ya alcanzados sin fingir que el pedido sigue avanzando.
   */
  readonly cancelledAt: string | null;
};

/**
 * De dónde sale cada hito, en el orden del diseño.
 *
 * `order` es el estado del **pedido** cuya primera aparición en el historial marca el hito.
 * `payment` es el resultado del **pago** cuyo primer evento lo marca. «Pago confirmado» y «Pedido
 * confirmado» son dos hitos y nunca dos correos: el contrato solo envía `payment_approved`.
 */
const MILESTONES: readonly {
  readonly key: string;
  readonly label: string;
  readonly source:
    | { readonly kind: 'order'; readonly status: string }
    | {
        readonly kind: 'payment';
        readonly status: string;
      };
}[] = [
  // La creación del pedido. El backend la registra como la primera entrada `pending_payment`.
  {
    key: 'received',
    label: 'Pedido recibido',
    source: { kind: 'order', status: 'pending_payment' },
  },
  {
    key: 'paymentApproved',
    label: 'Pago confirmado',
    source: { kind: 'payment', status: 'approved' },
  },
  { key: 'confirmed', label: 'Pedido confirmado', source: { kind: 'order', status: 'paid' } },
  { key: 'preparing', label: 'En producción', source: { kind: 'order', status: 'preparing' } },
  {
    key: 'readyToShip',
    label: 'Listo para envío',
    source: { kind: 'order', status: 'ready_to_ship' },
  },
  { key: 'shipped', label: 'Enviado', source: { kind: 'order', status: 'shipped' } },
  { key: 'delivered', label: 'Entregado', source: { kind: 'order', status: 'delivered' } },
];

/** La marca de tiempo más temprana de una lista, o `null` si está vacía. */
function earliest(values: readonly string[]): string | null {
  let found: string | null = null;

  for (const value of values) {
    if (found === null || Date.parse(value) < Date.parse(found)) {
      found = value;
    }
  }

  return found;
}

/**
 * Primera vez que el pedido estuvo en ese estado.
 *
 * La primera y no la última: si un pedido volviera a pasar por un estado, el hito sigue siendo
 * cuándo ocurrió por primera vez. El historial llega ordenado del backend, pero no se confía en
 * ello y se compara por fecha.
 */
function firstTimelineAt(timeline: readonly OrderTimelineEntry[], status: string): string | null {
  return earliest(timeline.filter((entry) => entry.status === status).map((entry) => entry.at));
}

/** Primera vez que el pago alcanzó ese resultado. Un rechazo previo no completa ningún hito. */
function firstPaymentAt(events: readonly AdminPaymentEvent[], status: string): string | null {
  return earliest(
    events.filter((event) => event.status === status).map((event) => event.occurredAt),
  );
}

export type OrderJourneySources = {
  readonly status: string;
  readonly timeline: readonly OrderTimelineEntry[];
  readonly paymentEvents: readonly AdminPaymentEvent[];
};

/**
 * Construye el recorrido a partir de los dos historiales.
 *
 * Cada hito se resuelve contra su fuente, nunca por la posición del estado actual. Eso es lo que
 * mantiene legible un pedido antiguo: un historial que fue `preparing → shipped` sin pasar por
 * `ready_to_ship` enseña ese hito como **no registrado** en vez de inventarle una fecha, y el
 * recorrido no se rompe por el hueco.
 */
export function buildOrderJourney({
  status,
  timeline,
  paymentEvents,
}: OrderJourneySources): OrderJourney {
  const cancelled = status === 'cancelled';

  const resolved = MILESTONES.map((milestone) => ({
    milestone,
    at:
      milestone.source.kind === 'order'
        ? firstTimelineAt(timeline, milestone.source.status)
        : firstPaymentAt(paymentEvents, milestone.source.status),
  }));

  const milestones = resolved.map(({ milestone, at }, index) => ({
    key: milestone.key,
    label: milestone.label,
    at,
    reached: at !== null,
    // Un pedido cancelado no está «en» ningún hito: ya salió del recorrido.
    current: !cancelled && milestone.source.kind === 'order' && milestone.source.status === status,
    // Si algo posterior sí quedó registrado, este hueco no es «todavía no»: es «no se registró».
    notRecorded: at === null && resolved.slice(index + 1).some((later) => later.at !== null),
  }));

  return {
    milestones,
    cancelledAt: cancelled ? firstTimelineAt(timeline, 'cancelled') : null,
  };
}
