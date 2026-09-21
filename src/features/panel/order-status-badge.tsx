import catalog from './catalog.module.css';
import { orderStatusText, orderStatusVariant } from './order-status';
import styles from './orders.module.css';

const CLASS_BY_VARIANT = {
  pendingPayment: styles.badgePendingPayment,
  paid: styles.badgePaid,
  preparing: styles.badgePreparing,
  readyToShip: styles.badgeReadyToShip,
  shipped: styles.badgeShipped,
  delivered: styles.badgeDelivered,
  cancelled: styles.badgeCancelled,
  unknown: styles.badgeUnknown,
} as const;

/**
 * Badge del estado del pedido: pastilla clara con punto de color, como en las referencias.
 *
 * **El texto lo manda el backend.** `label` es `statusLabel`, la etiqueta autoritativa que publica
 * el contrato tanto en el resumen como en la ficha; el panel no la reescribe. Si llegara vacía se
 * pinta el valor técnico, que es visiblemente distinto de una etiqueta de verdad.
 *
 * Lo que decide el panel es el color. El punto es decorativo y va con `aria-hidden`: el estado se
 * lee en el texto, que es lo que anuncia un lector de pantalla, así que el color nunca es el único
 * portador del significado.
 */
export function OrderStatusBadge({
  status,
  label,
}: {
  readonly status: string;
  readonly label?: string | null;
}) {
  return (
    <span className={`${catalog.badge} ${CLASS_BY_VARIANT[orderStatusVariant(status)]}`}>
      <span aria-hidden="true" className={catalog.dot} />
      {orderStatusText(status, label)}
    </span>
  );
}
