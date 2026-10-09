import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { sessionErrorStatus, sessionErrorFromBackendFailure } from '@/features/session/api-errors';
import { orderEditFailure } from '@/lib/api/errors';
import type {
  AdminOrder,
  AdminOrderListItem,
  AdminPaymentAttempt,
  EditOrderResult,
} from '@/lib/api/orders';

import { OrderPaymentCard } from './order-detail-cards';
import { describeEditFailure, describeWarnings, parseOrderEdit } from './order-edit';
import { OrderReconciliationLine } from './order-payment-summary';
import {
  confirmedReconciliation,
  finalPaymentLine,
  noteRequired,
  originalAttemptLine,
  parseReconciliation,
  PROVIDER_RECORD_NOTICE,
  RECONCILIATION_EXTERNAL_ID_MAX,
  RECONCILIATION_NOTE_INPUT_MAX,
  RECONCILIATION_NOTE_MAX,
  reconciliationDraftOf,
  reconciliationLockReason,
  reconciliationProblem,
  reconciliationRequestOf,
  reconciliationRowText,
  reconciliationSummary,
  type AdminReconciliation,
  type ReconciliationDraft,
} from './payment-reconciliation';

/**
 * Conciliación manual en el panel (ADR 0014; ADR 0029 del backend).
 *
 * Lo que se protege: que el cuerpo vaya solo y cerrado; que nota y referencia se pidan donde el
 * backend las pide; que la confirmación explícita viaje solo al guardar; que el intento de Wompi y
 * el pago final se lean separados; y que «Confirmado manualmente» nunca parezca una confirmación de
 * Wompi.
 */

const contract = JSON.parse(readFileSync('openapi/backend-v1.json', 'utf8')) as {
  components: { schemas: Record<string, { properties?: Record<string, { maxLength?: number }> }> };
};

const EDITING: AdminOrder['paymentEditing']['reconciliation'] = {
  locked: null,
  statuses: ['pending', 'unpaid', 'failed', 'paid'],
  methods: ['wompi', 'addi', 'bank_transfer', 'cash'],
  noteRequired: true,
  externalPaymentIdRequiredFor: ['paid'],
  providerAttemptPreserved: true,
};

const DRAFT: ReconciliationDraft = {
  status: 'paid',
  finalMethod: 'addi',
  externalPaymentId: '  ADDI-MKT-778899 ',
  note: '  El cliente no completó Wompi y pagó por Addi Marketplace. ',
};

function attempt(overrides: Partial<AdminPaymentAttempt> = {}): AdminPaymentAttempt {
  return {
    environment: 'production',
    status: 'declined',
    createdAt: '2026-10-09T12:00:00.000Z',
    attemptNumber: 1,
    expiresAt: '2026-10-09T12:30:00.000Z',
    hasTransactionId: true,
    provider: { code: 'wompi', label: 'Wompi' },
    paymentMethod: null,
    ...overrides,
  } as AdminPaymentAttempt;
}

function reconciliation(overrides: Partial<AdminReconciliation> = {}): AdminReconciliation {
  const current = {
    id: 'rec_ord_abc_v4',
    status: 'paid',
    statusLabel: 'Pagado',
    kind: 'external_channel',
    kindLabel: 'Pago por otro medio',
    originalMethod: 'wompi',
    originalMethodLabel: 'Wompi',
    finalMethod: 'addi',
    finalMethodLabel: 'Addi',
    paymentStatusBefore: 'declined',
    paymentStatusAfter: 'approved',
    preservedAttemptNumber: 1,
    externalPaymentId: 'ADDI-MKT-778899',
    note: 'Nota privada del equipo',
    actorUid: 'uid_master',
    actorRole: 'master_admin',
    recordedAt: '2026-10-09T15:00:00.000Z',
    orderVersion: 4,
  } as AdminReconciliation['current'];

  return {
    status: 'paid',
    statusLabel: 'Pagado',
    reviewRequired: false,
    current,
    entries: [current],
    conflicts: [],
    ...overrides,
  } as AdminReconciliation;
}

function order(overrides: Partial<AdminOrder> = {}): AdminOrder {
  return {
    id: 'ord_abc',
    publicId: 'MZ-7KQ2R9DA',
    version: 3,
    status: 'pending_payment',
    statusLabel: 'Pendiente de pago',
    createdAt: '2026-10-09T12:00:00.000Z',
    updatedAt: '2026-10-09T12:00:00.000Z',
    timeline: [],
    payment: {
      status: 'declined',
      statusLabel: 'Pago rechazado',
      environment: 'live',
      attemptNumber: 1,
      approvedAt: null,
      approvedAtSource: null,
      updatedAt: '2026-10-09T12:05:00.000Z',
    },
    paymentAttempts: [attempt()],
    paymentEvents: [],
    notifications: [],
    paymentEditing: {
      method: 'wompi',
      methodLabel: 'Wompi',
      manual: false,
      methodLocked: 'checkout_opened',
      statusLocked: 'payment_status_automatic',
      manualEvents: [],
      reconciliation: EDITING,
    },
    paymentReconciliation: null,
    paymentSimulationEnabled: false,
    availableSimulationEvents: [],
    paymentSummary: null,
    ...overrides,
  } as AdminOrder;
}

