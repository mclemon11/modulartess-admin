import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  OrderActivityCard,
  OrderNotificationsCard,
  OrderPaymentCard,
  OrderPaymentHistoryCard,
} from './order-detail-cards';
import { OrderProgress } from './order-progress';

import type {
  AdminNotification,
  AdminOrder,
  AdminPaymentEvent,
  OrderTimelineEntry,
} from '@/lib/api/orders';

/**
 * Las tarjetas nuevas del detalle, comprobadas sobre el HTML que React produce de verdad.
 *
 * No hace falta un DOM: lo que importa es qué llega a pintarse —y qué no—, y eso está en el
 * marcado. Aquí se comprueba lo que un panel administrativo no puede permitirse equivocar: afirmar
 * que hubo un cobro, presentar una plantilla como un correo enviado, o dar por ocurrido un paso que
 * nunca se registró.
 */

function entry(status: string, at: string, label: string): OrderTimelineEntry {
  return { status, at, label } as OrderTimelineEntry;
}

function paymentEvent(
  status: string,
  occurredAt: string,
  extra: Partial<AdminPaymentEvent> = {},
): AdminPaymentEvent {
  return {
    eventId: 'evt-secreto-0001',
    attemptNumber: 1,
    status,
    label: `Pago ${status}`,
    environment: 'sandbox',
    occurredAt,
    source: 'payment_simulator',
    reasonCode: null,
    publicMessage: null,
    ...extra,
  } as AdminPaymentEvent;
}

function notification(overrides: Partial<AdminNotification> = {}): AdminNotification {
  return {
    id: 'ntf_0123456789abcdef',
    eventKey: 'payment_approved',
    audience: 'customer',
    template: 'customer_payment_approved',
    templateVersion: 1,
    deliveryMode: 'preview',
    status: 'previewed',
    attempts: 0,
    createdAt: '2026-09-05T15:28:00.000Z',
    updatedAt: '2026-09-05T15:28:00.000Z',
    nextAttemptAt: null,
    sentAt: null,
    lastErrorCode: null,
    ...overrides,
  } as AdminNotification;
}

function order(overrides: Partial<AdminOrder> = {}): AdminOrder {
  return {
    id: 'ord_abc',
    publicId: 'MZ-7KQ2R9DA',
    version: 3,
    status: 'pending_payment',
    statusLabel: 'Pendiente de pago',
    createdAt: '2026-09-05T15:24:00.000Z',
    updatedAt: '2026-09-05T15:24:00.000Z',
    timeline: [entry('pending_payment', '2026-09-05T15:24:00.000Z', 'Pedido recibido')],
    payment: {
      status: 'pending',
      statusLabel: 'Pendiente',
      environment: 'sandbox',
      attemptNumber: 0,
      approvedAt: null,
      approvedAtSource: null,
      updatedAt: '2026-09-05T15:24:00.000Z',
    },
    paymentEvents: [],
    notifications: [],
    paymentSimulationEnabled: false,
    availableSimulationEvents: [],
    ...overrides,
  } as AdminOrder;
}

describe('información de pago', () => {
  it('muestra la etiqueta autoritativa del backend', () => {
    const html = renderToStaticMarkup(
      <OrderPaymentCard
        order={order({
          payment: {
            status: 'approved',
            statusLabel: 'Pago confirmado por el backend',
            environment: 'sandbox',
            attemptNumber: 1,
            approvedAt: '2026-09-05T15:28:00.000Z',
            approvedAtSource: 'provider_event',
            updatedAt: '2026-09-05T15:28:00.000Z',
          },
        })}
      />,
    );

    expect(html).toContain('Pago confirmado por el backend');
  });

  /* `sandbox` significa que no hubo cobro. Dejarlo implícito es cómo alguien acaba creyendo que sí. */
  it('dice con todas las letras que una simulación no es un cobro', () => {
    const html = renderToStaticMarkup(<OrderPaymentCard order={order()} />);

    expect(html).toContain('Simulación');
    expect(html).toContain('Entorno de pruebas. No se realizó un cobro real.');
  });

  it('sin intentos lo explica en vez de dejar un cero suelto', () => {
    const html = renderToStaticMarkup(<OrderPaymentCard order={order()} />);

    expect(html).toContain('Todavía no se ha iniciado un intento de pago.');
  });

  /* Ni tarjeta, ni entidad, ni referencia, ni fecha de cobro: el contrato no publica nada de eso. */
  it.each(['Visa', 'Tarjeta', 'Método de pago', 'Transferencia', 'Referencia'])(
    'no inventa «%s»',
    (needle) => {
      expect(renderToStaticMarkup(<OrderPaymentCard order={order()} />)).not.toContain(needle);
    },
  );
});

