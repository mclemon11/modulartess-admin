/**
 * Presentación del estado del pedido.
 *
 * **El texto ya no se escribe aquí.** El contrato publica la etiqueta autoritativa en
 * `AdminOrderDto.statusLabel`, en `AdminOrderSummaryDto.statusLabel` y, hito a hito, en
 * `timeline[].label`. Mantener una segunda tabla completa de traducciones garantizaba que el panel
 * y la tienda acabaran diciendo cosas distintas del mismo pedido —y el propio contrato lo avisa:
 * `pending_payment` se lee «Pedido recibido» como hito y «Pendiente de pago» como estado, y esa
 * regla no se deduce del enum—.
 *
 * Lo que sí decide el panel es la **variante visual**: qué color lleva la pastilla. Eso es
 * presentación, no vocabulario.
 *
 * Módulo puro: no decide nada, solo elige un color y un último recurso.
 */

import type { OrderStatus } from '@/lib/api/orders';

export type OrderStatusVariant =
  | 'pendingPayment'
  | 'paid'
  | 'preparing'
  | 'readyToShip'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'unknown';

export function orderStatusVariant(status: string): OrderStatusVariant {
  switch (status as OrderStatus) {
    case 'pending_payment':
      return 'pendingPayment';
    case 'paid':
      return 'paid';
    case 'preparing':
      return 'preparing';
    case 'ready_to_ship':
      return 'readyToShip';
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
 * Qué se pinta cuando algo tiene que pintarse.
 *
 * Primero la etiqueta que mandó el backend. Si viniera vacía —o si quien llama no tiene ninguna,
 * como pasa con una entrada de historial de un estado que el panel no conoce—, el último recurso es
 * el valor técnico: preferible a dejar el hueco en blanco, y visiblemente distinto de una etiqueta
 * de verdad, así que nadie lo confunde con vocabulario aprobado.
 */
export function orderStatusText(status: string, label?: string | null): string {
  return label !== undefined && label !== null && label.length > 0 ? label : status;
}
