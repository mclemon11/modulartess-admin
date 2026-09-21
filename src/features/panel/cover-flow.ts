/**
 * Cambiar la portada de un producto que ya existe.
 *
 * No es una subida: son **dos** llamadas al backend que forman una sola operación.
 *
 *   1. Subir el archivo, con su `Idempotency-Key` y la versión vigente.
 *   2. Marcar esa imagen concreta como principal, con la versión que devolvió el paso anterior.
 *
 * El paso 2 puede fallar solo, y ahí estaba el problema que este módulo resuelve: sin recordar el
 * `imageId` del paso 1, el reintento volvía a subir un archivo que ya estaba en el bucket, y la
 * pantalla podía decir «Portada actualizada» sin que ninguna imagen tuviera `isPrimary: true`.
 *
 * Dos reglas que no son de presentación:
 *
 *   - El paso 2 **se salta** si el backend ya devolvió esa imagen como principal. Es lo que pasa
 *     con la primera imagen de un producto: el backend la marca solo, y pedir el `PATCH` gastaría
 *     una versión para no cambiar nada.
 *   - El éxito se afirma **comprobándolo** en la respuesta, no dándolo por hecho porque la llamada
 *     devolvió 200.
 *
 * Módulo puro salvo por las dependencias inyectadas: no toca red, DOM ni React.
 */

import type { AdminProduct } from '@/lib/api/catalog';

import type { MutationResult } from './catalog-client';

export type CoverStep = 'upload' | 'promote';

export type CoverOutcome =
  | {
      readonly ok: true;
      readonly product: AdminProduct;
      /** Id que asignó el backend. Se conserva aunque el paso 2 falle. */
      readonly imageId: string;
      /** El `PATCH` no hizo falta: el backend ya la había marcado principal. */
      readonly alreadyPrimary: boolean;
    }
  | {
      readonly ok: false;
      readonly step: CoverStep;
      readonly code: string;
      /** Producto autoritativo más reciente. Con un fallo en la subida, el de entrada. */
      readonly product: AdminProduct;
      /**
       * Id de la imagen si el paso 1 **sí** salió bien.
       *
       * Es lo que hace reanudable la operación: con esto guardado, el reintento entra directo al
       * paso 2 y no vuelve a mandar el archivo.
       */
      readonly imageId: string | null;
    };

export type CoverDeps = {
  readonly upload: (input: {
    readonly expectedVersion: number;
  }) => Promise<MutationResult<{ product: AdminProduct; image: { id: string } }>>;
  readonly promote: (input: {
    readonly imageId: string;
    readonly expectedVersion: number;
  }) => Promise<MutationResult<{ product: AdminProduct }>>;
};

/** ¿Está esa imagen marcada como principal en este producto? */
export function isPrimaryIn(product: AdminProduct, imageId: string): boolean {
  return product.images.some((image) => image.id === imageId && image.isPrimary);
}

/**
 * Ejecuta —o reanuda— el cambio de portada.
 *
 * `uploadedImageId` es el progreso previo: si viene con valor, el paso 1 ya ocurrió y no se repite.
 */
export async function runCoverFlow(
  product: AdminProduct,
  uploadedImageId: string | null,
  deps: CoverDeps,
): Promise<CoverOutcome> {
  let current = product;
  let imageId = uploadedImageId;

  if (imageId === null) {
    const uploaded = await deps.upload({ expectedVersion: current.version });

    if (!uploaded.ok) {
      return { ok: false, step: 'upload', code: uploaded.code, product: current, imageId: null };
    }

    current = uploaded.data.product;
    imageId = uploaded.data.image.id;
  }

  /*
   * El backend marca principal a la primera imagen de un producto. Cuando eso ya ocurrió, la
   * operación está terminada y el `PATCH` sobra: comprobarlo es más barato que pedirlo, y evita
   * gastar una versión del producto para escribir lo que ya estaba escrito.
   */
  if (isPrimaryIn(current, imageId)) {
    return { ok: true, product: current, imageId, alreadyPrimary: true };
  }

  const promoted = await deps.promote({ imageId, expectedVersion: current.version });

  if (!promoted.ok) {
    return { ok: false, step: 'promote', code: promoted.code, product: current, imageId };
  }

  current = promoted.data.product;

  /*
   * Se comprueba el resultado en lugar de confiar en el `200`. «Portada actualizada» es una
   * afirmación sobre lo que verá la tienda, y afirmarla sin mirar la respuesta es exactamente lo
   * que hacía que el mensaje mintiera.
   */
  if (!isPrimaryIn(current, imageId)) {
    return { ok: false, step: 'promote', code: 'cover_not_applied', product: current, imageId };
  }

  return { ok: true, product: current, imageId, alreadyPrimary: false };
}
