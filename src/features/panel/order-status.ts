/**
 * Presentación del estado del pedido.
 *
 * Los seis valores vienen del contrato (`AdminOrderDto.status`). Un estado que no esté en el mapa
 * se muestra tal cual en lugar de romperse: si el backend añade uno, la pantalla sigue siendo
 * legible mientras el panel se pone al día.
 *
 * Módulo puro: no decide nada, solo nombra.
 */

import type { OrderStatus } from '@/lib/api/orders';

const LABELS: Readonly<Record<string, string>> = {
  pending_payment: 'Pendiente de pago',
  paid: 'Pagado',
  preparing: 'En preparación',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

export function describeOrderStatus(status: string): string {
  return LABELS[status] ?? status;
}

export type OrderStatusVariant =
  'pendingPayment' | 'paid' | 'preparing' | 'shipped' | 'delivered' | 'cancelled' | 'unknown';

export function orderStatusVariant(status: string): OrderStatusVariant {
  switch (status as OrderStatus) {
    case 'pending_payment':
      return 'pendingPayment';
    case 'paid':
      return 'paid';
    case 'preparing':
      return 'preparing';
    case 'shipped':
      return 'shipped';
    case 'delivered':
      return 'delivered';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

/**
 * Los cinco pasos del recorrido normal, en orden.
 *
 * `cancelled` **no** está: no es un paso más adelante, es una salida. Un pedido cancelado no se
 * pinta como si le faltaran pasos por recorrer.
 */
export const ORDER_PROGRESS: readonly OrderStatus[] = [
  'pending_payment',
  'paid',
  'preparing',
  'shipped',
  'delivered',
];
