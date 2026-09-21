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
 * Tabla de pedidos en escritorio.
 *
 * Las columnas son las que publica `AdminOrderSummaryDto`, incluidas **Pago** y **Estado**, que son
 * dos lecturas distintas y van en dos columnas distintas: una dice si el dinero llegó y la otra por
 * dónde va el trabajo. Las dos salen del resumen —`paymentStatus` y `statusLabel`—, así que la
 * lista sigue sin pedir la ficha de cada pedido: el contrato dice que ese dato «is already in the
 * order document: the row costs no extra read».
 *
 * El texto del estado del pedido es el que manda el backend (`statusLabel`); el panel solo elige el
 * color. El del pago sale de su mapa cerrado, porque el resumen no publica etiqueta de pago.
 *
 * No se inventa un **método** de pago: el contrato no publica ni tarjeta, ni referencia, ni
 * entidad. El correo del cliente tampoco está en el resumen.
 *
 * Tampoco hay casilla de selección: sin operaciones por lote no seleccionaría para nada.
 */
export function OrdersTable({ orders }: { readonly orders: readonly AdminOrderSummary[] }) {
  return (
    <div className={catalog.tableScroll}>
      <table className={catalog.table}>
        <caption className="sr-only">Pedidos recibidos</caption>
        <thead>
          <tr>
            <th scope="col">Pedido</th>
            <th scope="col">Cliente</th>
            <th scope="col">Productos</th>
            <th scope="col">Fecha</th>
            <th scope="col">Total</th>
            <th scope="col">Pago</th>
            <th scope="col">Estado</th>
            <th scope="col">Última actualización</th>
            <th scope="col">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <OrderRow key={order.id} order={order} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Primer producto del pedido: miniatura, nombre y cuántas unidades, todo de la instantánea. */
function OrderPreview({ order }: { readonly order: AdminOrderSummary }) {
  const extra = extraLabel(order.itemCount);

  return (
    <span className={styles.previewCell}>
      <OrderPreviewThumb line={order.previewLine} />
      <span className={styles.previewText}>
        <span className={styles.previewName}>{order.previewLine.name}</span>
        <span className={styles.previewMeta}>
          {unitLabel(order.previewLine.quantity)}
          {extra === null ? '' : ` · ${extra}`}
        </span>
      </span>
    </span>
  );
}

function OrderRow({ order }: { readonly order: AdminOrderSummary }) {
  return (
    <tr>
      <td>
        {/* El enlace lleva el identificador interno, pero lo que se lee es el `publicId`: es el
            número que el cliente conoce y el que se dicta por teléfono. */}
        <Link className={styles.orderLink} href={`/panel/pedidos/${order.id}`}>
          {order.publicId}
        </Link>
      </td>
      <td>{order.customerName}</td>
      <td>
        <OrderPreview order={order} />
      </td>
      <td className={catalog.timestamp}>{formatDateTime(order.createdAt)}</td>
      <td className={catalog.numeric}>{formatCop(order.totalCop)}</td>
      <td>
        <PaymentStatusBadge status={order.paymentStatus} />
      </td>
      <td>
        <OrderStatusBadge label={order.statusLabel} status={order.status} />
      </td>
      <td className={catalog.timestamp}>{formatDateTime(order.updatedAt)}</td>
      <td className={catalog.actionCell}>
        <Link className={catalog.rowAction} href={`/panel/pedidos/${order.id}`}>
          Ver pedido
        </Link>
      </td>
    </tr>
  );
}
