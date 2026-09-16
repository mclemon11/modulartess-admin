import Link from 'next/link';

import catalog from '@/features/panel/catalog.module.css';
import { describeOrderBackendFailure } from '@/features/panel/order-errors';
import { formatDateTime } from '@/features/panel/format';
import { formatCop } from '@/features/panel/money';
import { extraLabel, unitLabel } from '@/features/panel/order-preview';
import { OrderStatusBadge } from '@/features/panel/order-status-badge';
import styles from '@/features/panel/orders.module.css';
import { EmptyState, ErrorState } from '@/features/panel/panel-states';
import { PanelHeader } from '@/features/panel/panel-header';
import { resolvePanelSession } from '@/features/panel/session-context';
import { listOrders, type AdminOrderSummary } from '@/lib/api/orders';
import { isBackendFailure } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

type PageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Listado de pedidos con datos reales del backend.
 *
 * Sigue las referencias en lo que el contrato permite: tabla amplia en escritorio, tarjetas
 * apiladas en móvil, badges de estado y el total en pesos.
 *
 * Lo que las referencias muestran y **no** está aquí, porque OpenAPI no lo publica: buscador,
 * tarjetas de métricas (`Total pedidos 48`, `Pendientes 12`…), chips de filtro por estado con sus
 * conteos, rango de fechas, exportación, «Pedidos que requieren atención», «Últimos pedidos»,
 * columna de método de pago, miniatura del producto y selección múltiple. `GET /v1/admin/orders`
 * solo admite `pageToken` y `pageSize`: un buscador que filtrara la página ya cargada mentiría
 * sobre el resto, y los conteos globales no se pueden calcular sin pedir el catálogo entero.
 *
 * La paginación tampoco puede ser numérica: el contrato devuelve un `pageToken` opaco, que permite
 * avanzar pero no saltar a una página concreta ni saber cuántas hay.
 *
 * El resumen no trae imágenes ni líneas: `AdminOrderSummaryDto` publica `publicId`, `customerName`,
 * `itemCount`, `totalCop`, `status`, `createdAt` y `updatedAt`, y eso es lo que se pinta.
 */
export default async function OrdersPage({ searchParams }: PageProps) {
  const session = await resolvePanelSession();

  if (session.kind !== 'active') {
    return null;
  }

  const params = await searchParams;
  const pageToken = firstValue(params.pageToken);
  const trail = [{ href: '/panel', label: 'Panel' }, { label: 'Pedidos' }];

  let page;

  try {
    page = await listOrders(
      session.session.sessionMaterial,
      pageToken === undefined ? {} : { pageToken },
    );
  } catch (error) {
    const message = isBackendFailure(error)
      ? describeOrderBackendFailure(error.code, 'list')
      : 'No pudimos cargar los pedidos.';

    return (
      <>
        <PanelHeader trail={trail} />
        <div className={catalog.page}>
          <div className={catalog.pageHead}>
            <div className={catalog.pageHeadText}>
              <h1 className={catalog.pageTitle}>Pedidos</h1>
            </div>
          </div>
          <ErrorState
            action={
              <Link className={catalog.buttonSecondary} href="/panel/pedidos">
                Reintentar
              </Link>
            }
            message={message}
            title="No pudimos cargar los pedidos"
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PanelHeader trail={trail} />
      <div className={catalog.page}>
        <div className={catalog.pageHead}>
          <div className={catalog.pageHeadText}>
            <h1 className={catalog.pageTitle}>Pedidos</h1>
            <p className={catalog.pageLead}>
              Las compras que llegan desde la tienda, de la más reciente a la más antigua. El pago
              todavía no está conectado: los pedidos nuevos quedan pendientes de pago hasta que
              exista la pasarela.
            </p>
          </div>
        </div>

        {page.items.length === 0 ? (
          <OrdersEmpty />
        ) : (
          <section className={catalog.listSurface}>
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
                    <th scope="col">Estado</th>
                    <th scope="col">Última actualización</th>
                    <th scope="col">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((order) => (
                    <OrderRow key={order.id} order={order} />
                  ))}
                </tbody>
              </table>
            </div>

            <ul className={catalog.cardList}>
              {page.items.map((order) => (
                <li key={order.id}>
                  <OrderCard order={order} />
                </li>
              ))}
            </ul>

            <div className={catalog.pagination}>
              <p className={catalog.paginationNote}>
                Mostrando {page.items.length} pedido{page.items.length === 1 ? '' : 's'}.
              </p>
              {page.nextPageToken === null ? (
                <p className={catalog.paginationNote}>No hay más páginas.</p>
              ) : (
                <Link
                  className={catalog.buttonSecondary}
                  href={`/panel/pedidos?pageToken=${encodeURIComponent(page.nextPageToken)}`}
                >
                  Cargar más pedidos
                </Link>
              )}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

/**
 * Miniatura del primer producto del pedido.
 *
 * Sale de la **instantánea** del pedido (`previewLine.primaryImageUrl`), no del catálogo: si el
 * producto cambió de foto después de la compra, el pedido sigue enseñando lo que se vendió. Cuando
 * la línea no tenía imagen, el hueco lo dice en vez de disimularlo con un marcador.
 */
function PreviewThumb({
  line,
  variant = 'row',
}: {
  readonly line: AdminOrderSummary['previewLine'];
  readonly variant?: 'row' | 'card';
}) {
  const imageClass = variant === 'card' ? styles.previewThumbCard : styles.previewThumb;
  const emptyClass = variant === 'card' ? styles.previewThumbCardEmpty : styles.previewThumbEmpty;

  if (line.primaryImageUrl === null) {
    return (
      <span aria-label="Sin imagen" className={emptyClass} role="img">
        Sin imagen
      </span>
    );
  }

  // Imagen pública del bucket: se sirve tal cual, como en el resto del panel.
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt="" className={imageClass} loading="lazy" src={line.primaryImageUrl} />;
}

/** Primer producto del pedido en la tabla: miniatura, nombre y cuántas unidades. */
function OrderPreview({ order }: { readonly order: AdminOrderSummary }) {
  const extra = extraLabel(order.itemCount);

  return (
    <span className={styles.previewCell}>
      <PreviewThumb line={order.previewLine} />
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
        <OrderStatusBadge status={order.status} />
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

/** Tarjeta de móvil: la misma información que la fila, con la jerarquía de la referencia. */
function OrderCard({ order }: { readonly order: AdminOrderSummary }) {
  return (
    <article className={`${catalog.card} ${styles.orderCard}`}>
      <PreviewThumb line={order.previewLine} variant="card" />
      <div className={styles.orderCardBody}>
        <div className={styles.orderCardHead}>
          <h2 className={styles.orderCardId}>
            <Link href={`/panel/pedidos/${order.id}`}>{order.publicId}</Link>
          </h2>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className={styles.orderCardCustomer}>{order.customerName}</p>
        <p className={styles.orderCardProduct}>{order.previewLine.name}</p>
        <p className={styles.orderCardMeta}>
          <span>{unitLabel(order.previewLine.quantity)}</span>
          {extraLabel(order.itemCount) === null ? null : <span>{extraLabel(order.itemCount)}</span>}
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

function OrdersEmpty() {
  return (
    <EmptyState icon="pedidos" title="Todavía no hay pedidos">
      Aquí aparecerán las compras que lleguen desde la tienda. No se crean desde el panel: un pedido
      nace cuando alguien compra.
    </EmptyState>
  );
}
