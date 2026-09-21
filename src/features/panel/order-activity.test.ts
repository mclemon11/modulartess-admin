import { describe, expect, it } from 'vitest';

import { buildOrderActivity } from './order-activity';

import type { AdminNotification, AdminPaymentEvent, OrderTimelineEntry } from '@/lib/api/orders';

/**
 * Novedades del pedido.
 *
 * Mezcla tres corrientes **para mostrar**, sin confundir el origen: cada entrada conserva su
 * `kind`. Lo que se comprueba aquí es el desempate: dos entradas pueden compartir marca de tiempo
 * porque se escriben en la misma transacción, y un `sort` por fecha no decide entre ellas.
 */

function entry(status: string, at: string, label = `etiqueta de ${status}`): OrderTimelineEntry {
  return { status, at, label } as OrderTimelineEntry;
}

function paymentEvent(
  status: string,
  occurredAt: string,
  extra: Partial<AdminPaymentEvent> = {},
): AdminPaymentEvent {
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
    ...extra,
  } as AdminPaymentEvent;
}

function notification(
  eventKey: string,
  audience: string,
  createdAt: string,
  status = 'previewed',
): AdminNotification {
  return {
    id: `ntf-${eventKey}-${audience}`,
    eventKey,
    audience,
    template: `${audience}_${eventKey}`,
    templateVersion: 1,
    deliveryMode: 'preview',
    status,
    attempts: 0,
    createdAt,
    updatedAt: createdAt,
    nextAttemptAt: null,
    sentAt: null,
    lastErrorCode: null,
  } as AdminNotification;
}

function activity(sources: {
  readonly timeline?: readonly OrderTimelineEntry[];
  readonly paymentEvents?: readonly AdminPaymentEvent[];
  readonly notifications?: readonly AdminNotification[];
}) {
  return buildOrderActivity({
    timeline: sources.timeline ?? [],
    paymentEvents: sources.paymentEvents ?? [],
    notifications: sources.notifications ?? [],
  });
}

describe('orden', () => {
  /* La función devuelve la secuencia cronológica; la tarjeta la invierte para pintarla. */
  it('va de lo más antiguo a lo más reciente', () => {
    const entries = activity({
      timeline: [
        entry('preparing', '2026-09-05T19:30:00.000Z'),
        entry('pending_payment', '2026-09-05T15:24:00.000Z'),
        entry('paid', '2026-09-05T15:28:00.000Z'),
      ],
    });

    expect(entries.map((item) => item.title)).toEqual([
      'etiqueta de pending_payment',
      'etiqueta de paid',
      'etiqueta de preparing',
    ]);
  });
});

describe('desempate cuando dos entradas comparten marca de tiempo', () => {
  const SAME = '2026-09-05T15:28:00.000Z';

  /*
   * Aprobar el pago es lo que hace avanzar al pedido. Con la misma marca de tiempo, el evento de
   * pago va primero, porque es la causa.
   */
  it('el pago aprobado precede al `paid` del pedido', () => {
    const entries = activity({
      timeline: [entry('paid', SAME, 'Pedido confirmado')],
      paymentEvents: [paymentEvent('approved', SAME)],
    });

    expect(entries.map((item) => item.kind)).toEqual(['payment', 'order']);
  });

  it('los avisos van después del evento que los originó', () => {
    const entries = activity({
      timeline: [entry('paid', SAME, 'Pedido confirmado')],
      paymentEvents: [paymentEvent('approved', SAME)],
      notifications: [notification('payment_approved', 'customer', SAME)],
    });

    expect(entries.map((item) => item.kind)).toEqual(['payment', 'order', 'notification']);
  });

  /* Dentro de la misma corriente manda el orden en que el backend las escribió. */
  it('dos entradas del pedido conservan el orden del historial', () => {
    const entries = activity({
      timeline: [
        entry('pending_payment', SAME, 'Pedido recibido'),
        entry('paid', SAME, 'Pedido confirmado'),
      ],
    });

    expect(entries.map((item) => item.title)).toEqual(['Pedido recibido', 'Pedido confirmado']);
  });

  it('la fecha manda sobre el desempate: un pago posterior no se adelanta', () => {
    const entries = activity({
      timeline: [entry('paid', '2026-09-05T15:28:00.000Z', 'Pedido confirmado')],
      paymentEvents: [paymentEvent('approved', '2026-09-05T15:29:00.000Z')],
    });

    expect(entries.map((item) => item.kind)).toEqual(['order', 'payment']);
  });
});

