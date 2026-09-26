'use client';

import { useState } from 'react';

import catalog from './catalog.module.css';
import { formatDateTime } from './format';
import { OrderActionsBar } from './order-actions-bar';
import {
  OrderActivityCard,
  OrderAddressCard,
  OrderCustomerCard,
  OrderNotificationsCard,
  OrderPaymentAttemptsCard,
  OrderPaymentCard,
  OrderPaymentHistoryCard,
  OrderProductsCard,
  OrderSummaryCard,
} from './order-detail-cards';
import { OrderProgress } from './order-progress';
import { OrderStatusBadge } from './order-status-badge';
import { PaymentSimulator } from './payment-simulator';
import { PaymentStatusBadge } from './payment-status-badge';
import styles from './orders.module.css';
import { SectionHeading } from './section-icon';
import { useNow } from './use-now';

import type { AdminOrder } from '@/lib/api/orders';

/**
 * Ficha del pedido.
 *
 * Es un Client Component porque las acciones cambian el pedido y la respuesta autoritativa
 * **sustituye** lo que se está viendo: la página servidor entrega el pedido inicial y a partir de
 * ahí manda lo que devuelve el backend. Nada se actualiza de forma optimista y la versión nunca se
 * adivina sumando uno.
 *
 * El pago y el pedido son dos lecturas distintas y se presentan como tales: dos pastillas en la
 * cabecera, la tarjeta de «Información de pago» con su historial aparte, y el recorrido de siete
 * hitos que las combina sin mezclarlas.
 *
 * Lo que la referencia muestra y **no** está, porque el contrato no lo publica: el método de pago
 * con su tarjeta y su referencia bancaria, el descuento, el canal de venta, las observaciones del
 * cliente, las notas internas, «Contactar cliente», «Imprimir pedido», «Ver perfil», «Ver en mapa»
 * y la edición de la dirección. Tampoco hay reembolso, ni vista previa ni reenvío de los avisos.
 */
export function OrderDetailView({
  initialOrder,
  role,
}: {
  readonly initialOrder: AdminOrder;
  readonly role: string;
}) {
  const [order, setOrder] = useState(initialOrder);
  // `null` en el servidor y durante la hidratación: el vencimiento de un checkout se calcula solo
  // cuando el cliente ya montó, así que el HTML de servidor y el primer render coinciden.
  const now = useNow();

  return (
    <div className={catalog.page}>
      <header className={styles.detailHead}>
        <div className={styles.detailHeadText}>
          <div className={styles.detailTitleRow}>
            <h1 className={catalog.pageTitle}>Pedido {order.publicId}</h1>
            <PaymentStatusBadge label={order.payment.statusLabel} status={order.payment.status} />
            <OrderStatusBadge label={order.statusLabel} status={order.status} />
          </div>
          <p className={catalog.pageLead}>
            Recibido el {formatDateTime(order.createdAt)} · {order.items.length} línea
            {order.items.length === 1 ? '' : 's'}
          </p>
        </div>
        <OrderActionsBar onUpdated={setOrder} order={order} role={role} />
      </header>

      <div className={styles.detailGrid}>
        <div className={styles.detailColumn}>
          <section className={`${catalog.card} ${catalog.cardPad}`}>
            <SectionHeading icon="estado" title="Estado del pedido" />
            <OrderProgress
              paymentEvents={order.paymentEvents}
              status={order.status}
              timeline={order.timeline}
            />
          </section>

          <OrderProductsCard order={order} />
          <OrderActivityCard order={order} />
          <OrderNotificationsCard order={order} />
        </div>

        <div className={styles.detailColumn}>
          <OrderPaymentCard now={now} order={order} />
          <OrderPaymentAttemptsCard now={now} order={order} />
          <PaymentSimulator onUpdated={setOrder} order={order} role={role} />
          <OrderPaymentHistoryCard order={order} />
          <OrderCustomerCard order={order} />
          <OrderAddressCard order={order} />
          <OrderSummaryCard order={order} />

          <section className={`${catalog.card} ${catalog.cardPad}`}>
            <SectionHeading icon="estado" title="Estado actual" />
            <p className={catalog.hint}>
              {order.statusLabel} · versión {order.version} · actualizado{' '}
              {formatDateTime(order.updatedAt)}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