describe('cuerpo de la conciliación', () => {
  it('va sola, con la versión que se leyó, recortada y sin confirmar', () => {
    const request = reconciliationRequestOf(order(), DRAFT);

    expect(request).toEqual({
      expectedVersion: 3,
      paymentReconciliation: {
        status: 'paid',
        finalMethod: 'addi',
        externalPaymentId: 'ADDI-MKT-778899',
        note: 'El cliente no completó Wompi y pagó por Addi Marketplace.',
      },
    });
    expect(confirmedReconciliation(request).paymentReconciliation?.confirmed).toBe(true);
    // Sin conciliación, el cuerpo no cambia: la confirmación solo acompaña a una conciliación.
    expect(confirmedReconciliation({ expectedVersion: 3, internalNotes: 'x' })).toEqual({
      expectedVersion: 3,
      internalNotes: 'x',
    });
  });

  it('vacío es null, no una cadena vacía', () => {
    expect(
      reconciliationRequestOf(order(), {
        ...DRAFT,
        status: 'pending',
        externalPaymentId: ' ',
        note: '',
      }).paymentReconciliation,
    ).toMatchObject({ externalPaymentId: null, note: null });
  });

  it('el BFF la acepta sola y cerrada, y rechaza mezclas y claves ajenas', () => {
    const body = {
      expectedVersion: 3,
      paymentReconciliation: {
        status: 'paid',
        finalMethod: 'addi',
        externalPaymentId: 'A',
        note: 'B',
      },
    };

    expect(parseOrderEdit(body)).toEqual(body);
    expect(
      parseOrderEdit({
        ...body,
        paymentReconciliation: { ...body.paymentReconciliation, confirmed: true },
      }),
    ).not.toBeNull();
    for (const rejected of [
      { ...body, internalNotes: 'x' },
      { ...body, paymentStatus: 'approved' },
      { ...body, paymentReconciliation: { ...body.paymentReconciliation, transactionId: 'tx' } },
      { ...body, paymentReconciliation: { ...body.paymentReconciliation, amountCop: 1 } },
      {
        ...body,
        paymentReconciliation: { ...body.paymentReconciliation, status: 'review_required' },
      },
      { ...body, paymentReconciliation: { ...body.paymentReconciliation, finalMethod: 'paypal' } },
      { ...body, paymentReconciliation: { ...body.paymentReconciliation, confirmed: 'yes' } },
      {
        ...body,
        paymentReconciliation: {
          ...body.paymentReconciliation,
          note: 'a'.repeat(RECONCILIATION_NOTE_INPUT_MAX + 1),
        },
      },
    ]) {
      expect(parseOrderEdit(rejected), JSON.stringify(rejected).slice(0, 80)).toBeNull();
    }
    expect(parseReconciliation(null)).toBeUndefined();
  });

  it('los límites son los del contrato', () => {
    const input = contract.components.schemas.EditOrderReconciliationInputDto!.properties!;
    const entry = contract.components.schemas.AdminOrderPaymentReconciliationEntryDto!.properties!;

    expect(input.note?.maxLength).toBe(RECONCILIATION_NOTE_INPUT_MAX);
    expect(input.externalPaymentId?.maxLength).toBe(RECONCILIATION_EXTERNAL_ID_MAX);
    expect(entry.note?.maxLength).toBe(RECONCILIATION_NOTE_MAX);
  });
});

