'use client';

import { useState } from 'react';

import catalog from './catalog.module.css';
import { formatDateTime } from './format';
import { formatCop } from './money';
import { OrderActionsBar } from './order-actions-bar';
import { OrderProgress } from './order-progress';
import { describeOrderStatus } from './order-status';
import { OrderStatusBadge } from './order-status-badge';
import styles from './orders.module.css';
import { SectionHeading } from './section-icon';

import type { AdminOrder, OrderLine } from '@/lib/api/orders';

/**
 * Ficha del pedido.
 *
 * Es un Client Component porque las acciones cambian el pedido y la respuesta autoritativa
 * **sustituye** lo que se está viendo: la página servidor entrega el pedido inicial y a partir de
 * ahí manda lo que devuelve el backend.
 *
 * Todo lo que se pinta sale de la **instantánea** que trae el pedido. No se vuelve a leer el
 * catálogo para reconstruir una línea: si el producto cambió de nombre o de precio después de la
 * compra, el pedido tiene que seguir diciendo qué se vendió y por cuánto.
 *
 * Lo que las referencias muestran y **no** está, porque el contrato no lo publica: método y estado
 * de pago, descuento, canal de venta, «Contactar cliente», «Imprimir pedido», «Ver perfil», «Ver en
 * mapa», edición de la dirección, notas internas y observaciones del cliente. Tampoco hay reembolso.
 */
export function OrderDetailView({
  initialOrder,
  role,
}: {
  readonly initialOrder: AdminOrder;
  readonly role: string;
}) {
  const [order, setOrder] = useState(initialOrder);

  return (
    <div className={catalog.page}>
      <header className={styles.detailHead}>
        <div>
          <div className={styles.detailTitleRow}>
            <h1 className={catalog.pageTitle}>Pedido {order.publicId}</h1>
            <OrderStatusBadge status={order.status} />
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
            <OrderProgress status={order.status} timeline={order.timeline} />
          </section>

          <section className={`${catalog.card} ${catalog.cardPad}`}>
            <SectionHeading
              hint="Nombre, SKU, atributos y precio tal como estaban al comprar."
              icon="productos"
              title={`Productos (${order.items.length})`}
            />
            <ul className={styles.lineList}>
              {order.items.map((line, index) => (
                <li key={`${line.productId}-${line.variantId ?? 'base'}-${index}`}>
                  <OrderLineRow line={line} />
                </li>
              ))}
            </ul>
          </section>

          <section className={`${catalog.card} ${catalog.cardPad}`}>
            <SectionHeading
              hint="Se añade una entrada por cada cambio de estado y no se edita ninguna."
              icon="historial"
              title="Historial del pedido"
            />
            <ol className={styles.timeline}>
              {order.timeline.map((entry) => (
                <li className={styles.timelineItem} key={`${entry.status}-${entry.at}`}>
                  <OrderStatusBadge status={entry.status} />
                  <span className={styles.timelineAt}>{formatDateTime(entry.at)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className={styles.detailColumn}>
          <section className={`${catalog.card} ${catalog.cardPad}`}>
            <SectionHeading icon="cliente" title="Cliente" />
            <dl className={styles.facts}>
              <Fact label="Nombre" value={order.customer.fullName} />
              <Fact label="Correo" value={order.customer.email} />
              <Fact label="Teléfono" value={order.customer.phone} />
            </dl>
          </section>

          <section className={`${catalog.card} ${catalog.cardPad}`}>
            <SectionHeading icon="direccion" title="Dirección de entrega" />
            <dl className={styles.facts}>
              <Fact label="Dirección" value={order.shippingAddress.addressLine} />
              <Fact label="Ciudad" value={order.shippingAddress.city} />
              <Fact label="Departamento" value={order.shippingAddress.department} />
              <Fact
                label="Indicaciones"
                value={order.shippingAddress.instructions ?? 'Sin indicaciones'}
              />
            </dl>
          </section>

          <section className={`${catalog.card} ${catalog.cardPad}`}>
            <SectionHeading icon="resumen" title="Resumen del pedido" />
            <div className={styles.amounts}>
              <p className={styles.amountRow}>
                <span className={styles.amountLabel}>Subtotal</span>
                <span className={styles.amountValue}>{formatCop(order.subtotalCop)}</span>
              </p>
              <p className={styles.amountRow}>
                <span className={styles.amountLabel}>Envío</span>
                <span className={styles.amountValue}>{formatCop(order.shippingCop)}</span>
              </p>
              <p className={styles.amountTotal}>
                <span>Total</span>
                <span className={styles.amountValue}>{formatCop(order.totalCop)}</span>
              </p>
            </div>
            {/* El contrato fija el envío en cero mientras no exista la cotización. Decirlo evita
                que alguien lo lea como «envío gratis». */}
            {order.shippingCop === 0 ? (
              <p className={catalog.hint}>
                El envío todavía no se cotiza: el backend lo deja en cero en esta fase.
              </p>
            ) : null}
          </section>

          <section className={`${catalog.card} ${catalog.cardPad}`}>
            <SectionHeading icon="estado" title="Estado actual" />
            <p className={catalog.hint}>
              {describeOrderStatus(order.status)} · versión {order.version} · actualizado{' '}
              {formatDateTime(order.updatedAt)}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>{value}</dd>
    </div>
  );
}

function OrderLineRow({ line }: { readonly line: OrderLine }) {
  return (
    <article className={styles.line}>
      {line.primaryImageUrl === null ? (
        <span className={styles.lineThumbEmpty}>Sin imagen</span>
      ) : (
        // Imagen de la instantánea, servida por Cloud Storage. Se usa `img` y no `next/image`
        // porque el host es el del bucket y el panel no configura dominios remotos.
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className={styles.lineThumb} src={line.primaryImageUrl} />
      )}
      <div className={styles.lineBody}>
        <h3 className={styles.lineName}>{line.name}</h3>
        <p className={styles.lineSku}>SKU: {line.sku}</p>
        {line.attributes.length === 0 ? null : (
          <ul className={styles.lineAttributes}>
            {line.attributes.map((attribute) => (
              <li className={styles.lineAttribute} key={attribute.key}>
                {attribute.label}
              </li>
            ))}
          </ul>
        )}
        <p className={styles.lineAmounts}>
          <span>
            {line.quantity} × {formatCop(line.unitPriceCop)}
          </span>
          <span className={styles.lineTotal}>{formatCop(line.totalCop)}</span>
        </p>
      </div>
    </article>
  );
}
