import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { OrderAddiPaymentCard } from './addi-payment-card';
import {
  addiAttemptFacts,
  addiCancellationBody,
  parseAddiCancellation,
  providerStatusText,
  type AdminAddiAttempt,
  type AdminAddiPayment,
} from './addi-payment';
import { describeEditFailure, parseOrderEdit } from './order-edit';
import { OrderPaymentChannel } from './order-payment-summary';

import type { AdminOrder, AdminOrderListItem } from '@/lib/api/orders';

/**
 * Addi Online en el panel (ADR 0030 del backend), sobre el HTML que React produce de verdad. Todos
 * los datos son ficticios: ni referencias ni identificadores reales.
 */

const REFERENCE = 'mz-TESTONLYTESTONLYTESTONLY0';

function attempt(overrides: Partial<AdminAddiAttempt> = {}): AdminAddiAttempt {
  return {
    attemptNumber: 1,
    reference: REFERENCE,
    externalIdMasked: 'app-…0001',
    result: { outcome: 'abandoned', label: 'Abandonado por el cliente', tone: 'neutral' },
    providerStatus: 'ABANDONED',
    localStatus: 'expired',
    amountCop: 1360000,
    currency: 'COP',
    createdAt: '2026-09-19T12:00:00.000Z',
    updatedAt: '2026-09-19T12:08:00.000Z',
    expiresAt: '2026-09-19T14:00:00.000Z',
    completedAt: '2026-09-19T12:08:00.000Z',
    linkDelivered: true,
    lastError: null,
    approved: false,
    cancellation: null,
    events: [
      {
        kind: 'opened',
        at: '2026-09-19T12:00:00.000Z',
        label: 'Solicitud enviada a Addi',
        detail: null,
      },
      {
        kind: 'provider_status',
        at: '2026-09-19T12:08:00.000Z',
        label: 'Addi informó: Abandonado por el cliente',
        detail: 'ABANDONED',
      },
    ],
    ...overrides,
  } as AdminAddiAttempt;
}

function addi(overrides: Partial<AdminAddiPayment> = {}): AdminAddiPayment {
  return {
    channel: { code: 'addi_online', label: 'Addi Online' },
    current: { outcome: 'abandoned', label: 'Abandonado por el cliente', tone: 'neutral' },
    currentAttemptNumber: 1,
    approvedAttemptNumber: null,
    attempts: [attempt()],
    cancellations: [],
    cancellationNotice:
      'Addi no informa cancelaciones por callback. Una cancelación hecha en el Portal de Aliados se registra aquí.',
    cancellationEditing: { allowed: false, lock: 'addi_payment_not_approved', attemptNumber: null },
    ...overrides,
  } as AdminAddiPayment;
}

function order(overrides: Partial<AdminOrder> = {}): AdminOrder {
  return {
    id: 'ord_abc',
    publicId: 'MZ-TESTONLY',
    version: 4,
    status: 'pending_payment',
    statusLabel: 'Pendiente de pago',
    customer: { fullName: 'Persona Ficticia', email: 'ficticia@example.test', phone: '3000000000' },
    payment: {
      status: 'expired',
      statusLabel: 'Vencido',
      environment: 'live',
      attemptNumber: 1,
      approvedAt: null,
      approvedAtSource: null,
      updatedAt: '2026-09-19T12:08:00.000Z',
    },
    paymentChannel: { code: 'addi_online', label: 'Addi Online' },
    addiPayment: addi(),
    ...overrides,
  } as AdminOrder;
}

function row(overrides: Partial<AdminOrderListItem> = {}): AdminOrderListItem {
  return {
    id: 'ord_abc',
    publicId: 'MZ-TESTONLY',
    paymentStatus: 'expired',
    paymentSummary: null,
    paymentReconciliation: null,
    paymentChannel: { code: 'addi_online', label: 'Addi Online' },
    addiPayment: {
      outcome: 'abandoned',
      label: 'Abandonado por el cliente',
      tone: 'neutral',
      attemptCount: 1,
    },
    ...overrides,
  } as AdminOrderListItem;
}

const card = (value: AdminOrder, role = 'master_admin') =>
  renderToStaticMarkup(
    <OrderAddiPaymentCard onUpdated={() => undefined} order={value} role={role} />,
  );

