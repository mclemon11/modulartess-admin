import Link from 'next/link';

import catalog from './catalog.module.css';
import styles from './dashboard.module.css';
import { readAttention, isQuiet } from './dashboard-attention';
import { readOperations, sharePercent, totalOf } from './dashboard-operations';
import { formatCop, groupCop } from './money';
import { OrderStatusBadge } from './order-status-badge';
import { PaymentStatusBadge } from './payment-status-badge';
import { SectionHeading } from './section-icon';

import type {
  DashboardAttention,
  DashboardOperations,
  DashboardOrderStatusCount,
  DashboardPaymentStatusCount,
  DashboardTopProduct,
} from '@/lib/api/dashboard';

/**
 * Operación actual.
 *
 * **No es del período.** El contrato lo dice sin rodeos: es «the snapshot of RIGHT NOW… it does not
 * change when the period changes». Por eso la tarjeta lo declara en su propio texto: sin esa frase,
 * cambiar a «Hoy» y ver los mismos ocho números se leería como un fallo, o peor, los números se
 * leerían como si fueran del día.
 *
 * Los ocho valores se pintan tal cual. No se suman, no se recalculan y no se reordenan: el orden es
 * el del recorrido operativo, con los pagos en curso donde ocurren.
 *
 * Los estados enlazan al listado como **acceso general**, sin filtro en la URL: el listado todavía
 * no admite filtros, y un enlace con un parámetro que nadie lee prometería algo que no pasa.
 */