describe('comprobaciones antes de llamar', () => {
  it('«Pagado» exige referencia; los demás estados no', () => {
    expect(reconciliationProblem(EDITING, { ...DRAFT, externalPaymentId: '  ' })).toMatch(
      /referencia/,
    );
    for (const status of ['pending', 'unpaid', 'failed'] as const) {
      expect(
        reconciliationProblem(EDITING, { ...DRAFT, status, externalPaymentId: '' }),
      ).toBeNull();
    }
  });

  it('la nota es obligatoria cuando interviene Wompi', () => {
    expect(reconciliationProblem(EDITING, { ...DRAFT, note: ' ' })).toMatch(/nota/);
    const manual = { ...EDITING, noteRequired: false };

    expect(reconciliationProblem(manual, { ...DRAFT, finalMethod: 'cash', note: '' })).toBeNull();
    // Conservar Wompi como medio final también exige nota.
    expect(noteRequired(manual, { ...DRAFT, finalMethod: 'wompi' })).toBe(true);
  });

  it('no ofrece un estado que el backend no publica', () => {
    expect(
      reconciliationProblem({ ...EDITING, statuses: ['pending', 'unpaid', 'failed'] }, DRAFT),
    ).toMatch(/no está disponible/);
  });

  it('acota referencia y nota', () => {
    expect(
      reconciliationProblem(EDITING, {
        ...DRAFT,
        externalPaymentId: 'A'.repeat(RECONCILIATION_EXTERNAL_ID_MAX + 1),
      }),
    ).toMatch(/máximo/);
    expect(
      reconciliationProblem(EDITING, { ...DRAFT, note: 'a'.repeat(RECONCILIATION_NOTE_MAX + 1) }),
    ).toMatch(/máximo/);
  });

  it('el borrador nace de la conciliación vigente, sin copiar la nota', () => {
    const draft = reconciliationDraftOf(order({ paymentReconciliation: reconciliation() }));

    expect(draft).toEqual({
      status: 'paid',
      finalMethod: 'addi',
      externalPaymentId: 'ADDI-MKT-778899',
      note: '',
    });
    expect(reconciliationDraftOf(order())).toMatchObject({ status: 'paid', finalMethod: 'wompi' });
  });
});

describe('bloqueos y errores', () => {
  it.each([
    ['payment_confirmed_by_provider', /Wompi confirmó/],
    ['reconciliation_payment_settled', /revisión/],
    ['reconciliation_order_closed', /cancelado/],
  ] as const)('%s se explica', (locked, text) => {
    expect(reconciliationLockReason({ ...EDITING, locked })).toMatch(text);
    expect(describeEditFailure('order_edit_blocked', locked)).toMatch(text);
  });

  it('cada motivo de una conciliación inválida tiene su texto', () => {
    for (const reason of [
      'note_required',
      'external_payment_id_required',
      'confirmation_required',
      'note_too_long',
    ]) {
      expect(describeEditFailure('order_reconciliation_invalid', reason)).not.toMatch(
        /Revisa la conciliación/,
      );
    }
    expect(describeEditFailure('order_reconciliation_invalid', 'otro')).toMatch(
      /Revisa la conciliación/,
    );
  });

  it('el BFF traduce el 400 del backend con su motivo y sin su texto', () => {
    const failure = orderEditFailure(400, {
      code: 'order_reconciliation_invalid',
      reason: 'note_required',
      message: 'texto interno del backend',
    });

    expect(failure.code).toBe('backend_order_reconciliation_invalid');
    expect(failure.reference).toBe('note_required');
    expect(sessionErrorFromBackendFailure(failure.code)).toBe('order_reconciliation_invalid');
    expect(sessionErrorStatus('order_reconciliation_invalid')).toBe(400);
  });

  it('las advertencias nuevas dicen que Wompi no se toca y avisan del posible duplicado', () => {
    const texts = describeWarnings([
      'provider_record_preserved',
      'provider_attempt_open',
      'possible_duplicate_payment',
    ]);

    expect(texts[0]).toContain(PROVIDER_RECORD_NOTICE);
    expect(texts[1]).toMatch(/Revisión requerida/);
    expect(texts[2]).toMatch(/duplicado/);
  });
});

describe('resumen de la vista previa', () => {
  it('enseña conciliación, medio final, pago, pedido y referencia como los devuelve el backend', () => {
    const before = order();
    const after = order({
      status: 'paid',
      statusLabel: 'Pedido confirmado',
      paymentReconciliation: reconciliation(),
    });
    const rows = reconciliationSummary(before, {
      order: after,
      payment: {
        methodBefore: 'wompi',
        methodAfter: 'addi',
        statusBefore: 'declined',
        statusAfter: 'approved',
      },
    } as Pick<EditOrderResult, 'order' | 'payment'>);

    expect(rows.map((row) => [row.label, row.before, row.after])).toEqual([
      ['Conciliación', 'Sin conciliación', 'Pagado'],
      ['Medio final', 'Wompi', 'Addi Marketplace'],
      ['Estado del pago', expect.any(String), expect.any(String)],
      ['Estado del pedido', 'Pendiente de pago', 'Pedido confirmado'],
      ['Referencia', '—', 'ADDI-MKT-778899'],
    ]);
  });
});

