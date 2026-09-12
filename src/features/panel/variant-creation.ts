/**
 * Alta en serie de variantes sobre un producto que **ya existe**.
 *
 * Es la misma regla que en el alta completa y por el mismo motivo: cada variante creada
 * incrementa la versión del producto, así que la siguiente tiene que partir de la versión que
 * devolvió la anterior. Dos altas a la vez chocarían con un `409`.
 *
 * Se detiene en el primer fallo y devuelve lo que sí se creó, junto con el producto autoritativo
 * más reciente. Quien llama reintenta solo lo que falta: las variantes ya creadas tienen SKU
 * reservado y volver a enviarlas sería un `409`.
 *
 * Módulo puro salvo por la función inyectada: no toca red, DOM ni React.
 */

import type { AdminProduct } from '@/lib/api/catalog';

import type { MutationResult } from './catalog-client';
import { variantRequestBody, type VariantDraft } from './variant-draft';

export type VariantCreationProgress = {
  /** Producto en su versión autoritativa más reciente. */
  readonly product: AdminProduct;
  /** Borradores que ya llegaron al backend, con el id que este les asignó. */
  readonly created: readonly { readonly draftId: string; readonly variantId: string }[];
  readonly failure: { readonly draftId: string; readonly code: string } | null;
};

export async function createVariantsSequentially(
  product: AdminProduct,
  drafts: readonly VariantDraft[],
  send: (
    body: ReturnType<typeof variantRequestBody>,
  ) => Promise<MutationResult<{ product: AdminProduct; variant: { id: string } }>>,
): Promise<VariantCreationProgress> {
  let current = product;
  const created: { draftId: string; variantId: string }[] = [];

  for (const draft of drafts) {
    // La versión del cuerpo es siempre la última que devolvió el backend, no la que se leyó al
    // abrir la pantalla.
    const result = await send(variantRequestBody(draft, current.version));

    if (!result.ok) {
      return { product: current, created, failure: { draftId: draft.draftId, code: result.code } };
    }

    current = result.data.product;
    created.push({ draftId: draft.draftId, variantId: result.data.variant.id });
  }

  return { product: current, created, failure: null };
}
