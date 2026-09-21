import Link from 'next/link';

import catalog from './catalog.module.css';
import { formatDateTime } from './format';
import { formatCop } from './money';
import { OrderPreviewThumb } from './order-preview-thumb';
import { extraLabel, unitLabel } from './order-preview';
import { OrderStatusBadge } from './order-status-badge';
import { PaymentStatusBadge } from './payment-status-badge';
import styles from './orders.module.css';

import type { AdminOrderSummary } from '@/lib/api/orders';

/**
 * El pedido como tarjeta, para cuando la tabla deja de caber.
 *
 * Conserva **todos** los datos de la fila: identificador público, cliente, producto de la
 * instantánea con sus unidades, fecha, total, los **dos** estados —pago y pedido— y la acción. La
 * referencia móvil hace lo mismo, y es lo correcto: en un listado administrativo el móvil no es un
 * resumen, es la misma información en otra forma.
 *
 * Las dos pastillas van juntas y en ese orden —primero el pago, después el pedido—, que es el orden
 * causal: el pago es lo que hace avanzar al pedido.
 */
export function OrderMobileCard({ order }: { readonly order: AdminOrderSummary }) {
  const extra = extraLabel(order.itemCount);

  return (
    <article className={`${catalog.card} ${styles.orderCard}`}>
      <OrderPreviewThumb line={order.previewLine} variant="card" />
      <div className={styles.orderCardBody}>
        <div className={styles.orderCardHead}>
          <h2 className={styles.orderCardId}>
            <Link href={`/panel/pedidos/${order.id}`}>{order.publicId}</Link>
          </h2>
        </div>
        <p className={styles.orderCardStates}>
          <PaymentStatusBadge status={order.paymentStatus} />
          <OrderStatusBadge label={order.statusLabel} status={order.status} />
        </p>
        <p className={styles.orderCardCustomer}>{order.customerName}</p>
        <p className={styles.orderCardProduct}>{order.previewLine.name}</p>
        <p className={styles.orderCardMeta}>
          <span>{unitLabel(order.previewLine.quantity)}</span>
          {extra === null ? null : <span>{extra}</span>}
          <span>{formatDateTime(order.createdAt)}</span>
        </p>
        <div className={styles.orderCardFooter}>
          <p className={styles.orderCardTotal}>{formatCop(order.totalCop)}</p>
          <Link className={catalog.rowAction} href={`/panel/pedidos/${order.id}`}>
            Ver pedido <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
