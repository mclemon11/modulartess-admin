import { describe, expect, it } from 'vitest';

import { isFinalOrderStatus, orderActions, type OrderActionSubject } from './order-actions';

import { ADMIN_ROLES } from '@/features/session/permissions';

/**
 * Matriz de acciones por rol, estado del pedido y estado del pago.
 *
 * Es la función que decide qué botones ve cada persona, y decide **solo eso**: la autoridad es el
 * backend, que rechaza cualquier petición que el rol o el estado no permitan. Aquí se comprueba
 * que la pantalla no ofrezca algo que el backend va a rechazar, ni esconda algo que sí se puede.
 */

const ROLES = [...ADMIN_ROLES];

const ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'preparing',
  'ready_to_ship',
  'shipped',
  'delivered',
  'cancelled',
];

const PAYMENT_STATUSES = ['pending', 'processing', 'approved', 'declined', 'expired', 'error'];

function subject(status: string, paymentStatus = 'pending'): OrderActionSubject {
  return { status, paymentStatus };
}

function labels(role: string, status: string, paymentStatus?: string): readonly string[] {
  return orderActions(role, subject(status, paymentStatus)).map((action) => action.label);
}

function transitions(role: string, status: string): readonly string[] {
  return orderActions(role, subject(status))
    .filter((action) => action.kind === 'transition')
    .map((action) => (action.kind === 'transition' ? action.to : ''));
}

function offersCancel(role: string, status: string, paymentStatus: string): boolean {
  return orderActions(role, subject(status, paymentStatus)).some(
    (action) => action.kind === 'cancel',
  );
}

describe('transiciones logísticas', () => {
  /* Los cuatro pasos son trabajo del día: los tres roles los ejecutan. */
  it.each([
    ['paid', 'preparing'],
    ['preparing', 'ready_to_ship'],
    ['ready_to_ship', 'shipped'],
    ['shipped', 'delivered'],
  ])('desde %s los tres roles pueden pasar a %s', (from, to) => {
    for (const role of ROLES) {
      expect(transitions(role, from), role).toEqual([to]);
    }
  });

  it.each([
    ['preparing', 'Marcar listo para envío'],
    ['ready_to_ship', 'Marcar enviado'],
    ['shipped', 'Marcar entregado'],
    ['paid', 'Marcar en producción'],
  ])('desde %s el botón dice «%s»', (from, label) => {
    expect(labels('super_admin', from)).toContain(label);
  });

  /*
   * El contrato retiró `preparing → shipped`: entre producir y despachar hay un estado real, y
   * saltárselo perdía la única señal que distingue el taller del andén.
   */
  it('nunca ofrece saltarse «Listo para envío»', () => {
    for (const role of ROLES) {
      expect(transitions(role, 'preparing'), role).toEqual(['ready_to_ship']);
      expect(transitions(role, 'preparing'), role).not.toContain('shipped');
    }
  });

  /* Un solo paso cada vez, y nunca hacia atrás. */
  it('no ofrece más de una transición desde ningún estado, ni ninguna que retroceda', () => {
    const forward = ORDER_STATUSES.indexOf.bind(ORDER_STATUSES);

    for (const role of ROLES) {
      for (const status of ORDER_STATUSES) {
        const next = transitions(role, status);

        expect(next.length, `${role}/${status}`).toBeLessThanOrEqual(1);

        for (const to of next) {
          expect(forward(to), `${role}/${status} → ${to}`).toBeGreaterThan(forward(status));
        }
      }
    }
  });
});

describe('pending_payment', () => {
  /*
   * Marcar pagado lo aplica el desenlace del pago, en la misma transacción que lo confirma. Las
   * acciones logísticas no lo ofrecen: sería dar por cobrado algo que nadie pagó.
   */
  it('nunca ofrece marcar como pagado, sea cual sea el rol o el estado del pago', () => {
    for (const role of ROLES) {
      for (const paymentStatus of PAYMENT_STATUSES) {
        expect(transitions(role, 'pending_payment'), role).toEqual([]);
        expect(labels(role, 'pending_payment', paymentStatus).join(' '), role).not.toMatch(
          /pagad/i,
        );
      }
    }
  });
});

describe('cancelación según el estado del pago', () => {
  /*
   * Con un intento de pago **en curso** cancelar es una carrera: puede aprobarse entre que se lee
   * la pantalla y se pulsa, y entonces se estaría cancelando un pedido recién cobrado.
   */
  it('no se ofrece mientras el pago está en curso, ni siquiera a super_admin', () => {
    for (const role of ROLES) {
      expect(offersCancel(role, 'pending_payment', 'processing'), role).toBe(false);
    }
  });

  it.each(['pending', 'declined', 'expired', 'error'])(
    'con el pago %s se ofrece a quien tiene orders.cancel',
    (paymentStatus) => {
      expect(offersCancel('super_admin', 'pending_payment', paymentStatus)).toBe(true);
      expect(offersCancel('master_admin', 'pending_payment', paymentStatus)).toBe(true);
      // `moderator` no tiene `orders.cancel`: cancelar es irreversible.
      expect(offersCancel('moderator', 'pending_payment', paymentStatus)).toBe(false);
    },
  );

  /* Un pedido pagado exige reembolso, y el reembolso no existe: no se ofrece cancelar. */
  it.each(['paid', 'preparing', 'ready_to_ship', 'shipped', 'delivered', 'cancelled'])(
    'no se ofrece desde %s ni siquiera a super_admin',
    (status) => {
      for (const paymentStatus of PAYMENT_STATUSES) {
        expect(offersCancel('super_admin', status, paymentStatus), paymentStatus).toBe(false);
      }
    },
  );
});

describe('moderator', () => {
  /* Cancelar es irreversible, y `moderator` no hace nada irreversible. */
  it('no ve «Cancelar» en ninguna combinación', () => {
    for (const status of ORDER_STATUSES) {
      for (const paymentStatus of PAYMENT_STATUSES) {
        expect(offersCancel('moderator', status, paymentStatus), `${status}/${paymentStatus}`).toBe(
          false,
        );
      }
    }
  });

  it('sí mueve el pedido por los estados operativos', () => {
    expect(transitions('moderator', 'paid')).toEqual(['preparing']);
    expect(transitions('moderator', 'ready_to_ship')).toEqual(['shipped']);
  });
});

describe('estados finales', () => {
  it.each(['delivered', 'cancelled'])('%s no ofrece ninguna acción a ningún rol', (status) => {
    for (const role of ROLES) {
      expect(orderActions(role, subject(status)), role).toEqual([]);
    }

    expect(isFinalOrderStatus(status)).toBe(true);
  });

  it('los estados intermedios no son finales', () => {
    for (const status of ['pending_payment', 'paid', 'preparing', 'ready_to_ship', 'shipped']) {
      expect(isFinalOrderStatus(status), status).toBe(false);
    }
  });
});

describe('estados desconocidos', () => {
  /* Si el backend añade un estado, la pantalla no ofrece nada en lugar de romperse. */
  it('no ofrece acciones para un estado que el panel no conoce', () => {
    expect(orderActions('super_admin', subject('refunded'))).toEqual([]);
  });
});
