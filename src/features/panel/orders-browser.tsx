'use client';

import { useEffect, useRef, useState } from 'react';

import { usePathname, useSearchParams } from 'next/navigation';

import catalog from './catalog.module.css';
import { OrderMobileCard } from './order-mobile-card';
import {
  ORDER_PAGE_SIZES,
  orderListSearch,
  orderPageCount,
  orderPageWindow,
  orderRangeLabel,
  orderStatusSearch,
  readOrderListPosition,
  readOrderStatusFilter,
  type OrderListPosition,
  type OrderPageSize,
} from './order-pagination';
import styles from './order-pagination.module.css';
import { OrdersTable } from './orders-table';
import { OrdersToolbar } from './orders-toolbar';
import { EmptyState } from './panel-states';

import type { AdminOrderPage } from '@/lib/api/orders';

type Failure = { readonly key: string; readonly message: string };

const FALLBACK_ERROR = 'No pudimos cargar esta página de pedidos.';

function keyOf(page: number, pageSize: number, status: string | null): string {
  return `${page}:${pageSize}:${status ?? ''}`;
}

/** Mensaje del BFF si lo hay: es un texto fijo en español, nunca el del backend. */
async function failureMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const { message } = body as { message: unknown };
      if (typeof message === 'string' && message.length > 0) return message;
    }
  } catch {
    // Sin cuerpo legible: queda el mensaje genérico.
  }
  return FALLBACK_ERROR;
}

/**
 * Listado de pedidos con paginación numerada.
 *
 * La primera página llega pintada desde el servidor. Cambiar de página o de tamaño escribe la
 * posición en la URL con `history.pushState`, que Next.js sincroniza con `useSearchParams` sin
 * volver a renderizar la pantalla en el servidor; la página nueva se pide al BFF y, mientras llega,
 * la tabla anterior se queda donde está, atenuada y marcada como ocupada. Atrás y Adelante del
 * navegador cambian la URL igual, así que pasan por el mismo camino.
 *
 * Un fallo no borra nada: se avisa encima de la tabla que ya se veía, con «Reintentar».
 *
 * El filtro por estado vive en la URL (`?status=paid`) y lo aplica el backend, así que el total y
 * los números de página son los de la lista filtrada. Cambiarlo vuelve a la página 1 y conserva el
 * tamaño; cambiar de página o de tamaño lo conserva, porque `orderListSearch` no toca ningún otro
 * parámetro. La exportación no navega: descarga todo el filtro activo sin mover la tabla.
 */
