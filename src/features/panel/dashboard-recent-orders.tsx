import Link from 'next/link';

import catalog from './catalog.module.css';
import styles from './dashboard.module.css';
import { formatDateTime } from './format';
import { formatCop } from './money';
import { OrderPreviewThumb } from './order-preview-thumb';
import { OrderStatusBadge } from './order-status-badge';
import { PaymentStatusBadge } from './payment-status-badge';
import { SectionHeading } from './section-icon';

import type { AdminOrderSummary } from '@/lib/api/orders';

/**
 * Pedidos recientes.
 *
 * Vienen **dentro del propio resumen**: el contrato los publica como «the last 8 orders created,
 * with the same projection the order list uses». No se pide cada pedido por separado, que
 * convertiría una portada en nueve llamadas y además daría la misma información.
 *
 * Como comparten proyección con el listado, comparten también sus piezas: la miniatura de la
 * instantánea, las dos pastillas —pago y pedido— y el formato monetario. Si el listado cambia de
 * aspecto, esto cambia con él.
 *
 * Tabla compacta en escritorio y tarjetas apiladas en móvil, con el mismo corte que usa Pedidos.
 */
export function RecentOrdersPanel({ orders }: { readonly orders: readonly AdminOrderSummary[] }) {
  return (
    <section className={`${catalog.card} ${catalog.cardPad}`}>
      <SectionHeading
        hint="Los últimos que entraron, con la misma lectura que el listado."
        icon="pedidos"
        title="Pedidos recientes"
      />

      {orders.length === 0 ? (
        <p className={catalog.hint}>
          Todavía no hay pedidos. Aquí aparecerán las compras que lleguen desde la tienda.
        </p>
      ) : (
        <>
          <div className={styles.recentTable}>
            <div className={catalog.tableScroll}>
              <table className={catalog.table}>
                <caption className="sr-only">Últimos pedidos recibidos</caption>
                <thead>
                  <tr>
                    <th scope="col">Pedido</th>
                    <th scope="col">Cliente</th>
                    <th scope="col">Pago</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Total</th>
                    <th scope="col">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <Link className={styles.recentCardId} href={`/panel/pedidos/${order.id}`}>
                          {order.publicId}
                        </Link>
                      </td>
                      <td>
                        <span className={styles.recentCustomer}>
                          <OrderPreviewThumb line={order.previewLine} />
                          <span className={styles.recentCustomerName}>{order.customerName}</span>
                        </span>
                      </td>
                      <td>
                        <PaymentStatusBadge status={order.paymentStatus} />
                      </td>
                      <td>
                        <OrderStatusBadge label={order.statusLabel} status={order.status} />
                      </td>
                      <td className={catalog.numeric}>{formatCop(order.totalCop)}</td>
                      <td className={catalog.timestamp}>{formatDateTime(order.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <ul className={styles.recentCards}>
            {orders.map((order) => (
              <li className={styles.recentCard} key={order.id}>
                <div className={styles.recentCardHead}>
                  <h3 className={styles.recentCardId}>
                    <Link href={`/panel/pedidos/${order.id}`}>{order.publicId}</Link>
                  </h3>
                  <span className={catalog.timestamp}>{formatDateTime(order.createdAt)}</span>
                </div>
                <p className={styles.recentCardStates}>
                  <PaymentStatusBadge status={order.paymentStatus} />
                  <OrderStatusBadge label={order.statusLabel} status={order.status} />
                </p>
                <p className={styles.recentCardCustomer}>{order.customerName}</p>
                <div className={styles.recentCardFooter}>
                  <p className={styles.recentCardTotal}>{formatCop(order.totalCop)}</p>
                  <Link className={catalog.rowAction} href={`/panel/pedidos/${order.id}`}>
                    Ver pedido <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className={styles.sectionFooter}>
        <Link className={catalog.buttonSecondary} href="/panel/pedidos">
          Ver todos los pedidos
        </Link>
      </div>
    </section>
  );
}
