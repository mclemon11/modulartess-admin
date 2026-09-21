/**
 * Acciones disponibles sobre un pedido, derivadas del rol, del estado del pedido y del estado del
 * pago.
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
 * Transiciones logísticas que el panel ofrece, tal como las admite el backend.
 *
 * Son cuatro pasos encadenados y ninguno se salta. `preparing → shipped` **ya no vale**: el
 * contrato lo rechaza desde que existe `ready_to_ship`, porque saltárselo perdía la única señal que
 * distingue un pedido todavía en el taller de uno terminado esperando al transportador.
 *
 * `pending_payment → paid` **no está, y no es un olvido**: lo aplica el desenlace del pago, en la
 * misma transacción que lo confirma. En staging eso es el simulador; en producción lo será el
 * webhook verificado. Ofrecerlo entre las acciones logísticas sería marcar como cobrado algo que
 * nadie pagó.
 *
 * `delivered` y `cancelled` son finales: no tienen entrada porque no llevan a ningún sitio.
 */
const NEXT_STATUS: Readonly<Partial<Record<OrderStatus, OrderStatus>>> = {
  paid: 'preparing',
  preparing: 'ready_to_ship',
  ready_to_ship: 'shipped',
  shipped: 'delivered',
};

const TRANSITION_LABELS: Readonly<Record<string, string>> = {
  preparing: 'Marcar en producción',
  ready_to_ship: 'Marcar listo para envío',
  shipped: 'Marcar enviado',
  delivered: 'Marcar entregado',
};

export type OrderAction =
  | { readonly kind: 'transition'; readonly to: OrderStatus; readonly label: string }
  | { readonly kind: 'cancel'; readonly label: string };

export type OrderActionSubject = {
  readonly status: string;
  readonly paymentStatus: string;
};

/**
 * ¿Se puede ofrecer cancelar?
 *
 * Ya no depende solo del estado del pedido. El backend admite cancelar un `pending_payment`, pero
 * con el pago **en curso** ofrecerlo sería una carrera: el intento puede aprobarse entre que se lee
 * la pantalla y se pulsa, y entonces se estaría cancelando un pedido que acaba de cobrarse. Con el
 * pago pendiente, rechazado, vencido o en error no hay nada en vuelo y cancelar es limpio.
 *
 * El backend sigue siendo la autoridad: esto solo decide qué botón se pinta.
 */
function canOfferCancel(subject: OrderActionSubject): boolean {
  return subject.status === 'pending_payment' && subject.paymentStatus !== 'processing';
}

/**
 * Acciones que este rol puede ejecutar sobre este pedido.
 *
 * Devuelve **botones concretos**, no un selector de estados: un desplegable con los siete valores
 * dejaría elegir transiciones que el backend rechaza, y el error llegaría después de pulsar. Como
 * mucho hay una transición, que es la siguiente válida.
 */
export function orderActions(role: string, subject: OrderActionSubject): readonly OrderAction[] {
  const actions: OrderAction[] = [];
  const next = NEXT_STATUS[subject.status as OrderStatus];

  if (next !== undefined && can(role, 'orders.update_status')) {
    actions.push({
      kind: 'transition',
      to: next,
      label: TRANSITION_LABELS[next] ?? `Marcar ${next}`,
    });
  }

  if (canOfferCancel(subject) && can(role, 'orders.cancel')) {
    actions.push({ kind: 'cancel', label: 'Cancelar pedido' });
  }

  return actions;
}

/** ¿Este estado es final? Sirve para explicar por qué no hay ninguna acción. */
export function isFinalOrderStatus(status: string): boolean {
  return status === 'delivered' || status === 'cancelled';
}
