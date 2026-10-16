/**
 * Navegación numerada del listado de pedidos.
 *
 * Todo aquí es presentación: leer la posición de la URL, escribirla, decidir qué números de
 * página se pintan y redactar «Mostrando 21–40 de 126 pedidos». Ninguna regla del backend se
 * repite: el total, el orden y los límites los decide `GET /v1/admin/orders`, que además rechaza
 * cualquier valor fuera de rango. Lo que este módulo no reconoce vuelve al valor por omisión, para
 * que un enlace viejo o mal escrito siga abriendo una lista válida.
 */

/** Tamaños que ofrece el selector. El backend admite cualquiera entre 1 y 100. */
export const ORDER_PAGE_SIZES = [10, 20, 50, 100] as const;
export type OrderPageSize = (typeof ORDER_PAGE_SIZES)[number];
export const DEFAULT_ORDER_PAGE_SIZE: OrderPageSize = 20;

export type OrderListPosition = {
  readonly page: number;
  readonly pageSize: OrderPageSize;
};

type RawParam = string | string[] | null | undefined;

function first(value: RawParam): string | undefined {
  if (value === null || value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

/** Lee `page` y `pageSize` de la URL. Lo irreconocible vuelve a la página 1 y a 20 por página. */
export function readOrderListPosition(params: {
  readonly page?: RawParam;
  readonly pageSize?: RawParam;
}): OrderListPosition {
  const rawPage = first(params.page);
  const rawSize = first(params.pageSize);
  const page = rawPage !== undefined && /^[0-9]{1,5}$/.test(rawPage) ? Number(rawPage) : 1;
  const size = rawSize !== undefined && /^[0-9]{1,3}$/.test(rawSize) ? Number(rawSize) : NaN;

  return {
    page: page >= 1 ? page : 1,
    pageSize: (ORDER_PAGE_SIZES as readonly number[]).includes(size)
      ? (size as OrderPageSize)
      : DEFAULT_ORDER_PAGE_SIZE,
  };
}

/**
 * Consulta de la URL para una posición, conservando cualquier otro parámetro.
 *
 * Hoy el contrato no publica filtros ni búsqueda, pero si la URL llevara otros parámetros no se
 * pierden al cambiar de página. El antiguo `pageToken` de «Cargar más» sí se descarta: una posición
 * numerada y un cursor a la vez no significan nada.
 */
export function orderListSearch(current: string, position: OrderListPosition): string {
  const params = new URLSearchParams(current);
  params.delete('pageToken');
  params.set('page', String(position.page));
  params.set('pageSize', String(position.pageSize));
  return `?${params.toString()}`;
}

/** Número de páginas. Una lista vacía tiene una página: la que dice que no hay nada. */
export function orderPageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export type PageWindowEntry =
  { readonly kind: 'page'; readonly page: number } | { readonly kind: 'gap'; readonly key: string };

/**
 * Números que se pintan: primera, última, la actual y una a cada lado, con huecos donde se salta.
 *
 * Un hueco solo aparece si esconde dos páginas o más: esconder una sola costaría el mismo espacio
 * que mostrarla.
 */
export function orderPageWindow(current: number, count: number): PageWindowEntry[] {
  const wanted = new Set([1, count, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((page) => wanted.add(page));
  if (current >= count - 2) [count - 1, count - 2, count - 3].forEach((page) => wanted.add(page));

  const pages = [...wanted].filter((page) => page >= 1 && page <= count).sort((a, b) => a - b);
  const entries: PageWindowEntry[] = [];

  pages.forEach((page, index) => {
    const previous = pages[index - 1];
    if (previous !== undefined && page - previous === 2) {
      entries.push({ kind: 'page', page: previous + 1 });
    } else if (previous !== undefined && page - previous > 2) {
      entries.push({ kind: 'gap', key: `gap-${previous}-${page}` });
    }
    entries.push({ kind: 'page', page });
  });

  return entries;
}

const numberFormat = new Intl.NumberFormat('es-CO');

/** «Mostrando 21–40 de 126 pedidos». */
export function orderRangeLabel(page: number, pageSize: number, shown: number, total: number) {
  if (total === 0 || shown === 0) {
    return total === 0
      ? 'No hay pedidos'
      : `Sin pedidos en esta página de ${numberFormat.format(total)}`;
  }
  const from = (page - 1) * pageSize + 1;
  const to = from + shown - 1;
  const noun = total === 1 ? 'pedido' : 'pedidos';
  return `Mostrando ${numberFormat.format(from)}–${numberFormat.format(to)} de ${numberFormat.format(total)} ${noun}`;
}
