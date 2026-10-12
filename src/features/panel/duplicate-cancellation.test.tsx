import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { OrderDuplicateCancellationCard } from './duplicate-cancellation-card';
import {
  duplicateCancellationBody,
  duplicateFailureText,
  duplicateLockText,
  duplicateNoteFor,
  isPublicOrderId,
  parseDuplicateCancellation,
} from './duplicate-cancellation';
import { describeEditFailure, parseOrderEdit } from './order-edit';

import type { AdminOrder } from '@/lib/api/orders';

/** «Cancelar como pedido duplicado» en el panel. Datos ficticios. */

function order(overrides: Record<string, unknown> = {}): AdminOrder {
  return {
    id: 'ord_dup',
    publicId: 'MZ-TESTONL1',
    version: 2,
    status: 'pending_payment',
    statusLabel: 'Pendiente de pago',
    duplicateOf: null,
    duplicateCancellationEditing: { allowed: true, lock: null },
    ...overrides,
  } as unknown as AdminOrder;
}

const render = (value: AdminOrder, role = 'master_admin') =>
  renderToStaticMarkup(
    <OrderDuplicateCancellationCard onUpdated={() => undefined} order={value} role={role} />,
  );

describe('la acción', () => {
  it.each(['super_admin', 'master_admin'])('%s la ve cuando el backend la permite', (role) => {
    const html = render(order(), role);
    expect(html).toContain('Cancelar como pedido duplicado');
    expect(html).toContain('no se envía ningún correo');
  });

  it('moderador no la ve', () => {
    expect(render(order(), 'moderator')).toBe('');
  });

  it('bloqueada, dice por qué en lugar de esconderla', () => {
    const html = render(
      order({
        duplicateCancellationEditing: { allowed: false, lock: 'duplicate_order_attempt_active' },
      }),
    );
    expect(html).toContain('Hay un intento de pago abierto');
    expect(html).not.toContain('<button');
  });

  it('con un backend anterior (sin los campos) no hay sección', () => {
    expect(render(order({ duplicateOf: undefined, duplicateCancellationEditing: undefined }))).toBe(
      '',
    );
  });

  it('un pedido ya cancelado como duplicado enseña el canónico y la nota, sin acción', () => {
    const html = render(
      order({
        status: 'cancelled',
        statusLabel: 'Cancelado',
        duplicateOf: {
          reason: 'duplicate_order',
          canonicalOrderId: 'ord_can',
          canonicalPublicId: 'MZ-CANONIC1',
          note: 'Pedido duplicado de MZ-CANONIC1',
          actorRole: 'master_admin',
          at: '2026-10-12T15:00:00.000Z',
        },
        duplicateCancellationEditing: { allowed: false, lock: 'duplicate_order_not_pending' },
      }),
    );
    expect(html).toContain('Cancelado como duplicado de MZ-CANONIC1');
    expect(html).toContain('Nota: Pedido duplicado de MZ-CANONIC1');
    expect(html).toContain('sin enviar correos');
    expect(html).not.toContain('<button');
  });
});

describe('el cuerpo', () => {
  it('motivo exacto, canónico normalizado, nota y confirmación solo al guardar', () => {
    expect(
      duplicateCancellationBody(2, { canonicalPublicId: ' mz-canonic1 ', note: 'n' }, false),
    ).toEqual({
      expectedVersion: 2,
      duplicateCancellation: {
        reason: 'duplicate_order',
        canonicalPublicId: 'MZ-CANONIC1',
        note: 'n',
      },
    });
    expect(
      duplicateCancellationBody(2, { canonicalPublicId: 'MZ-CANONIC1', note: 'n' }, true)
        .duplicateCancellation.confirmed,
    ).toBe(true);
  });

  it('la frontera solo deja pasar la forma cerrada, y sola', () => {
    const valid = { reason: 'duplicate_order', canonicalPublicId: 'MZ-CANONIC1', note: 'n' };
    expect(parseDuplicateCancellation(valid)).toEqual(valid);
    expect(parseDuplicateCancellation({ ...valid, reason: 'customer_request' })).toBeUndefined();
    expect(parseDuplicateCancellation({ ...valid, notify: true })).toBeUndefined();
    expect(parseOrderEdit({ expectedVersion: 2, duplicateCancellation: valid })).toMatchObject({
      duplicateCancellation: valid,
    });
    expect(
      parseOrderEdit({ expectedVersion: 2, duplicateCancellation: valid, internalNotes: 'x' }),
    ).toBeNull();
  });

  it('propone la nota a partir del canónico y valida el número', () => {
    expect(duplicateNoteFor('mz-5twa4sd7')).toBe('Pedido duplicado de MZ-5TWA4SD7');
    expect(isPublicOrderId('MZ-5TWA4SD7')).toBe(true);
    expect(isPublicOrderId('5TWA4SD7')).toBe(false);
  });
});

describe('mensajes', () => {
  it('cada bloqueo y cada dato mal formado tiene su texto', () => {
    for (const reason of [
      'duplicate_order_not_pending',
      'duplicate_order_payment_settled',
      'duplicate_order_attempt_active',
      'duplicate_order_reconciled',
      'duplicate_order_canonical_invalid',
    ]) {
      expect(duplicateFailureText('order_edit_blocked', reason)).not.toBeNull();
      expect(describeEditFailure('order_edit_blocked', reason)).not.toContain(
        'no permite este cambio',
      );
    }
    for (const reason of [
      'cancellation_reason_invalid',
      'canonical_order_required',
      'canonical_order_invalid',
      'note_required',
      'confirmation_required',
    ]) {
      expect(duplicateFailureText('order_reconciliation_invalid', reason)).not.toBeNull();
    }
    expect(duplicateLockText(null)).toBeNull();
  });
});
