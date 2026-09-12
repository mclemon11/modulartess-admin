import catalog from './catalog.module.css';
import { describeOrderStatus, orderStatusVariant } from './order-status';
import styles from './orders.module.css';

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
 * La forma —pastilla y punto— es la del catálogo y se aplica junto al color del estado: los dos
 * listados enseñan el mismo componente, y retocarlo en un sitio lo retoca en los dos.
 *
 * El punto es decorativo y va con `aria-hidden`: el estado se lee en el texto, que es lo que
 * anuncia un lector de pantalla. El color por sí solo nunca es el único portador del significado.
 */
export function OrderStatusBadge({ status }: { readonly status: string }) {
  return (
    <span className={`${catalog.badge} ${CLASS_BY_VARIANT[orderStatusVariant(status)]}`}>
      <span aria-hidden="true" className={catalog.dot} />
      {describeOrderStatus(status)}
    </span>
  );
}