export function OrdersBrowser({ initial }: { readonly initial: AdminOrderPage }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = readOrderListPosition({
    page: searchParams.get('page'),
    pageSize: searchParams.get('pageSize'),
  });
  const requestedStatus = readOrderStatusFilter(searchParams.get('status'));
  const requestedKey = keyOf(requested.page, requested.pageSize, requestedStatus);

  const [source, setSource] = useState(initial);
  const [data, setData] = useState(initial);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [attempt, setAttempt] = useState(0);

  // «Actualizar» vuelve a ejecutar la pantalla en el servidor: su página manda sobre la anterior.
  if (source !== initial) {
    setSource(initial);
    setData(initial);
    setFailure(null);
  }

  const shownPage = data.page ?? 1;
  const shownKey = keyOf(shownPage, data.pageSize, data.status);
  const loading = requestedKey !== shownKey && failure?.key !== requestedKey;

  useEffect(() => {
    if (requestedKey === shownKey) return;
    const controller = new AbortController();
    const query = new URLSearchParams({
      page: String(requested.page),
      pageSize: String(requested.pageSize),
    });
    if (requestedStatus !== null) query.set('status', requestedStatus);

    void (async () => {
      try {
        const response = await fetch(`/api/admin/orders?${query.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) {
          const message = await failureMessage(response);
          if (!controller.signal.aborted) setFailure({ key: requestedKey, message });
          return;
        }
        const page = (await response.json()) as AdminOrderPage;
        if (controller.signal.aborted) return;

        // Un enlace a una página que ya no existe lleva a la última, sin dejar otra entrada atrás.
        const last = orderPageCount(page.total, page.pageSize);
        if (page.items.length === 0 && page.total > 0 && requested.page > last) {
          window.history.replaceState(
            null,
            '',
            `${pathname}${orderListSearch(window.location.search, { page: last, pageSize: requested.pageSize })}`,
          );
          return;
        }
        setFailure(null);
        setData(page);
      } catch {
        if (!controller.signal.aborted) setFailure({ key: requestedKey, message: FALLBACK_ERROR });
      }
    })();

    return () => controller.abort();
    // `attempt` vuelve a lanzar la misma petición tras un fallo.
  }, [
    requestedKey,
    shownKey,
    requested.page,
    requested.pageSize,
    requestedStatus,
    pathname,
    attempt,
  ]);

  const regionRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const previousShownKey = useRef(shownKey);

  // Tras cargar otra página: volver al principio de la lista si quedó arriba, y no perder el foco.
  useEffect(() => {
    if (previousShownKey.current === shownKey) return;
    previousShownKey.current = shownKey;

    const region = regionRef.current;
    if (region && region.getBoundingClientRect().top < 0) {
      region.scrollIntoView({ block: 'start' });
    }

    const nav = navRef.current;
    const active = document.activeElement;
    const lost =
      active === null ||
      active === document.body ||
      (active instanceof HTMLButtonElement && active.disabled && nav?.contains(active));
    if (nav && lost) {
      const target = [...nav.querySelectorAll<HTMLElement>('[data-current-focus]')].find(
        (element) => element.offsetParent !== null,
      );
      target?.focus();
    }
  }, [shownKey]);

  function go(next: OrderListPosition) {
    if (keyOf(next.page, next.pageSize, requestedStatus) === requestedKey) {
      // Ya es la página pedida. Si falló, pulsarla otra vez la reintenta; si está en camino, nada.
      if (failure?.key === requestedKey) {
        setFailure(null);
        setAttempt((value) => value + 1);
      }
      return;
    }
    window.history.pushState(
      null,
      '',
      `${pathname}${orderListSearch(window.location.search, next)}`,
    );
  }

  /** Cambia el filtro en la URL y vuelve a la página 1, con el mismo tamaño. */
  function filter(status: string | null) {
    if (status === requestedStatus) return;
    window.history.pushState(
      null,
      '',
      `${pathname}${orderStatusSearch(window.location.search, status, requested.pageSize)}`,
    );
  }

  if (data.total === 0 && data.status === null && !loading && failure === null) {
    return (
      <EmptyState icon="pedidos" title="Todavía no hay pedidos">
        Aquí aparecerán las compras que lleguen desde la tienda. No se crean desde el panel: un
        pedido nace cuando alguien compra.
      </EmptyState>
    );
  }

  const toolbar = (
    <OrdersToolbar onStatusChange={filter} options={data.statusOptions} status={requestedStatus} />
  );
  const shownStatusLabel =
    data.statusOptions.find((option) => option.value === data.status)?.label ?? data.status;

  const pageCount = orderPageCount(data.total, data.pageSize);
  const range = orderRangeLabel(shownPage, data.pageSize, data.items.length, data.total);
  const failed = failure !== null && failure.key === requestedKey;

  if (data.total === 0 && data.status !== null && !loading && failure === null) {
    return (
      <>
        {toolbar}
        <EmptyState
          action={
            <button className={catalog.buttonSecondary} onClick={() => filter(null)} type="button">
              Ver todos los pedidos
            </button>
          }
          icon="pedidos"
          title="No hay pedidos con este estado"
        >
          Ningún pedido está ahora en «{shownStatusLabel}». Elige otro estado o vuelve a ver todos.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      {toolbar}
      {failed ? (
        <div className={styles.notice} role="alert">
          <p className={styles.noticeText}>
            No pudimos cargar la página {requested.page}. {failure.message} Se sigue mostrando la
            página {shownPage}.
          </p>
          <button
            className={catalog.buttonSecondary}
            onClick={() => {
              setFailure(null);
              setAttempt((value) => value + 1);
            }}
            type="button"
          >
            Reintentar
          </button>
        </div>
      ) : null}

      <section aria-label="Pedidos" className={catalog.listSurface}>
        <div
          aria-busy={loading}
          className={loading ? `${styles.region} ${styles.regionBusy}` : styles.region}
          ref={regionRef}
        >
          <OrdersTable orders={data.items} />

          <ul className={catalog.cardList}>
            {data.items.map((order) => (
              <li key={order.id}>
                <OrderMobileCard order={order} />
              </li>
            ))}
          </ul>
        </div>

        <nav aria-label="Paginación de pedidos" className={styles.bar} ref={navRef}>
          <p aria-live="polite" className={styles.range}>
            {range}
            <span className="sr-only">
              {loading ? '. Cargando otra página…' : `. Página ${shownPage} de ${pageCount}.`}
            </span>
          </p>

          <div className={styles.controls}>
            <label className={styles.size}>
              Pedidos por página
              <select
                className={styles.select}
                onChange={(event) => {
                  go({ page: 1, pageSize: Number(event.target.value) as OrderPageSize });
                }}
                value={requested.pageSize}
              >
                {ORDER_PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>

            <div className={styles.pager}>
              <button
                aria-label="Página anterior"
                className={styles.stepButton}
                disabled={shownPage <= 1}
                onClick={() =>
                  go({ page: shownPage - 1, pageSize: data.pageSize as OrderPageSize })
                }
                type="button"
              >
                Anterior
              </button>

              <ul className={styles.pages}>
                {orderPageWindow(shownPage, pageCount).map((entry) =>
                  entry.kind === 'gap' ? (
                    <li aria-hidden="true" className={styles.gap} key={entry.key}>
                      …
                    </li>
                  ) : (
                    <li key={entry.page}>
                      <button
                        aria-current={entry.page === shownPage ? 'page' : undefined}
                        aria-label={`Página ${entry.page}`}
                        className={styles.pageButton}
                        data-current-focus={entry.page === shownPage ? '' : undefined}
                        onClick={() =>
                          go({ page: entry.page, pageSize: data.pageSize as OrderPageSize })
                        }
                        type="button"
                      >
                        {entry.page}
                      </button>
                    </li>
                  ),
                )}
              </ul>

              <p className={styles.compactStatus} data-current-focus="" tabIndex={-1}>
                Página {shownPage} de {pageCount}
              </p>

              <button
                aria-label="Página siguiente"
                className={styles.stepButton}
                disabled={shownPage >= pageCount}
                onClick={() =>
                  go({ page: shownPage + 1, pageSize: data.pageSize as OrderPageSize })
                }
                type="button"
              >
                Siguiente
              </button>
            </div>
          </div>
        </nav>
      </section>
    </>
  );
}
