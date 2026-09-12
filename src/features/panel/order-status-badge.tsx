import styles from './orders.module.css';
import { describeOrderStatus, orderStatusVariant } from './order-status';

const CLASS_BY_VARIANT = {
  pendingPayment: styles.badgePendingPayment,
  paid: styles.badgePaid,
  preparing: styles.badgePreparing,
  shipped: styles.badgeShipped,
  delivered: styles.badgeDelivered,
  cancelled: styles.badgeCancelled,
  unknown: styles.badgeUnknown,
} as const;

/**
 * Badge del estado del pedido: pastilla clara con punto de color, como en las referencias.
 *
 * El punto es decorativo y va con `aria-hidden`: el estado se lee en el texto, que es lo que
 * anuncia un lector de pantalla. El color por sí solo nunca es el único portador del significado.
 */
export function OrderStatusBadge({ status }: { readonly status: string }) {
  return (
    <span className={CLASS_BY_VARIANT[orderStatusVariant(status)]}>
      <span aria-hidden="true" className={styles.dot} />
      {describeOrderStatus(status)}
    </span>
  );
}