describe('historial de pago', () => {
  const withEvents = order({
    paymentEvents: [
      paymentEvent('declined', '2026-09-05T15:26:00.000Z', {
        attemptNumber: 1,
        publicMessage: 'La entidad no autorizó la transacción.',
        reasonCode: 'insufficient_funds',
      }),
      paymentEvent('approved', '2026-09-05T15:28:00.000Z', { attemptNumber: 2 }),
    ],
  });

  it('separa los intentos en vez de aplanarlos', () => {
    const html = renderToStaticMarkup(<OrderPaymentHistoryCard order={withEvents} />);

    expect(html).toContain('Intento 1');
    expect(html).toContain('Intento 2');
  });

  it('muestra el mensaje público y el motivo traducido', () => {
    const html = renderToStaticMarkup(<OrderPaymentHistoryCard order={withEvents} />);

    expect(html).toContain('La entidad no autorizó la transacción.');
    expect(html).toContain('Fondos insuficientes');
  });

  it('no enseña el identificador del evento ni su origen técnico', () => {
    const html = renderToStaticMarkup(<OrderPaymentHistoryCard order={withEvents} />);

    expect(html).not.toContain('evt-secreto-0001');
    expect(html).not.toContain('payment_simulator');
  });

  it('un motivo sin traducción aprobada no se pinta', () => {
    const html = renderToStaticMarkup(
      <OrderPaymentHistoryCard
        order={order({
          paymentEvents: [
            paymentEvent('error', '2026-09-05T15:26:00.000Z', { reasonCode: 'gw_err_0x22' }),
          ],
        })}
      />,
    );

    expect(html).not.toContain('gw_err_0x22');
  });

  it('sin eventos lo dice en lugar de dejar la tarjeta muda', () => {
    const html = renderToStaticMarkup(<OrderPaymentHistoryCard order={order()} />);

    expect(html).toContain('Todavía no hay eventos de pago');
  });
});

describe('notificaciones', () => {
  it('es de solo lectura: no monta ningún control', () => {
    const html = renderToStaticMarkup(
      <OrderNotificationsCard
        order={order({
          notifications: [
            notification(),
            notification({ id: 'ntf_2', audience: 'admin', status: 'suppressed' }),
          ],
        })}
      />,
    );

    expect(html).not.toContain('<button');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<a ');
  });

  /* Las tres confusiones que el contrato señala, cada una con su frase. */
  it('previewed no se presenta como enviado', () => {
    const html = renderToStaticMarkup(
      <OrderNotificationsCard order={order({ notifications: [notification()] })} />,
    );

    expect(html).toContain('Previsualizado');
    expect(html).toContain('La plantilla se generó para revisión. No se envió un correo.');
  });

  it('suppressed no se presenta como error', () => {
    const html = renderToStaticMarkup(
      <OrderNotificationsCard
        order={order({
          notifications: [notification({ status: 'suppressed', deliveryMode: 'disabled' })],
        })}
      />,
    );

    expect(html).toContain('Suprimido');
    expect(html).toContain('El envío estaba deshabilitado para este entorno.');
    expect(html).toContain('Deshabilitado');
  });

  it('failed no se presenta como fallo de la transición del pedido', () => {
    const html = renderToStaticMarkup(
      <OrderNotificationsCard
        order={order({
          notifications: [
            notification({
              status: 'failed',
              deliveryMode: 'provider',
              attempts: 3,
              lastErrorCode: 'provider_unavailable',
            }),
          ],
        })}
      />,
    );

    expect(html).toContain('El pedido se actualizó, pero la notificación no pudo entregarse.');
    expect(html).toContain('El proveedor de correo no respondió');
  });

  /* El contrato no publica destinatario ni cuerpo, y el panel no los enseña ni por accidente. */
  it('no muestra destinatarios, plantillas ni cuerpos', () => {
    const html = renderToStaticMarkup(
      <OrderNotificationsCard order={order({ notifications: [notification()] })} />,
    );

    expect(html).not.toContain('customer_payment_approved');
    expect(html).not.toContain('@');
    expect(html).not.toContain('ntf_0123456789abcdef');
  });

  it('nombra order_ready_to_ship con su etiqueta', () => {
    const html = renderToStaticMarkup(
      <OrderNotificationsCard
        order={order({
          notifications: [
            notification({
              eventKey: 'order_ready_to_ship',
              status: 'sent',
              deliveryMode: 'provider',
            }),
          ],
        })}
      />,
    );

    expect(html).toContain('Listo para envío');
    expect(html).not.toContain('order_ready_to_ship');
  });

  it('sin avisos lo dice en lugar de dejar la tarjeta muda', () => {
    expect(renderToStaticMarkup(<OrderNotificationsCard order={order()} />)).toContain(
      'todavía no ha generado ningún aviso',
    );
  });
});

