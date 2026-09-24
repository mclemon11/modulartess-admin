/**
 * El listado del catálogo de categorías. Módulo puro.
 *
 * El contrato pagina por cursor y filtra por estado, pero **no publica un buscador**. Buscar sobre
 * una sola página diría «no hay ninguna» cuando la categoría está en la siguiente, así que la
 * pantalla lee el catálogo entero —acotado y avisando si se alcanza el tope— y aquí se busca, se
 * filtra y se pagina sobre ese conjunto completo. Nada de esto decide nada del negocio: solo ordena
 * lo que ya devolvió el backend.
 */

import { foldText } from './category-selection';

export type CategoryStatusFilter = 'active' | 'archived' | 'all';

export const CATEGORY_STATUS_FILTERS: readonly { value: CategoryStatusFilter; label: string }[] = [
  { value: 'active', label: 'Activas' },
  { value: 'archived', label: 'Archivadas' },
  { value: 'all', label: 'Todas' },
];

/** Filas por página del listado. */
export const CATEGORY_LIST_PAGE_SIZE = 20;

type Listable = {
  readonly name: string;
  readonly slug: string;
  readonly status: 'active' | 'archived';
};

/** Filtra por estado y por nombre o slug, sin distinguir tildes ni mayúsculas. Conserva el orden. */
export function filterCategories<T extends Listable>(
  items: readonly T[],
  options: { readonly query: string; readonly status: CategoryStatusFilter },
): readonly T[] {
  const needle = foldText(options.query);

  return items.filter(
    (item) =>
      (options.status === 'all' || item.status === options.status) &&
      (needle === '' || foldText(item.name).includes(needle) || item.slug.includes(needle)),
  );
}

export type ListPage<T> = {
  readonly items: readonly T[];
  /** Página mostrada, empezando por 1 y ya acotada al rango que existe. */
  readonly page: number;
  readonly pageCount: number;
  readonly total: number;
};

/** Una página del conjunto filtrado. Una página fuera de rango se acota, no queda vacía. */
export function pageOf<T>(
  items: readonly T[],
  page: number,
  size = CATEGORY_LIST_PAGE_SIZE,
): ListPage<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, Math.trunc(page)), pageCount);

  return {
    items: items.slice((current - 1) * size, current * size),
    page: current,
    pageCount,
    total: items.length,
  };
}

/**
 * Un contador de productos tal como llega.
 *
 * `null` significa que el backend **no pudo calcularlo**, no que sea cero: pintar «0» haría creer
 * que se puede archivar sin afectar a nadie.
 */
export function describeProductCount(value: number | null): string {
  return value === null ? 'No disponible' : String(value);
}

/** Sustituye una categoría por la versión que devolvió el backend, en el mismo sitio. */
export function replaceCategory<T extends { readonly id: string }>(
  items: readonly T[],
  next: T,
): readonly T[] {
  return items.map((item) => (item.id === next.id ? next : item));
}
