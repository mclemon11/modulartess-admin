import Link from 'next/link';
import { redirect } from 'next/navigation';

import catalog from '@/features/panel/catalog.module.css';
import { describeOrderBackendFailure } from '@/features/panel/order-errors';
import {
  orderListSearch,
  orderPageCount,
  orderStatusSearch,
  readOrderListPosition,
  readOrderStatusFilter,
} from '@/features/panel/order-pagination';
import { OrdersBrowser } from '@/features/panel/orders-browser';
import { PanelHeader } from '@/features/panel/panel-header';
import { PanelPageHeader } from '@/features/panel/panel-page-header';
import { ErrorState } from '@/features/panel/panel-states';
import { RefreshButton } from '@/features/panel/refresh-button';
import { resolvePanelSession } from '@/features/panel/session-context';
import { listOrders } from '@/lib/api/orders';
import { isBackendFailure } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

type PageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function toSearch(params: Record<string, string | string[] | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      search.append(key, item);
    }
  }
  return search.toString();
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
 * La paginación es **numerada**: `GET /v1/admin/orders` acepta un número de página y publica el
 * total, y resuelve la posición con su propio cursor. La posición vive en la URL
 * (`?page=2&pageSize=20`), así que recargar o compartir el enlace abre la misma página. Esta
 * pantalla pinta la página pedida en el servidor; los cambios posteriores los hace
 * `OrdersBrowser` en el navegador sin borrar la tabla mientras llega la nueva.
 *
 * El filtro por estado también vive en la URL (`?status=paid`) y lo aplica el backend: el total y
 * las páginas son los de la lista filtrada. Las opciones y sus etiquetas salen de `statusOptions`.
 * «Exportar CSV» descarga todos los pedidos del filtro activo, compuestos por el backend.
 *
 * Lo que las referencias muestran y **no** está aquí, porque OpenAPI no lo publica: las tarjetas de
 * métricas, el buscador, el rango «Últimos 30 días», la selección múltiple y el correo del cliente
 * en la fila. El listado tiene un único orden, del más reciente al más antiguo.
 */
export default async function OrdersPage({ searchParams }: PageProps) {
  const session = await resolvePanelSession();

  if (session.kind !== 'active') {
    return null;
  }

  const params = await searchParams;
  const position = readOrderListPosition({ page: params.page, pageSize: params.pageSize });
  const status = readOrderStatusFilter(params.status);
  const current = toSearch(params);
  const trail = [{ href: '/panel', label: 'Panel' }, { label: 'Pedidos' }];

  let page;

  try {
    page = await listOrders(
      session.session.sessionMaterial,
      status === null ? position : { ...position, status },
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
              <>
                <Link
                  className={catalog.buttonSecondary}
                  href={`/panel/pedidos${orderListSearch(current, position)}`}
                >
                  Reintentar
                </Link>
                {status !== null ? (
                  // Un enlace con un estado que el backend no reconoce también acaba aquí.
                  <Link
                    className={catalog.buttonSecondary}
                    href={`/panel/pedidos${orderStatusSearch(current, null, position.pageSize)}`}
                  >
                    Ver todos los pedidos
                  </Link>
                ) : null}
              </>
            }
            message={message}
            title="No pudimos cargar los pedidos"
          />
        </div>
      </>
    );
  }

  // Un enlace guardado a una página que ya no existe abre la última que sí existe.
  const last = orderPageCount(page.total, page.pageSize);
  if (page.items.length === 0 && page.total > 0 && position.page > last) {
    redirect(`/panel/pedidos${orderListSearch(current, { ...position, page: last })}`);
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

        <OrdersBrowser initial={page} />
      </div>
    </>
  );
}