describe('intento original y pago final, separados', () => {
  it('la tarjeta de pago distingue el intento de Wompi del pago por Addi Marketplace', () => {
    const html = renderToStaticMarkup(
      <OrderPaymentCard
        now={Date.parse('2026-10-09T16:00:00.000Z')}
        order={order({
          status: 'paid',
          payment: { ...order().payment, status: 'approved', statusLabel: 'Pago confirmado' },
          paymentEditing: {
            ...order().paymentEditing,
            method: 'addi',
            methodLabel: 'Addi',
            manual: true,
          },
          paymentReconciliation: reconciliation(),
        })}
      />,
    );

    expect(html).toContain('Intento original');
    expect(html).toContain('Wompi: Pago rechazado');
    expect(html).toContain('Pago final: Addi Marketplace');
    expect(html).toContain('Pagado · Conciliado manualmente');
    expect(html).toContain('ADDI-MKT-778899');
    // La nota es del equipo y se lee en el diálogo, no en la tarjeta.
    expect(html).not.toContain('Nota privada del equipo');
  });

  it('«Confirmado manualmente» con Wompi nunca se presenta como confirmación de Wompi', () => {
    const line = finalPaymentLine(
      reconciliation({
        current: {
          ...reconciliation().current,
          kind: 'manual_confirmation',
          finalMethod: 'wompi',
          finalMethodLabel: 'Wompi',
        },
      }),
    );

    expect(line.text).toContain('Confirmado manualmente, no por Wompi');
  });

  it('«Revisión requerida» se anuncia como alerta, con texto', () => {
    const html = renderToStaticMarkup(
      <OrderPaymentCard
        now={null}
        order={order({
          paymentReconciliation: reconciliation({
            status: 'review_required',
            statusLabel: 'Revisión requerida',
            reviewRequired: true,
            conflicts: [
              {
                kind: 'duplicate_approval',
                kindLabel: 'Posible pago duplicado',
                detectedAt: '2026-10-09T16:00:00.000Z',
              },
            ],
          }),
        })}
      />,
    );

    expect(html).toMatch(/role="alert"[^>]*>Revisión requerida: Posible pago duplicado/);
  });

  it('sin conciliación, la tarjeta es la de siempre', () => {
    const html = renderToStaticMarkup(<OrderPaymentCard now={null} order={order()} />);

    expect(html).not.toContain('Pago final');
    expect(html).not.toContain('Intento original');
  });

  it('con un backend anterior a ADR 0029 (rollback) no rompe la ficha ni la fila', () => {
    const legacy = order();

    delete (legacy as Partial<AdminOrder>).paymentReconciliation;
    expect(renderToStaticMarkup(<OrderPaymentCard now={null} order={legacy} />)).not.toContain(
      'Pago final',
    );
    expect(
      reconciliationRowText(undefined as unknown as AdminOrderListItem['paymentReconciliation']),
    ).toBeNull();
    expect(reconciliationDraftOf(legacy).status).toBe('paid');
  });

  it('sin checkout no hay intento original que enseñar', () => {
    expect(originalAttemptLine([], null)).toBeNull();
    expect(originalAttemptLine([attempt({ status: 'processing' })], null)?.title).toBe(
      'Wompi: Transacción pendiente',
    );
  });

  it('el listado añade el pago final debajo del medio, y la revisión con texto', () => {
    const summary: AdminOrderListItem['paymentReconciliation'] = {
      status: 'paid',
      statusLabel: 'Pagado',
      reviewRequired: false,
      finalMethod: 'addi',
      finalMethodLabel: 'Addi',
    };

    expect(reconciliationRowText(summary)).toEqual({
      visible: 'Pago final: Addi Marketplace · Pagado',
      review: false,
    });
    expect(
      reconciliationRowText({ ...summary, status: 'review_required', reviewRequired: true }),
    ).toEqual({ visible: 'Revisión requerida · Addi Marketplace', review: true });
    expect(renderToStaticMarkup(<OrderReconciliationLine summary={null} />)).toBe('');
    expect(renderToStaticMarkup(<OrderReconciliationLine summary={summary} />)).toContain(
      'Pago final: Addi Marketplace · Pagado',
    );
  });
});

describe('diálogo', () => {
  const source = readFileSync('src/features/panel/order-edit-dialog.tsx', 'utf8');

  it('separa el intento original, solo lectura, de la conciliación editable', () => {
    const original = source.slice(
      source.indexOf('function OriginalAttemptFieldset('),
      source.indexOf('function ReconciliationFieldset('),
    );

    expect(original).toContain('Intento de pago original');
    expect(original).toContain('Solo lectura');
    expect(original).not.toMatch(/<input|<select|<textarea|onChange/);
    expect(source).toContain('<legend className={catalog.label}>Conciliación manual</legend>');
  });

  it('la conciliación pasa siempre por revisión y confirmación explícita, y solo con permiso', () => {
    expect(source).toContain('Revisar conciliación');
    expect(source).toContain('Sí, registrar conciliación');
    expect(source).toContain('confirmedReconciliation(request)');
    expect(source).toContain('Tu rol no permite conciliar pagos.');
    expect(source).toContain('PROVIDER_RECORD_NOTICE');
  });
});
