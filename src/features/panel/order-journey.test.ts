import { describe, expect, it } from 'vitest';

import { buildOrderJourney, type OrderJourneySources } from './order-journey';

import type { AdminPaymentEvent, OrderTimelineEntry } from '@/lib/api/orders';

/**
 * El recorrido del pedido.
 *
 * Es la función que decide qué hitos se pintan como alcanzados, y decide **solo eso** a partir de
 * los dos historiales. Aquí se comprueba que no invente hitos, que no invente fechas, que respete
 * el orden causal del pago y que un pedido antiguo o cancelado siga siendo legible.
 */

function entry(status: string, at: string): OrderTimelineEntry {
  return { status, at, label: `etiqueta de ${status}` } as OrderTimelineEntry;
}

function paymentEvent(status: string, occurredAt: string): AdminPaymentEvent {
  return {
    eventId: `evt-${status}-${occurredAt}`,
    attemptNumber: 1,
    status,
    label: `etiqueta de pago ${status}`,
    environment: 'sandbox',
    occurredAt,
    source: 'payment_simulator',
    reasonCode: null,
    publicMessage: null,
  } as AdminPaymentEvent;
}

const RECEIVED = entry('pending_payment', '2026-09-05T15:24:00.000Z');
const CONFIRMED = entry('paid', '2026-09-05T15:28:00.000Z');
const PREPARING = entry('preparing', '2026-09-05T19:30:00.000Z');
const READY = entry('ready_to_ship', '2026-09-06T09:00:00.000Z');
const SHIPPED = entry('shipped', '2026-09-06T14:00:00.000Z');
const DELIVERED = entry('delivered', '2026-09-08T16:00:00.000Z');
const APPROVED = paymentEvent('approved', '2026-09-05T15:28:00.000Z');

function journey(
  status: string,
  timeline: readonly OrderTimelineEntry[],
  paymentEvents: readonly AdminPaymentEvent[] = [],
): ReturnType<typeof buildOrderJourney> {
  return buildOrderJourney({ status, timeline, paymentEvents } satisfies OrderJourneySources);
}

function keys(status: string, timeline: readonly OrderTimelineEntry[]): readonly string[] {
  return journey(status, timeline).milestones.map((milestone) => milestone.key);
}

function reached(
  status: string,
  timeline: readonly OrderTimelineEntry[],
  paymentEvents: readonly AdminPaymentEvent[] = [],
): readonly string[] {
  return journey(status, timeline, paymentEvents)
    .milestones.filter((milestone) => milestone.reached)
    .map((milestone) => milestone.key);
}

describe('los siete hitos', () => {
  it('se emiten siempre y en el orden del diseño', () => {
    expect(keys('pending_payment', [RECEIVED])).toEqual([
      'received',
      'paymentApproved',
      'confirmed',
      'preparing',
      'readyToShip',
      'shipped',
      'delivered',
    ]);
  });

  it('cada uno se nombra como lo nombra el diseño', () => {
    expect(journey('pending_payment', [RECEIVED]).milestones.map((m) => m.label)).toEqual([
      'Pedido recibido',
      'Pago confirmado',
      'Pedido confirmado',
      'En producción',
      'Listo para envío',
      'Enviado',
      'Entregado',
    ]);
  });
});

describe('qué marca un hito como alcanzado', () => {
  it('lo marca el historial, no el estado actual', () => {
    expect(reached('preparing', [RECEIVED, CONFIRMED, PREPARING], [APPROVED])).toEqual([
      'received',
      'paymentApproved',
      'confirmed',
      'preparing',
    ]);
  });

  it('«Pago confirmado» sale del historial del pago, no del estado del pedido', () => {
    const withoutPayment = journey('paid', [RECEIVED, CONFIRMED], []);

    expect(withoutPayment.milestones.find((m) => m.key === 'paymentApproved')).toMatchObject({
      at: null,
      reached: false,
    });
  });

  /* Un intento rechazado o vencido no confirma nada: solo `approved` completa ese hito. */
  it.each(['pending', 'processing', 'declined', 'expired', 'error'])(
    'un evento de pago %s no completa «Pago confirmado»',
    (status) => {
      const events = [paymentEvent(status, '2026-09-05T15:26:00.000Z')];

      expect(reached('pending_payment', [RECEIVED], events)).toEqual(['received']);
    },
  );

  it('el hito del estado actual se marca como tal, y solo uno', () => {
    const current = journey('preparing', [RECEIVED, CONFIRMED, PREPARING], [APPROVED])
      .milestones.filter((milestone) => milestone.current)
      .map((milestone) => milestone.key);

    expect(current).toEqual(['preparing']);
  });

  it('«Pago confirmado» nunca es el hito actual: no es un estado del pedido', () => {
    const current = journey('paid', [RECEIVED, CONFIRMED], [APPROVED])
      .milestones.filter((milestone) => milestone.current)
      .map((milestone) => milestone.key);

    expect(current).toEqual(['confirmed']);
  });

  it('un hito sin entrada no recibe fecha', () => {
    expect(
      journey('paid', [RECEIVED, CONFIRMED]).milestones.find((m) => m.key === 'shipped'),
    ).toMatchObject({ at: null, reached: false });
  });
});

