import { describe, expect, it } from 'vitest';

import { isFinalOrderStatus, orderActions } from './order-actions';

import { ADMIN_ROLES } from '@/features/session/permissions';

/**
 * Matriz de acciones por rol y estado.
 *
 * Es la función que decide qué botones ve cada persona, y decide **solo eso**: la autoridad es el
 * backend, que rechaza cualquier petición que el rol o el estado no permitan. Aquí se comprueba
 * que la pantalla no ofrezca algo que el backend va a rechazar, ni esconda algo que sí se puede.
 */

const ROLES = [...ADMIN_ROLES];

function labels(role: string, status: string): readonly string[] {
  return orderActions(role, status).map((action) => action.label);
}

function transitions(role: string, status: string): readonly string[] {
  return orderActions(role, status)
    .filter((action) => action.kind === 'transition')
    .map((action) => (action.kind === 'transition' ? action.to : ''));
}

describe('transiciones operativas', () => {
  /* Las tres son trabajo del día: los tres roles las ejecutan. */
  it.each([
    ['paid', 'preparing'],
    ['preparing', 'shipped'],
    ['shipped', 'delivered'],
  ])('desde %s los tres roles pueden pasar a %s', (from, to) => {
    for (const role of ROLES) {
      expect(transitions(role, from), role).toEqual([to]);
    }
  });

  /* Un solo paso cada vez: nada de saltar de `paid` a `delivered`. */
  it('no ofrece más de una transición desde ningún estado', () => {
    for (const role of ROLES) {
      for (const status of [
        'pending_payment',
        'paid',
        'preparing',
        'shipped',
        'delivered',
        'cancelled',
      ]) {
        expect(transitions(role, status).length, `${role}/${status}`).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('pending_payment', () => {
  /*
   * Marcar pagado es del webhook de pagos, que no existe. Ofrecerlo en el panel sería una forma de
   * dar por cobrado algo que nadie pagó.
   */
  it('nunca ofrece marcar como pagado, sea cual sea el rol', () => {
    for (const role of ROLES) {
      expect(transitions(role, 'pending_payment'), role).toEqual([]);
      expect(labels(role, 'pending_payment').join(' '), role).not.toMatch(/pagad/i);
    }
  });

  it('solo super_admin y master_admin pueden cancelarlo', () => {
    expect(labels('super_admin', 'pending_payment')).toEqual(['Cancelar pedido']);
    expect(labels('master_admin', 'pending_payment')).toEqual(['Cancelar pedido']);
    expect(labels('moderator', 'pending_payment')).toEqual([]);
  });
});

describe('moderator', () => {
  /* Cancelar es irreversible, y `moderator` no hace nada irreversible. */
  it('no ve «Cancelar» en ningún estado', () => {
    for (const status of [
      'pending_payment',
      'paid',
      'preparing',
      'shipped',
      'delivered',
      'cancelled',
    ]) {
      const actions = orderActions('moderator', status);

      expect(
        actions.some((action) => action.kind === 'cancel'),
        status,
      ).toBe(false);
    }
  });

  it('sí mueve el pedido por los estados operativos', () => {
    expect(transitions('moderator', 'paid')).toEqual(['preparing']);
  });
});

describe('cancelación', () => {
  /* Un pedido pagado exige reembolso, y el reembolso no existe: no se ofrece cancelar. */
  it.each(['paid', 'preparing', 'shipped', 'delivered', 'cancelled'])(
    'no se ofrece desde %s ni siquiera a super_admin',
    (status) => {
      const actions = orderActions('super_admin', status);

      expect(actions.some((action) => action.kind === 'cancel')).toBe(false);
    },
  );
});

describe('estados finales', () => {
  it.each(['delivered', 'cancelled'])('%s no ofrece ninguna acción a ningún rol', (status) => {
    for (const role of ROLES) {
      expect(orderActions(role, status), role).toEqual([]);
    }

    expect(isFinalOrderStatus(status)).toBe(true);
  });

  it('los estados intermedios no son finales', () => {
    for (const status of ['pending_payment', 'paid', 'preparing', 'shipped']) {
      expect(isFinalOrderStatus(status), status).toBe(false);
    }
  });
});

describe('estados desconocidos', () => {
  /* Si el backend añade un estado, la pantalla no ofrece nada en lugar de romperse. */
  it('no ofrece acciones para un estado que el panel no conoce', () => {
    expect(orderActions('super_admin', 'refunded')).toEqual([]);
  });
});
