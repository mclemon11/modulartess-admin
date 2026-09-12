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
export type AdminProductImage = components['schemas']['AdminProductImageDto'];
export type UploadProductImageResult = components['schemas']['UploadProductImageResultDto'];
export type ProductImageResult = components['schemas']['ProductImageResultDto'];
export type UpdateProductImageRequest = components['schemas']['UpdateProductImageRequestDto'];
export type AdminProductVariant = components['schemas']['AdminProductVariantDto'];
export type AdminProductVariantList = components['schemas']['AdminProductVariantListDto'];
export type CreateProductVariantRequest = components['schemas']['CreateProductVariantRequestDto'];
export type UpdateProductVariantRequest = components['schemas']['UpdateProductVariantRequestDto'];
export type ProductVariantResult = components['schemas']['ProductVariantResultDto'];
export type VariantInventoryAdjustmentResult =
  components['schemas']['VariantInventoryAdjustmentResultDto'];
export type ProductTaxonomy = components['schemas']['ProductTaxonomyDto'];
export type ProductAttributeDefinition = components['schemas']['ProductAttributeDefinitionDto'];
export type ProductVariantAttribute = components['schemas']['ProductVariantAttributeDto'];
export type ProductSpecifications = components['schemas']['ProductSpecificationsDto'];
export type PublicationReadiness = components['schemas']['PublicationReadinessDto'];

/**
 * Los límites de imagen viven en `./image-limits`, que no es `server-only`: el formulario del
 * navegador también los necesita. Se reexportan para que el código de servidor tenga un único
 * sitio del que importarlos.
 */
export {
  IMAGE_ALT_MAX_LENGTH,
  IMAGE_CONTENT_TYPES,
  IMAGE_MAX_ACTIVE,
  IMAGE_MAX_BYTES,
} from './image-limits';

/** Lo mismo con los límites del catálogo enriquecido y de las variantes. */
export {
  ATTRIBUTE_MAX_AXES,
  ATTRIBUTE_VALUE_MAX_LENGTH,
  FEATURES_MAX_ITEMS,
  SPECIFICATION_MAX_LENGTH,
  TAXONOMY_SLUG_MAX_LENGTH,
  VARIANT_MAX_ACTIVE,
} from './variant-limits';

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

/**
 * Sube una imagen del producto.
 *
 * El contrato la define como `multipart/form-data`, y `openapi-fetch` no serializa multipart: el
 * `FormData` se pasa tal cual como cuerpo y se deja que el navegador —aquí, undici— fije el
 * `Content-Type` con su `boundary`. Fijarlo a mano rompería el límite del multipart.
 *
 * `Idempotency-Key` es obligatoria. Si se repite, el backend descarta el objeto recién subido y
 * responde `replayed: true` sin duplicar nada.
 */
export async function uploadProductImage(
  sessionMaterial: string,
  productId: string,
  idempotencyKey: string,
  form: FormData,
): Promise<UploadProductImageResult> {
  let response;

  try {
    response = await backendClient().POST('/v1/admin/products/{productId}/images', {
      params: { path: { productId }, header: { 'Idempotency-Key': idempotencyKey } },
      headers: sessionHeaders(sessionMaterial),
      body: form as unknown as never,
      bodySerializer: (value: unknown) => value as BodyInit,
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
 * Cambia el texto alternativo, la posición o designa la imagen como principal.
 *
 * `isPrimary` solo admite `true`: el contrato cambia la principal designando otra, nunca quitando
 * la marca a la actual.
 */
export async function updateProductImage(
  sessionMaterial: string,
  productId: string,
  imageId: string,
  body: UpdateProductImageRequest,
): Promise<ProductImageResult> {
  let response;

  try {
    response = await backendClient().PATCH('/v1/admin/products/{productId}/images/{imageId}', {
      params: { path: { productId, imageId } },
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

/**
 * Archiva una imagen.
 *
 * Sale de la proyección pública y el backend promueve otra principal si hacía falta. **El objeto
 * no se borra de Cloud Storage y su URL sigue funcionando**: eso hay que decírselo a quien archiva.
 */
export async function archiveProductImage(
  sessionMaterial: string,
  productId: string,
  imageId: string,
  expectedVersion: number,
): Promise<ProductImageResult> {
  let response;

  try {
    response = await backendClient().POST(
      '/v1/admin/products/{productId}/images/{imageId}/archive',
      {
        params: { path: { productId, imageId } },
        body: { expectedVersion },
        headers: sessionHeaders(sessionMaterial),
      },
    );
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw new BackendFailure(failureCodeFromStatus(response.response.status, RESOURCE));
  }

  return response.data;
}

/**
 * Crea una variante.
 *
 * `expectedVersion` es la del **producto**, no la de la variante: el contrato trata la colección
 * de variantes como parte del producto y devuelve el producto completo con su versión nueva. Por
 * eso las altas van en serie: dos a la vez partirían de la misma versión y la segunda chocaría.
 *
 * No lleva `Idempotency-Key` —el contrato no la declara aquí—: lo que evita duplicados es el SKU,
 * reservado globalmente, y la combinación, única entre las variantes activas.
 */
export async function createProductVariant(
  sessionMaterial: string,
  productId: string,
  body: CreateProductVariantRequest,
): Promise<ProductVariantResult> {
  let response;

  try {
    response = await backendClient().POST('/v1/admin/products/{productId}/variants', {
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

/**
 * Edita los atributos o el precio de una variante.
 *
 * El SKU y el stock no entran: el contrato hace el SKU inmutable y mueve el stock solo por ajuste
 * de inventario.
 */
export async function updateProductVariant(
  sessionMaterial: string,
  productId: string,
  variantId: string,
  body: UpdateProductVariantRequest,
): Promise<ProductVariantResult> {
  let response;

  try {
    response = await backendClient().PATCH('/v1/admin/products/{productId}/variants/{variantId}', {
      params: { path: { productId, variantId } },
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

/**
 * Archiva una variante.
 *
 * Sale de las opciones vendibles y de la proyección pública de inmediato. **Su SKU y su
 * identificador quedan reservados para siempre**, y archivar la última activa deja el producto sin
 * nada que vender.
 */
export async function archiveProductVariant(
  sessionMaterial: string,
  productId: string,
  variantId: string,
  expectedVersion: number,
): Promise<ProductVariantResult> {
  let response;

  try {
    response = await backendClient().POST(
      '/v1/admin/products/{productId}/variants/{variantId}/archive',
      {
        params: { path: { productId, variantId } },
        body: { expectedVersion },
        headers: sessionHeaders(sessionMaterial),
      },
    );
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw new BackendFailure(failureCodeFromStatus(response.response.status, RESOURCE));
  }

  return response.data;
}

/**
 * Ajusta el inventario de una variante.
 *
 * Mismas reglas y misma idempotencia que el ajuste base, aplicadas a una variante. La clave la
 * genera quien inicia la operación y se reutiliza en los reintentos de **esa misma** operación.
 */
export async function adjustVariantInventory(
  sessionMaterial: string,
  productId: string,
  variantId: string,
  idempotencyKey: string,
  body: InventoryAdjustmentRequest,
): Promise<VariantInventoryAdjustmentResult> {
  let response;

  try {
    response = await backendClient().POST(
      '/v1/admin/products/{productId}/variants/{variantId}/inventory-adjustments',
      {
        params: {
          path: { productId, variantId },
          header: { 'Idempotency-Key': idempotencyKey },
        },
        body,
        headers: sessionHeaders(sessionMaterial),
      },
    );
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw new BackendFailure(failureCodeFromStatus(response.response.status, RESOURCE));
  }

  return response.data;
}
