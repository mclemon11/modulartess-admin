import 'server-only';

/**
 * Operaciones de catálogo contra el backend. **Solo servidor.**
 *
 * Todos los tipos vienen de `./generated/schema`, generado desde la copia comiteada del contrato.
 * Aquí no se declara ni un campo a mano: si el backend cambia el contrato y la copia se actualiza,
 * lo que ya no encaje deja de compilar, que es exactamente el aviso que hace falta.
 *
 * Cada llamada transporta la sesión de la persona en `x-modulartess-admin-session`. El
 * `Authorization` con el identity token IAM lo pone el middleware compartido de `backendClient()`:
 * son dos canales separados y no se mezclan.
 *
 * Un `404` aquí significa «ese producto no existe», no «la superficie está desactivada», así que
 * se traduce con `notFound: 'backend_not_found'`.
 */

import { backendClient } from './backend-client';
import { BackendFailure, failureCodeFromStatus } from './errors';
import type { components } from './generated/schema';
import { ADMIN_SESSION_HEADER } from './session-material';

export type AdminProduct = components['schemas']['AdminProductDto'];
export type AdminProductPage = components['schemas']['AdminProductPageDto'];
export type CreateProductRequest = components['schemas']['CreateProductRequestDto'];
export type UpdateProductRequest = components['schemas']['UpdateProductRequestDto'];
export type InventoryAdjustmentRequest = components['schemas']['InventoryAdjustmentRequestDto'];
export type InventoryAdjustmentResult = components['schemas']['InventoryAdjustmentResultDto'];

/** Estado del producto, tal y como lo publica el contrato. */
export type ProductStatus = AdminProduct['status'];

const RESOURCE = { notFound: 'backend_not_found' } as const;

function sessionHeaders(sessionMaterial: string): Record<string, string> {
  return { [ADMIN_SESSION_HEADER]: sessionMaterial };
}

/** Convierte cualquier fallo en un `BackendFailure` estable, sin propagar nada del origen. */
function toFailure(error: unknown): BackendFailure {
  return error instanceof BackendFailure ? error : new BackendFailure('backend_unavailable');
}

export async function listProducts(
  sessionMaterial: string,
  options: { readonly pageToken?: string; readonly pageSize?: number } = {},
): Promise<AdminProductPage> {
  const query: { pageToken?: string; pageSize?: number } = {};

  if (options.pageToken !== undefined && options.pageToken !== '') {
    query.pageToken = options.pageToken;
  }

  if (options.pageSize !== undefined) {
    query.pageSize = options.pageSize;
  }

  let response;

  try {
    response = await backendClient().GET('/v1/admin/products', {
      params: { query },
      headers: sessionHeaders(sessionMaterial),
    });
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw new BackendFailure(failureCodeFromStatus(response.response.status, RESOURCE));
  }

  return response.data;
}

export async function getProduct(
  sessionMaterial: string,
  productId: string,
): Promise<AdminProduct> {
  let response;

  try {
    response = await backendClient().GET('/v1/admin/products/{productId}', {
      params: { path: { productId } },
      headers: sessionHeaders(sessionMaterial),
    });
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw new BackendFailure(failureCodeFromStatus(response.response.status, RESOURCE));
  }

  return response.data;
}

/**
 * Crea un producto. El backend lo crea siempre en `draft`, diga lo que diga el cuerpo, así que el
 * panel no ofrece elegir estado.
 */
export async function createProduct(
  sessionMaterial: string,
  body: CreateProductRequest,
): Promise<AdminProduct> {
  let response;

  try {
    response = await backendClient().POST('/v1/admin/products', {
      body,
      headers: sessionHeaders(sessionMaterial),
    });
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw new BackendFailure(failureCodeFromStatus(response.response.status, RESOURCE));
  }

  return response.data;
}

/** Actualiza campos editables. `expectedVersion` es obligatorio: un `409` significa conflicto. */
export async function updateProduct(
  sessionMaterial: string,
  productId: string,
  body: UpdateProductRequest,
): Promise<AdminProduct> {
  let response;

  try {
    response = await backendClient().PATCH('/v1/admin/products/{productId}', {
      params: { path: { productId } },
      body,
      headers: sessionHeaders(sessionMaterial),
    });
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw new BackendFailure(failureCodeFromStatus(response.response.status, RESOURCE));
  }

  return response.data;
}

export type ProductTransition = 'publish' | 'archive';

/** Publica o archiva. Ambas transiciones comparten forma: solo `expectedVersion`. */
export async function transitionProduct(
  sessionMaterial: string,
  productId: string,
  transition: ProductTransition,
  expectedVersion: number,
): Promise<AdminProduct> {
  const init = {
    params: { path: { productId } },
    body: { expectedVersion },
    headers: sessionHeaders(sessionMaterial),
  };

  let response;

  try {
    response =
      transition === 'publish'
        ? await backendClient().POST('/v1/admin/products/{productId}/publish', init)
        : await backendClient().POST('/v1/admin/products/{productId}/archive', init);
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw new BackendFailure(failureCodeFromStatus(response.response.status, RESOURCE));
  }

  return response.data;
}

/**
 * Ajusta inventario.
 *
 * `Idempotency-Key` es obligatoria en el contrato y la genera quien inicia la operación, no este
 * módulo: un reintento de **la misma** operación tiene que reutilizar la misma clave para que el
 * backend la reconozca y responda `replayed: true` en lugar de aplicar el delta dos veces.
 */
export async function adjustInventory(
  sessionMaterial: string,
  productId: string,
  idempotencyKey: string,
  body: InventoryAdjustmentRequest,
): Promise<InventoryAdjustmentResult> {
  let response;

  try {
    response = await backendClient().POST('/v1/admin/products/{productId}/inventory-adjustments', {
      params: { path: { productId }, header: { 'Idempotency-Key': idempotencyKey } },
      body,
      headers: sessionHeaders(sessionMaterial),
    });
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw new BackendFailure(failureCodeFromStatus(response.response.status, RESOURCE));
  }

  return response.data;
}