describe('empate de fechas entre pago y pedido', () => {
  /*
   * El contrato avisa de que las dos entradas se escriben en la misma transacción y pueden llevar
   * la misma marca de tiempo, «so sorting by `at` alone does not decide between them». Aquí el
   * orden no lo decide ningún `sort`: cada hito sale de su propia fuente y la posición es la del
   * diseño.
   */
  it('«Pago confirmado» va antes que «Pedido confirmado» con el mismo instante', () => {
    const sameInstant = '2026-09-05T15:28:00.000Z';
    const milestones = journey(
      'paid',
      [RECEIVED, entry('paid', sameInstant)],
      [paymentEvent('approved', sameInstant)],
    ).milestones;

    const positions = milestones.map((m) => m.key);

    expect(positions.indexOf('paymentApproved')).toBeLessThan(positions.indexOf('confirmed'));
    expect(milestones.find((m) => m.key === 'paymentApproved')?.at).toBe(sameInstant);
    expect(milestones.find((m) => m.key === 'confirmed')?.at).toBe(sameInstant);
  });

  it('las fechas no se separan artificialmente', () => {
    const sameInstant = '2026-09-05T15:28:00.000Z';
    const dated = journey(
      'paid',
      [RECEIVED, entry('paid', sameInstant)],
      [paymentEvent('approved', sameInstant)],
    ).milestones.filter((m) => m.at === sameInstant);

    expect(dated.map((m) => m.key)).toEqual(['paymentApproved', 'confirmed']);
  });

  it('un estado repetido conserva la primera vez, no la última', () => {
    const repeated = journey('pending_payment', [
      entry('pending_payment', '2026-09-05T18:00:00.000Z'),
      entry('pending_payment', '2026-09-05T15:24:00.000Z'),
    ]);

    expect(repeated.milestones[0]?.at).toBe('2026-09-05T15:24:00.000Z');
  });
});

describe('recorrido completo', () => {
  it('un pedido entregado alcanza los siete hitos', () => {
    expect(
      reached('delivered', [RECEIVED, CONFIRMED, PREPARING, READY, SHIPPED, DELIVERED], [APPROVED]),
    ).toEqual([
      'received',
      'paymentApproved',
      'confirmed',
      'preparing',
      'readyToShip',
      'shipped',
      'delivered',
    ]);
  });

  it('«Listo para envío» se alcanza cuando el historial lo registra', () => {
    const milestone = journey(
      'ready_to_ship',
      [RECEIVED, CONFIRMED, PREPARING, READY],
      [APPROVED],
    ).milestones.find((m) => m.key === 'readyToShip');

    expect(milestone).toMatchObject({ at: READY.at, reached: true, current: true });
  });
});

describe('pedidos anteriores al recorrido actual', () => {
  /*
   * Un pedido antiguo pasó de `preparing` a `shipped` cuando `ready_to_ship` no existía. El hito
   * no se inventa: se marca como **no registrado**, que no es «pendiente» y no es «ocurrió».
   */
  it('un `preparing → shipped` heredado no inventa «Listo para envío»', () => {
    const legacy = journey('shipped', [RECEIVED, CONFIRMED, PREPARING, SHIPPED], [APPROVED]);
    const readyToShip = legacy.milestones.find((m) => m.key === 'readyToShip');

    expect(readyToShip).toMatchObject({ at: null, reached: false, notRecorded: true });
    expect(legacy.milestones.find((m) => m.key === 'shipped')?.reached).toBe(true);
  });

  it('un hito que todavía puede llegar no se marca como no registrado', () => {
    const inProgress = journey('preparing', [RECEIVED, CONFIRMED, PREPARING], [APPROVED]);

    expect(inProgress.milestones.find((m) => m.key === 'readyToShip')?.notRecorded).toBe(false);
    expect(inProgress.milestones.find((m) => m.key === 'delivered')?.notRecorded).toBe(false);
  });

  it('un pago que nunca se registró también queda como no registrado', () => {
    const legacy = journey('delivered', [
      RECEIVED,
      CONFIRMED,
      PREPARING,
      READY,
      SHIPPED,
      DELIVERED,
    ]);

    expect(legacy.milestones.find((m) => m.key === 'paymentApproved')?.notRecorded).toBe(true);
  });
});

describe('cancelación', () => {
  const CANCELLED = entry('cancelled', '2026-09-05T16:00:00.000Z');

  it('conserva los hitos alcanzados', () => {
    expect(reached('cancelled', [RECEIVED, CONFIRMED, CANCELLED], [APPROVED])).toEqual([
      'received',
      'paymentApproved',
      'confirmed',
    ]);
  });

  it('no completa los que quedaron por delante', () => {
    expect(reached('cancelled', [RECEIVED, CANCELLED])).toEqual(['received']);
  });

  it('no es un octavo paso: se informa aparte y con su fecha', () => {
    const cancelled = journey('cancelled', [RECEIVED, CANCELLED]);

    expect(cancelled.milestones.map((m) => m.key)).not.toContain('cancelled');
    expect(cancelled.milestones).toHaveLength(7);
    expect(cancelled.cancelledAt).toBe(CANCELLED.at);
  });

  it('un pedido cancelado no está «en» ningún hito', () => {
    expect(journey('cancelled', [RECEIVED, CANCELLED]).milestones.some((m) => m.current)).toBe(
      false,
    );
  });

  it('un pedido que no se canceló no lleva fecha de cancelación', () => {
    expect(journey('preparing', [RECEIVED, CONFIRMED, PREPARING]).cancelledAt).toBeNull();
  });
});