export function OperationsPanel({ operations }: { readonly operations: DashboardOperations }) {
  const entries = readOperations(operations);

  return (
    <section className={`${catalog.card} ${catalog.cardPad}`}>
      <SectionHeading
        hint="Fotografía de ahora mismo. No cambia al cambiar el período."
        icon="estado"
        title="Operación actual"
      />
      <ul className={styles.operations}>
        {entries.map((entry) => (
          <li className={styles.operationRow} key={entry.key}>
            {entry.tone.kind === 'order' ? (
              <OrderStatusBadge label={entry.label} status={statusForVariant(entry.tone.variant)} />
            ) : (
              <PaymentStatusBadge label={entry.label} status="processing" />
            )}
            <span className={styles.operationCount}>{groupCop(entry.count)}</span>
          </li>
        ))}
      </ul>
      <div className={styles.sectionFooter}>
        <Link className={catalog.rowAction} href="/panel/pedidos">
          Ver pedidos <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}

/**
 * La variante visual vuelve a su estado del contrato.
 *
 * `OrderStatusBadge` toma el `status` publicado y elige el color; la etiqueta la pone quien llama.
 * Esta tabla existe porque la fila de operación se nombra por su trabajo —«Pagados por iniciar»— y
 * no por el estado, así que hace falta decir con qué color se pinta sin duplicar la escala.
 */
function statusForVariant(variant: string): string {
  switch (variant) {
    case 'pendingPayment':
      return 'pending_payment';
    case 'readyToShip':
      return 'ready_to_ship';
    default:
      return variant;
  }
}

/**
 * Distribución en barras.
 *
 * La barra es decorativa y lleva `aria-hidden`: la cifra está escrita al lado, que es lo que se
 * lee. Un total en cero **no** dibuja proporción —no hay ninguna que dibujar— y se marca con un
 * trazo discontinuo en vez de con una barra llena o con un «0 %» inventado.
 */
function DistributionRow({
  label,
  count,
  total,
}: {
  readonly label: string;
  readonly count: number;
  readonly total: number;
}) {
  const share = sharePercent(count, total);

  return (
    <li className={styles.distributionRow}>
      <p className={styles.distributionHead}>
        <span className={styles.distributionLabel}>{label}</span>
        <span className={styles.distributionCount}>{groupCop(count)}</span>
      </p>
      {share === null ? (
        <span aria-hidden="true" className={styles.barEmpty} />
      ) : (
        <span aria-hidden="true" className={styles.bar}>
          <span className={styles.barFill} style={{ width: `${share}%` }} />
        </span>
      )}
    </li>
  );
}

/**
 * Pedidos por estado y pagos por estado.
 *
 * Van juntos en una tarjeta porque hablan de lo mismo —cuántos pedidos hay en cada punto— y de dos
 * maneras que **no cuadran entre sí**. El contrato lo explica: los pedidos escritos antes del
 * modelo de pago no tienen bloque de pago y no se cuentan en ninguno de los estados de pago, «so
 * this list can add up to less than ordersByStatus». La tarjeta lo dice en vez de dejar que alguien
 * reste y crea que faltan pedidos.
 *
 * Las etiquetas son las que manda el backend; `status` se conserva como clave estable. Los estados
 * con cero se incluyen: son información, no ruido.
 */
export function StatusDistributionPanel({
  ordersByStatus,
  paymentsByStatus,
}: {
  readonly ordersByStatus: readonly DashboardOrderStatusCount[];
  readonly paymentsByStatus: readonly DashboardPaymentStatusCount[];
}) {
  const orderTotal = totalOf(ordersByStatus);
  const paymentTotal = totalOf(paymentsByStatus);

  return (
    <section className={`${catalog.card} ${catalog.cardPad}`}>
      <SectionHeading
        hint="Fotografía de ahora mismo, como la operación."
        icon="historial"
        title="Distribución de pedidos y pagos"
      />

      <h3 className={catalog.sectionTitle}>Pedidos por estado</h3>
      <ul className={styles.distribution}>
        {ordersByStatus.map((entry) => (
          <DistributionRow
            count={entry.count}
            key={entry.status}
            label={entry.label}
            total={orderTotal}
          />
        ))}
      </ul>

      <h3 className={catalog.sectionTitle}>Pagos por estado</h3>
      <ul className={styles.distribution}>
        {paymentsByStatus.map((entry) => (
          <DistributionRow
            count={entry.count}
            key={entry.status}
            label={entry.label}
            total={paymentTotal}
          />
        ))}
      </ul>

      <p className={catalog.hint}>
        Los dos totales no tienen por qué coincidir: los pedidos anteriores al modelo de pago no
        tienen bloque de pago y no se cuentan en ninguno de estos estados.
      </p>
    </section>
  );
}

/**
 * Productos más vendidos del período.
 *
 * Todo sale de la **instantánea histórica** de los pedidos aprobados: el nombre es el que tenía
 * cuando se vendió y la imagen también. El contrato es explícito —«It is never read from the
 * current catalogue: a product renamed after the sale keeps the name it was sold with»—, y volver
 * a leer el catálogo aquí reescribiría lo que se vendió además de convertir una tarjeta en cinco
 * llamadas.
 *
 * Sin estrellas, sin calificaciones y sin descuentos: nada de eso existe en el contrato.
 */
export function TopProductsPanel({
  products,
}: {
  readonly products: readonly DashboardTopProduct[];
}) {
  return (
    <section className={`${catalog.card} ${catalog.cardPad}`}>
      <SectionHeading
        hint="Nombre e imagen tal como estaban al venderse."
        icon="productos"
        title="Productos más vendidos"
      />
      {products.length === 0 ? (
        <p className={catalog.hint}>Aún no hay ventas aprobadas en este período.</p>
      ) : (
        <ul className={styles.topProducts}>
          {products.map((product) => (
            <li className={styles.topProduct} key={product.productId}>
              {product.imageUrl === null ? (
                <span aria-label="Sin imagen" className={catalog.thumbEmpty} role="img">
                  Sin imagen
                </span>
              ) : (
                // URL pública del bucket, servida tal cual como en el resto del panel: el host
                // depende del despliegue y `next/image` exigiría declararlo.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={product.name}
                  className={catalog.thumb}
                  loading="lazy"
                  src={product.imageUrl}
                />
              )}
              <div className={styles.topProductBody}>
                <p className={styles.topProductName}>
                  <Link href={`/panel/productos/${product.productId}`}>{product.name}</Link>
                </p>
                <p className={styles.topProductMeta}>
                  {groupCop(product.units)} unidad{product.units === 1 ? '' : 'es'}
                </p>
              </div>
              <span className={styles.topProductRevenue}>
                {formatCop(product.approvedRevenueCop)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const ATTENTION_COUNT_CLASS = {
  warning: styles.attentionCountWarning,
  danger: styles.attentionCountDanger,
  brand: styles.attentionCountBrand,
} as const;

/**
 * Requieren atención.
 *
 * Cinco contadores del contrato y ninguno más. Tres llevan al listado que corresponde;
 * `failedNotifications` no lleva a ningún sitio porque la outbox no tiene superficie
 * administrativa, y se dice en lugar de inventar una pantalla.
 *
 * **No hay botones «Resolver», «Reintentar» ni «Ver notificaciones»**: esos endpoints no existen.
 */
export function AttentionPanel({ attention }: { readonly attention: DashboardAttention }) {
  const entries = readAttention(attention);
  const quiet = isQuiet(attention);

  return (
    <section className={`${catalog.card} ${catalog.cardPad}`}>
      <SectionHeading
        hint="Fotografía de ahora mismo, como la operación."
        icon="notificaciones"
        title="Requieren atención"
      />
      {quiet ? (
        <p className={catalog.hint}>
          Sin novedades: no hay pagos atascados, pedidos esperando transportador, avisos fallidos ni
          inventario bajo.
        </p>
      ) : (
        <ul className={styles.attention}>
          {entries.map((entry) => (
            <li className={styles.attentionRow} key={entry.key}>
              <p className={styles.attentionLabel}>{entry.label}</p>
              <span className={ATTENTION_COUNT_CLASS[entry.tone]}>{groupCop(entry.count)}</span>
              <p className={styles.attentionDetail}>{entry.detail}</p>
              {entry.href === null ? null : (
                <Link className={styles.attentionLink} href={entry.href}>
                  Abrir <span aria-hidden="true">→</span>
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
