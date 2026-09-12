/**
 * Acciones disponibles sobre un pedido, derivadas del rol y del estado.
 *
 * Función **pura**, sin jerarquía numérica: el permiso sale de la matriz explícita de
 * `@/features/session/permissions` y las transiciones de una tabla literal. Una escala tipo
 * «master_admin ≥ moderator» parece cómoda hasta que aparece el primer permiso que el rol superior
 * no debe tener.
 *
 * Decide **qué se muestra**. La autoridad sigue siendo el backend, que rechaza cualquier petición
 * que el rol o el estado no permitan aunque llegue fabricada a mano.
 */

import type { OrderStatus } from '@/lib/api/orders';

import { can } from '@/features/session/permissions';

/**
 * Transiciones que el panel ofrece, tal como las admite el backend.
 *
 * `pending_payment → paid` **no está, y no es un olvido**: lo hará el webhook de pagos cuando
 * exista. Ofrecerlo aquí sería una forma de marcar como cobrado algo que nadie pagó.
 *
 * `delivered` y `cancelled` son finales: no tienen entrada porque no llevan a ningún sitio.
 */
const NEXT_STATUS: Readonly<Partial<Record<OrderStatus, OrderStatus>>> = {
  paid: 'preparing',
  preparing: 'shipped',
  shipped: 'delivered',
};

/** Estados desde los que el backend admite cancelar en esta fase. */
const CANCELLABLE: readonly OrderStatus[] = ['pending_payment'];

const TRANSITION_LABELS: Readonly<Record<string, string>> = {
  preparing: 'Marcar en preparación',
  shipped: 'Marcar enviado',
  delivered: 'Marcar entregado',
};

export type OrderAction =
  | { readonly kind: 'transition'; readonly to: OrderStatus; readonly label: string }
  | { readonly kind: 'cancel'; readonly label: string };

/**
 * Acciones que este rol puede ejecutar sobre un pedido en este estado.
 *
 * Devuelve **botones concretos**, no un selector de estados: un desplegable con los seis valores
 * dejaría elegir transiciones que el backend rechaza, y el error llegaría después de pulsar.
 */
export function orderActions(role: string, status: string): readonly OrderAction[] {
  const actions: OrderAction[] = [];
  const next = NEXT_STATUS[status as OrderStatus];

  if (next !== undefined && can(role, 'orders.update_status')) {
    actions.push({
      kind: 'transition',
      to: next,
      label: TRANSITION_LABELS[next] ?? `Marcar ${next}`,
    });
  }

  if (CANCELLABLE.includes(status as OrderStatus) && can(role, 'orders.cancel')) {
    actions.push({ kind: 'cancel', label: 'Cancelar pedido' });
  }

  return actions;
}

/** ¿Este estado es final? Sirve para explicar por qué no hay ninguna acción. */
export function isFinalOrderStatus(status: string): boolean {
  return status === 'delivered' || status === 'cancelled';
}