describe('fila del listado', () => {
  it('Addi Online se identifica y lleva la pastilla del último resultado, con texto', () => {
    const html = renderToStaticMarkup(<OrderPaymentChannel order={row()} />);
    expect(html).toContain('Addi Online');
    expect(html).toContain('Abandonado por el cliente');
    expect(html).toContain('data-addi-outcome="abandoned"');
    expect(html).not.toContain('—');
  });

  it('sin callback se lee «Esperando confirmación de Addi», no un abandono', () => {
    const html = renderToStaticMarkup(
      <OrderPaymentChannel
        order={row({
          addiPayment: {
            outcome: 'awaiting_provider',
            label: 'Esperando confirmación de Addi',
            tone: 'info',
            attemptCount: 1,
          },
        })}
      />,
    );
    expect(html).toContain('Esperando confirmación de Addi');
    expect(html).not.toContain('Abandonado');
  });

  it('Addi Marketplace (manual) se dice así y no lleva pastilla de Addi Online', () => {
    const html = renderToStaticMarkup(
      <OrderPaymentChannel
        order={row({
          paymentChannel: { code: 'addi_marketplace', label: 'Addi Marketplace (manual)' },
          addiPayment: null,
        })}
      />,
    );
    expect(html).toContain('Addi Marketplace (manual)');
    expect(html).not.toContain('data-addi-outcome');
  });

  it('Wompi aprobado conserva su resumen; sin canal (backend anterior) queda el de siempre', () => {
    const summary = {
      provider: { code: 'wompi', label: 'Wompi' },
      environment: 'production',
      paymentMethod: null,
    } as AdminOrderListItem['paymentSummary'];
    const wompi = renderToStaticMarkup(
      <OrderPaymentChannel
        order={row({
          paymentChannel: { code: 'wompi', label: 'Wompi' },
          addiPayment: null,
          paymentSummary: summary,
        })}
      />,
    );
    expect(wompi).toContain('Wompi · Medio no informado');
    const legacy = { ...row(), paymentChannel: undefined, addiPayment: undefined };
    expect(
      renderToStaticMarkup(<OrderPaymentChannel order={legacy as unknown as AdminOrderListItem} />),
    ).toContain('Sin pago aprobado');
  });
});

describe('sección «Pago con Addi»', () => {
  it('muestra método, resultado en Addi, pago local y pedido sin contradecirse', () => {
    const html = card(order());
    expect(html).toContain('Pago con Addi');
    expect(html).toContain('Addi Online');
    expect(html).toContain('Abandonado por el cliente');
    expect(html).toContain('Vencido');
    expect(html).toContain('Pendiente de pago');
    expect(html).toContain('no cancela el pedido');
    expect(html).toContain(REFERENCE);
    expect(html).toContain('app-…0001');
    expect(html).toContain('$1.360.000 COP');
    expect(html).toContain('ABANDONED · el cliente salió del proceso');
  });

  it('enseña todos los intentos, del más reciente, y marca cuál terminó aprobado', () => {
    const html = card(
      order({
        status: 'paid',
        statusLabel: 'Pagado',
        addiPayment: addi({
          current: { outcome: 'approved', label: 'Aprobado por Addi', tone: 'success' },
          approvedAttemptNumber: 2,
          attempts: [
            attempt({
              attemptNumber: 2,
              reference: 'mz-TESTONLYTESTONLYTESTONLY2',
              result: { outcome: 'approved', label: 'Aprobado por Addi', tone: 'success' },
              providerStatus: 'APPROVED',
              approved: true,
            }),
            attempt({
              result: { outcome: 'rejected', label: 'Solicitud rechazada', tone: 'danger' },
              providerStatus: 'REJECTED',
            }),
          ],
        }),
      }),
    );
    expect(html.indexOf('mz-TESTONLYTESTONLYTESTONLY2')).toBeGreaterThan(-1);
    expect(html.indexOf('mz-TESTONLYTESTONLYTESTONLY2')).toBeLessThan(html.indexOf(REFERENCE));
    expect(html).toContain('Este intento terminó aprobado');
    expect(html.match(/Este intento terminó aprobado/g)).toHaveLength(1);
    expect(html).toContain('Solicitud rechazada');
  });

  it('un enlace sin entregar dice el motivo y el origen, nunca la URL', () => {
    const facts = addiAttemptFacts(
      attempt({
        result: {
          outcome: 'link_not_delivered',
          label: 'Enlace de Addi sin entregar',
          tone: 'warning',
        },
        providerStatus: null,
        linkDelivered: false,
        lastError: {
          code: 'addi_redirect_unverified',
          label: 'Origen del enlace todavía no autorizado',
          at: '2026-09-19T12:00:01.000Z',
          origin: 'https://urlv2.addi.com',
        },
      }),
    );
    const printed = JSON.stringify(facts);
    expect(printed).toContain('Sin respuesta de Addi');
    expect(printed).toContain('https://urlv2.addi.com');
    expect(printed).toContain('No entregado');
  });

  it('«Cancelado en Addi» solo con una cancelación registrada, sin borrar el APPROVED', () => {
    const cancellation = {
      id: 'addicancel_1',
      status: 'cancelled',
      statusLabel: 'Cancelado en Addi',
      source: 'addi_portal_manual',
      sourceLabel: 'Confirmada por el equipo en el Portal de Aliados de Addi',
      attemptNumber: 1,
      reference: REFERENCE,
      externalIdMasked: 'app-…0001',
      amountCop: 1360000,
      currency: 'COP',
      confirmedOn: '2026-09-20',
      externalReference: 'CAN-TESTONLY',
      note: 'Prueba ficticia',
      actorRole: 'master_admin',
      recordedAt: '2026-09-20T15:00:00.000Z',
    } as AdminAddiPayment['cancellations'][number];
    const html = card(
      order({
        status: 'paid',
        statusLabel: 'Pagado',
        addiPayment: addi({
          current: { outcome: 'cancelled', label: 'Cancelado en Addi', tone: 'warning' },
          approvedAttemptNumber: 1,
          attempts: [
            attempt({
              result: { outcome: 'approved', label: 'Aprobado por Addi', tone: 'success' },
              providerStatus: 'APPROVED',
              approved: true,
              cancellation,
            }),
          ],
          cancellations: [cancellation],
          cancellationEditing: {
            allowed: false,
            lock: 'addi_cancellation_recorded',
            attemptNumber: 1,
          },
        }),
      }),
    );
    expect(html).toContain('Cancelado en Addi');
    expect(html).toContain('Aprobado por Addi');
    expect(html).toContain('Este intento terminó aprobado');
    expect(html).toContain('Ref. CAN-TESTONLY');
    expect(html).toContain('ya está registrada');
  });

  it('sin cancelación registrada nunca dice «Cancelado en Addi»', () => {
    expect(card(order())).not.toContain('Cancelado en Addi');
  });

  it('un pedido que no es Addi Online no tiene sección', () => {
    expect(card(order({ addiPayment: null }))).toBe('');
  });

  it('avisa que Addi no informa cancelaciones', () => {
    expect(card(order())).toContain('Addi no informa cancelaciones por callback');
  });
});