describe('cómo se lee cada entrada', () => {
  /* El título es la etiqueta publicada. El panel no reescribe el vocabulario del backend. */
  it('usa la etiqueta que manda el backend, no una traducción propia', () => {
    const entries = activity({
      timeline: [entry('pending_payment', '2026-09-05T15:24:00.000Z', 'Pedido recibido')],
      paymentEvents: [paymentEvent('approved', '2026-09-05T15:28:00.000Z')],
    });

    expect(entries.map((item) => item.title)).toEqual([
      'Pedido recibido',
      'etiqueta de pago approved',
    ]);
  });

  it('un estado que el panel no conoce conserva su etiqueta y no queda sin detalle', () => {
    const [only] = activity({
      timeline: [entry('returned', '2026-09-06T09:00:00.000Z', 'Devuelto')],
    });

    expect(only?.title).toBe('Devuelto');
    expect(only?.detail.length).toBeGreaterThan(0);
  });

  it('«Listo para envío» se cuenta como un cambio más del pedido', () => {
    const [only] = activity({
      timeline: [entry('ready_to_ship', '2026-09-06T09:00:00.000Z', 'Listo para envío')],
    });

    expect(only?.title).toBe('Listo para envío');
    expect(only?.detail).toContain('transportador');
  });

  it('el `publicMessage` del pago se prefiere al texto del panel', () => {
    const [only] = activity({
      paymentEvents: [
        paymentEvent('declined', '2026-09-05T15:28:00.000Z', {
          publicMessage: 'La entidad no autorizó la transacción.',
        }),
      ],
    });

    expect(only?.detail).toBe('La entidad no autorizó la transacción.');
  });
});

describe('avisos', () => {
  const SAME = '2026-09-05T15:28:00.000Z';

  /*
   * `payment_approved` escribe un correo al cliente y otro a administración. Emitir una línea por
   * cada uno repetiría el mismo hecho dos veces y haría parecer que el pago se aprobó dos veces.
   */
  it('no duplica el mismo hecho por cada destinatario', () => {
    const entries = activity({
      notifications: [
        notification('payment_approved', 'customer', SAME),
        notification('payment_approved', 'admin', SAME),
      ],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.detail).toContain('Cliente');
    expect(entries[0]?.detail).toContain('Administración');
  });

  it('nombra el hecho con su nombre amigable, no con la clave técnica', () => {
    const [only] = activity({
      notifications: [notification('order_ready_to_ship', 'customer', SAME)],
    });

    expect(only?.title).toContain('Listo para envío');
    expect(only?.title).not.toContain('order_ready_to_ship');
  });
});

describe('qué no sale de aquí', () => {
  it('cada entrada declara de qué corriente viene', () => {
    const entries = activity({
      timeline: [entry('paid', '2026-09-05T15:28:00.000Z')],
      paymentEvents: [paymentEvent('approved', '2026-09-05T15:28:00.000Z')],
      notifications: [notification('payment_approved', 'customer', '2026-09-05T15:28:00.000Z')],
    });

    expect(entries.map((item) => item.kind).sort()).toEqual(['notification', 'order', 'payment']);
  });

  /*
   * Las novedades son para leer de un vistazo. Identificadores de evento, orígenes internos,
   * destinatarios y cuerpos no aportan nada a quien administra y sí filtran interioridades.
   */
  it('no expone más campos que los necesarios para pintarla', () => {
    const [only] = activity({ timeline: [entry('paid', '2026-09-05T15:28:00.000Z')] });

    expect(Object.keys(only ?? {}).sort()).toEqual(['at', 'detail', 'id', 'kind', 'title', 'tone']);
  });

  it('no filtra el identificador del evento de pago ni su origen técnico', () => {
    const serialised = JSON.stringify(
      activity({
        paymentEvents: [paymentEvent('approved', '2026-09-05T15:28:00.000Z')],
        notifications: [notification('payment_approved', 'customer', '2026-09-05T15:28:00.000Z')],
      }),
    );

    expect(serialised).not.toContain('payment_simulator');
    expect(serialised).not.toContain('evt-approved');
    expect(serialised).not.toContain('customer_payment_approved');
  });
});

describe('sin novedades', () => {
  it('no produce entradas', () => {
    expect(activity({})).toEqual([]);
  });
});