describe('recorrido de siete hitos', () => {
  const full = [
    entry('pending_payment', '2026-09-05T15:24:00.000Z', 'Pedido recibido'),
    entry('paid', '2026-09-05T15:28:00.000Z', 'Pedido confirmado'),
    entry('preparing', '2026-09-05T19:30:00.000Z', 'En producción'),
    entry('ready_to_ship', '2026-09-06T09:00:00.000Z', 'Listo para envío'),
    entry('shipped', '2026-09-06T14:00:00.000Z', 'Enviado'),
    entry('delivered', '2026-09-08T16:00:00.000Z', 'Entregado'),
  ];

  it('pinta los siete', () => {
    const html = renderToStaticMarkup(
      <OrderProgress
        paymentEvents={[paymentEvent('approved', '2026-09-05T15:28:00.000Z')]}
        status="delivered"
        timeline={full}
      />,
    );

    for (const label of [
      'Pedido recibido',
      'Pago confirmado',
      'Pedido confirmado',
      'En producción',
      'Listo para envío',
      'Enviado',
      'Entregado',
    ]) {
      expect(html, label).toContain(label);
    }
  });

  /*
   * Un pedido antiguo pasó de `preparing` a `shipped` cuando `ready_to_ship` no existía. El panel
   * **no** afirma que ese paso ocurriera, y lo dice en texto, no solo con un color.
   */
  it('un paso heredado que no se registró se explica sin darlo por ocurrido', () => {
    const html = renderToStaticMarkup(
      <OrderProgress
        paymentEvents={[]}
        status="shipped"
        timeline={[
          entry('pending_payment', '2026-09-05T15:24:00.000Z', 'Pedido recibido'),
          entry('paid', '2026-09-05T15:28:00.000Z', 'Pedido confirmado'),
          entry('preparing', '2026-09-05T19:30:00.000Z', 'En producción'),
          entry('shipped', '2026-09-06T14:00:00.000Z', 'Enviado'),
        ]}
      />,
    );

    expect(html).toContain('No registrado');
    expect(html).toContain('el panel no afirma que ocurrieran');
  });

  it('un pedido cancelado conserva sus hitos y cuenta la cancelación aparte', () => {
    const html = renderToStaticMarkup(
      <OrderProgress
        paymentEvents={[]}
        status="cancelled"
        timeline={[
          entry('pending_payment', '2026-09-05T15:24:00.000Z', 'Pedido recibido'),
          entry('cancelled', '2026-09-05T16:00:00.000Z', 'Pedido cancelado'),
        ]}
      />,
    );

    expect(html).toContain('El pedido se canceló el');
    expect(html).toContain('Los hitos que alcanzó se conservan');
  });
});

describe('novedades', () => {
  it('pinta lo más reciente arriba y usa las etiquetas del backend', () => {
    const html = renderToStaticMarkup(
      <OrderActivityCard
        order={order({
          timeline: [
            entry('pending_payment', '2026-09-05T15:24:00.000Z', 'Pedido recibido'),
            entry('paid', '2026-09-05T15:28:00.000Z', 'Pedido confirmado'),
          ],
          paymentEvents: [paymentEvent('approved', '2026-09-05T15:28:00.000Z')],
        })}
      />,
    );

    expect(html.indexOf('Pedido confirmado')).toBeLessThan(html.indexOf('Pedido recibido'));
    expect(html).toContain('Pago approved');
  });

  /* Un `payment_approved` escribe dos correos. La corriente no cuenta el mismo hecho dos veces. */
  it('no repite el mismo hecho por cada destinatario', () => {
    const html = renderToStaticMarkup(
      <OrderActivityCard
        order={order({
          notifications: [notification(), notification({ id: 'ntf_2', audience: 'admin' })],
        })}
      />,
    );

    expect(html.split('Avisos de').length - 1).toBe(1);
  });
});
