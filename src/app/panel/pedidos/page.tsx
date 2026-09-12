import Link from 'next/link';

import catalog from '@/features/panel/catalog.module.css';
import { describeOrderBackendFailure } from '@/features/panel/order-errors';
import { formatDateTime } from '@/features/panel/format';
import { formatCop } from '@/features/panel/money';
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
                    <th scope="col">Artículos</th>
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

function itemLabel(count: number): string {
  return `${count} artículo${count === 1 ? '' : 's'}`;
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
      <td className={catalog.numeric}>{order.itemCount}</td>
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
      <div className={styles.orderCardHead}>
        <h2 className={styles.orderCardId}>
          <Link href={`/panel/pedidos/${order.id}`}>{order.publicId}</Link>
        </h2>
        <OrderStatusBadge status={order.status} />
      </div>
      <p className={styles.orderCardCustomer}>{order.customerName}</p>
      <p className={styles.orderCardMeta}>
        <span>{itemLabel(order.itemCount)}</span>
        <span>{formatDateTime(order.createdAt)}</span>
      </p>
      <div className={styles.orderCardFooter}>
        <p className={styles.orderCardTotal}>{formatCop(order.totalCop)}</p>
        <Link className={catalog.rowAction} href={`/panel/pedidos/${order.id}`}>
          Ver pedido <span aria-hidden="true">→</span>
        </Link>
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
