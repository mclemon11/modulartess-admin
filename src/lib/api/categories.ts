import 'server-only';

/**
 * Catálogo de categorías de producto. **Solo servidor.**
 *
 * Cinco operaciones, las que publica el contrato: listar, crear, renombrar, archivar y reactivar.
 * No hay borrado: archivar deja de admitir **nuevas** asignaciones y nada más, y el slug no se
 * libera nunca.
 *
 * Los tipos salen de `./generated/schema`, y `categoryId` es un parámetro de ruta declarado: se
 * sustituye con `params.path`, como en el resto del cliente. Las mutaciones sobre una categoría
 * existente llevan `expectedVersion` siempre; la que falte no compila.
 */

import { backendClient } from './backend-client';
import { BackendFailure, catalogFailure } from './errors';
import type { components } from './generated/schema';
import { ADMIN_SESSION_HEADER } from './session-material';

export type ProductCategory = components['schemas']['ProductCategoryDto'];
export type ProductCategoryPage = components['schemas']['ProductCategoryPageDto'];
export type CreateProductCategoryRequest = components['schemas']['CreateProductCategoryRequestDto'];
export type RenameProductCategoryRequest = components['schemas']['RenameProductCategoryRequestDto'];
export type ProductCategoryStatus = ProductCategory['status'];

/** Tope de página que publica el contrato: «Default 50, maximum 100». */
export const CATEGORY_PAGE_SIZE_MAX = 100;

/**
 * Cuántas páginas se recorren como mucho para tener el catálogo entero.
 *
 * El contrato no publica un buscador, así que buscar entre categorías exige tenerlas **todas**:
 * filtrar una sola página diría «no hay ninguna» cuando están en la siguiente. Mil categorías son
 * muchas más de las que tiene una tienda de muebles; si se alcanza el tope, se dice.
 */
export const CATEGORY_MAX_PAGES = 10;

/** En el listado y en el alta, un `404` es que la superficie no existe; en una categoría, que no existe ella. */
const LIST = { notFound: 'backend_surface_disabled' } as const;
const ITEM = { notFound: 'backend_product_category_not_found' } as const;

function sessionHeaders(sessionMaterial: string): Record<string, string> {
  return { [ADMIN_SESSION_HEADER]: sessionMaterial };
}

function toFailure(error: unknown): BackendFailure {
  return error instanceof BackendFailure ? error : new BackendFailure('backend_unavailable');
}

export async function listCategories(
  sessionMaterial: string,
  options: {
    readonly status?: ProductCategoryStatus;
    readonly pageToken?: string;
    readonly pageSize?: number;
  } = {},
): Promise<ProductCategoryPage> {
  const query: { status?: ProductCategoryStatus; pageToken?: string; pageSize?: number } = {};

  if (options.status !== undefined) query.status = options.status;
  if (options.pageToken !== undefined && options.pageToken !== '') {
    query.pageToken = options.pageToken;
  }
  if (options.pageSize !== undefined) query.pageSize = options.pageSize;

  let response;

  try {
    response = await backendClient().GET('/v1/admin/product-categories', {
      params: { query },
      headers: sessionHeaders(sessionMaterial),
    });
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw catalogFailure(response.response.status, response.error, LIST);
  }

  return response.data;
}

export type CategoryCatalog = {
  readonly items: readonly ProductCategory[];
  /** `true` si se alcanzó {@link CATEGORY_MAX_PAGES} y quedaron categorías sin leer. */
  readonly truncated: boolean;
};

/**
 * Todas las categorías de un estado —o de los dos—, recorriendo el cursor.
 *
 * Las páginas se piden **en serie**: el cursor es opaco y cada una depende de la anterior. El
 * orden es el del backend —por nombre, con el id como desempate—, así que no se reordena aquí.
 */
export async function listAllCategories(
  sessionMaterial: string,
  status?: ProductCategoryStatus,
): Promise<CategoryCatalog> {
  const items: ProductCategory[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < CATEGORY_MAX_PAGES; page += 1) {
    const result = await listCategories(sessionMaterial, {
      ...(status === undefined ? {} : { status }),
      ...(pageToken === undefined ? {} : { pageToken }),
      pageSize: CATEGORY_PAGE_SIZE_MAX,
    });

    items.push(...result.items);

    if (result.nextPageToken === null || result.nextPageToken === '') {
      return { items, truncated: false };
    }

    pageToken = result.nextPageToken;
  }

  return { items, truncated: true };
}

export async function createCategory(
  sessionMaterial: string,
  body: CreateProductCategoryRequest,
): Promise<ProductCategory> {
  let response;

  try {
    response = await backendClient().POST('/v1/admin/product-categories', {
      body,
      headers: sessionHeaders(sessionMaterial),
    });
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw catalogFailure(response.response.status, response.error, LIST);
  }

  return response.data;
}

export async function renameCategory(
  sessionMaterial: string,
  categoryId: string,
  body: RenameProductCategoryRequest,
): Promise<ProductCategory> {
  let response;

  try {
    response = await backendClient().POST('/v1/admin/product-categories/{categoryId}/rename', {
      params: { path: { categoryId } },
      body,
      headers: sessionHeaders(sessionMaterial),
    });
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw catalogFailure(response.response.status, response.error, ITEM);
  }

  return response.data;
}

export type CategoryTransition = 'archive' | 'reactivate';

export async function transitionCategory(
  sessionMaterial: string,
  categoryId: string,
  transition: CategoryTransition,
  expectedVersion: number,
): Promise<ProductCategory> {
  const init = {
    params: { path: { categoryId } },
    body: { expectedVersion },
    headers: sessionHeaders(sessionMaterial),
  };

  let response;

  try {
    response =
      transition === 'archive'
        ? await backendClient().POST('/v1/admin/product-categories/{categoryId}/archive', init)
        : await backendClient().POST('/v1/admin/product-categories/{categoryId}/reactivate', init);
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw catalogFailure(response.response.status, response.error, ITEM);
  }

  return response.data;
}
