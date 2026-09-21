/**
 * La fotografía operativa, en el orden del recorrido.
 *
 * `operations` **no** es del período: el contrato dice que es «the snapshot of RIGHT NOW… it counts
 * every order in its current state, including orders created before the selected range, and it does
 * not change when the period changes». El panel lo presenta como tal y lo dice en pantalla, porque
 * un contador actual leído como si fuera del rango es una cifra falsa sin que nada parezca roto.
 *
 * Aquí no se suma ni se recalcula nada: se ordenan las ocho entradas y se les pone nombre y color.
 *
 * Módulo puro.
 */

import type { OrderStatusVariant } from './order-status';
import type { PaymentStatusVariant } from './payment-status';
import type { DashboardOperations } from '@/lib/api/dashboard';

export type OperationEntry = {
  /** Clave estable para React. No se muestra. */
  readonly key: keyof DashboardOperations;
  readonly label: string;
  readonly count: number;
  /**
   * Con qué color se pinta. Siete son estados del **pedido** y uno del **pago**, y el contrato lo
   * subraya: «paymentProcessing… is a PAYMENT state, not an order state: a payment in flight leaves
   * the order in pending_payment». Compartir la escala del pedido lo haría leer como un octavo
   * estado del pedido, que no existe.
   */
  readonly tone:
    | { readonly kind: 'order'; readonly variant: OrderStatusVariant }
    | { readonly kind: 'payment'; readonly variant: PaymentStatusVariant };
};

/**
 * El orden operativo, que es el del recorrido del pedido.
 *
 * `paymentProcessing` va en segundo lugar porque es donde ocurre: entre que el pedido entra y entre
 * que queda pagado. No se coloca al final ni se esconde, que sería tratarlo como una anomalía.
 */
const ENTRIES: readonly {
  readonly key: keyof DashboardOperations;
  readonly label: string;
  readonly tone: OperationEntry['tone'];
}[] = [
  {
    key: 'pendingPayment',
    label: 'Pendientes de pago',
    tone: { kind: 'order', variant: 'pendingPayment' },
  },
  {
    key: 'paymentProcessing',
    label: 'Pagos procesándose',
    tone: { kind: 'payment', variant: 'processing' },
  },
  { key: 'paid', label: 'Pagados por iniciar', tone: { kind: 'order', variant: 'paid' } },
  { key: 'preparing', label: 'En producción', tone: { kind: 'order', variant: 'preparing' } },
  {
    key: 'readyToShip',
    label: 'Listos para envío',
    tone: { kind: 'order', variant: 'readyToShip' },
  },
  { key: 'shipped', label: 'Enviados', tone: { kind: 'order', variant: 'shipped' } },
  { key: 'delivered', label: 'Entregados', tone: { kind: 'order', variant: 'delivered' } },
  { key: 'cancelled', label: 'Cancelados', tone: { kind: 'order', variant: 'cancelled' } },
];

/** Las ocho entradas, siempre las ocho, con el valor que mandó el backend. */
export function readOperations(operations: DashboardOperations): readonly OperationEntry[] {
  return ENTRIES.map((entry) => ({
    key: entry.key,
    label: entry.label,
    count: operations[entry.key],
    tone: entry.tone,
  }));
}

/**
 * Proporción de una barra de distribución.
 *
 * Devuelve `null` cuando el total es cero: sin nada que repartir no hay porcentaje, y pintar «0 %»
 * o una barra vacía al 100 % serían dos formas distintas de afirmar algo que no se sabe. Quien
 * llama decide cómo enseñar esa ausencia.
 */
export function sharePercent(count: number, total: number): number | null {
  if (total <= 0) {
    return null;
  }

  return (count / total) * 100;
}

/** Suma de una distribución. Es la suma de lo recibido, no una cifra nueva. */
export function totalOf(entries: readonly { readonly count: number }[]): number {
  return entries.reduce((total, entry) => total + entry.count, 0);
}
