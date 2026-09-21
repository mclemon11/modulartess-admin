import Link from 'next/link';

import catalog from '@/features/panel/catalog.module.css';
import { OrderMobileCard } from '@/features/panel/order-mobile-card';
import { describeOrderBackendFailure } from '@/features/panel/order-errors';
import { OrdersTable } from '@/features/panel/orders-table';
import { PanelHeader } from '@/features/panel/panel-header';
import { PanelPageHeader } from '@/features/panel/panel-page-header';
import { EmptyState, ErrorState } from '@/features/panel/panel-states';
import { RefreshButton } from '@/features/panel/refresh-button';
import { resolvePanelSession } from '@/features/panel/session-context';
import { listOrders } from '@/lib/api/orders';
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
 * Sigue las referencias en lo que el contrato permite: tabla amplia en escritorio con la miniatura
 * de la instantánea, tarjetas apiladas en móvil, badges de estado y el total en pesos.
 *
 * Las columnas **Pago** y **Estado** salen las dos del resumen —`paymentStatus` y `statusLabel`—,
 * así que la tabla no pide la ficha de ningún pedido para pintarlas. Son dos lecturas distintas y
 * van separadas: una dice si el dinero llegó y la otra por dónde va el trabajo.
 *
 * Lo que las referencias muestran y **no** está aquí, porque OpenAPI no lo publica: las cinco
 * tarjetas de métricas con su variación mensual —`Total pedidos 48`, `Pendientes 12`…—, el
 * buscador, los chips por estado con sus conteos, el rango «Últimos 30 días», la exportación, la
 * selección múltiple, el **método** de pago, el correo del cliente, y las dos columnas de la
 * derecha —«Pedidos que requieren atención» y «Últimos pedidos»—. `GET /v1/admin/orders` solo
 * admite `pageToken` y `pageSize`, y `AdminOrderSummaryDto` no publica ni el método de pago ni el
 * correo: deducir un total global de la página cargada sería inventarlo.
 *
 * La paginación tampoco puede ser numérica: el contrato devuelve un `pageToken` opaco, que permite
 * avanzar pero no saltar a una página concreta ni saber cuántas hay.
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
          <PanelPageHeader title="Pedidos" />
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
        <PanelPageHeader
          actions={<RefreshButton />}
          lead="Gestiona las compras que llegan desde la tienda, de la más reciente a la más antigua. Cada fila trae las dos lecturas del pedido: en qué punto está el pago y en qué punto está el trabajo."
          title="Pedidos"
        />

        {page.items.length === 0 ? (
          <OrdersEmpty />
        ) : (
          <section className={catalog.listSurface}>
            <OrdersTable orders={page.items} />

            <ul className={catalog.cardList}>
              {page.items.map((order) => (
                <li key={order.id}>
                  <OrderMobileCard order={order} />
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

function OrdersEmpty() {
  return (
    <EmptyState icon="pedidos" title="Todavía no hay pedidos">
      Aquí aparecerán las compras que lleguen desde la tienda. No se crean desde el panel: un pedido
      nace cuando alguien compra.
    </EmptyState>
  );
}