describe('permisos para registrar una cancelación', () => {
  const recordable = order({
    status: 'paid',
    addiPayment: addi({
      approvedAttemptNumber: 1,
      cancellationEditing: { allowed: true, lock: null, attemptNumber: 1 },
    }),
  });

  it.each(['master_admin', 'super_admin'])('%s ve el botón', (role) => {
    expect(card(recordable, role)).toContain('Registrar cancelación confirmada en Addi');
  });

  it('moderator no lo ve', () => {
    expect(card(recordable, 'moderator')).not.toContain('Registrar cancelación');
  });
});

describe('forma de la cancelación', () => {
  it('va sola en su edición y con sus campos cerrados', () => {
    const body = addiCancellationBody(
      4,
      { confirmedOn: '2026-09-20', externalReference: '  ', note: 'Prueba' },
      true,
    );
    expect(body).toEqual({
      expectedVersion: 4,
      addiCancellation: {
        confirmedOn: '2026-09-20',
        externalReference: null,
        note: 'Prueba',
        confirmed: true,
      },
    });
    expect(parseOrderEdit(body)).toEqual(body);
    expect(parseOrderEdit({ ...body, internalNotes: 'x' })).toBeNull();
    expect(
      parseOrderEdit({ ...body, addiCancellation: { ...body.addiCancellation, amount: 1 } }),
    ).toBeNull();
    expect(parseAddiCancellation({ confirmedOn: '20/09/2026', note: 'x' })).toBeUndefined();
  });

  it('cada motivo del backend tiene su texto', () => {
    expect(describeEditFailure('order_edit_blocked', 'addi_cancellation_recorded')).toContain(
      'ya está registrada',
    );
    expect(describeEditFailure('order_edit_blocked', 'addi_payment_not_approved')).toContain(
      'no tiene un crédito aprobado',
    );
    expect(describeEditFailure('order_reconciliation_invalid', 'confirmed_on_invalid')).toContain(
      'no puede ser futuro',
    );
    expect(describeEditFailure('order_reconciliation_invalid', 'note_required')).toContain('nota');
  });

  it('el estado de Addi se lee con su significado', () => {
    expect(providerStatusText(null)).toBe('Sin respuesta de Addi');
    expect(providerStatusText('DECLINED')).toContain('crédito no aprobado');
    expect(providerStatusText('REJECTED')).toContain('solicitud rechazada');
  });
});

describe('sin datos personales', () => {
  it('la sección de Addi no repite comprador, correo ni teléfono', () => {
    const html = card(order());
    expect(html).not.toContain('Persona Ficticia');
    expect(html).not.toContain('ficticia@example.test');
    expect(html).not.toContain('3000000000');
  });
});
