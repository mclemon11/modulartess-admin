/**
 * Coordinador del alta de un producto con su contenido enriquecido, sus imágenes y sus variantes.
 *
 * El contrato impone el orden. `POST /v1/admin/products` solo admite los campos base —SKU, slug,
 * nombre, precio e inventario—; la clasificación, las características, las especificaciones y los
 * ejes de variación se envían con un `PATCH`, y ni una imagen ni una variante se pueden crear sin
 * `productId` y sin la `expectedVersion` vigente. Además **cada paso incrementa esa versión**,
 * porque el backend devuelve el producto completo con la versión nueva. De ahí las tres reglas
 * duras:
 *
 *   1. Un solo clic desencadena toda la secuencia: crear, enriquecer, subir y crear variantes.
 *   2. Nada va en paralelo. Dos operaciones simultáneas partirían de la misma versión y la segunda
 *      chocaría con un `409`.
 *   3. Cada paso usa la versión que devolvió el anterior, no la que se leyó al crear.
 *
 * Los ejes se declaran **antes** que las variantes a propósito: el backend exige que cada variante
 * lleve exactamente los ejes declarados, así que crear variantes antes del `PATCH` las rechazaría.
 *
 * El coordinador es **reanudable**: recibe el progreso previo y continúa desde donde se quedó. Un
 * reintento tras un fallo parcial no vuelve a crear el producto, no resube lo ya subido y no
 * recrea las variantes que ya existen; las imágenes reutilizan su clave de idempotencia.
 *
 * El producto **nunca** se publica aquí: nace en borrador y publicar es una acción aparte.
 *
 * Módulo puro salvo por las dependencias inyectadas: no toca red, DOM ni React.
 */

import type { AdminProduct } from '@/lib/api/catalog';

import type { MutationResult } from './catalog-client';
import type { QueuedImage } from './image-queue';
import type { VariantDraft } from './variant-draft';

export type UploadedEntry = {
  readonly entryId: string;
  /** Id que asignó el backend a la imagen. Hace falta para designar la principal al final. */
  readonly imageId: string;
};

export type CreatedVariant = {
  readonly draftId: string;
  /** Id que asignó el backend a la variante. */
  readonly variantId: string;
};

/** Paso de la secuencia en el que se quedó el alta. */
export type FlowStep = 'create' | 'enrich' | 'image' | 'primary' | 'variant' | 'publish';

/**
 * Qué quiso hacer quien pulsó el botón.
 *
 * `publish` **no** es un atajo que se salte pasos: guarda exactamente lo mismo que `draft` y solo
 * después mira la preparación que devolvió el backend. Un producto nace siempre en borrador.
 */
export type CreateIntent = 'draft' | 'publish';

export type FlowFailure = {
  readonly step: FlowStep;
  /** Entrada local afectada: una imagen o una variante. `null` en los pasos del producto. */
  readonly entryId: string | null;
  readonly code: string;
};

export type CreateFlowProgress = {
  /** Producto creado, siempre en su versión autoritativa más reciente. */
  readonly product: AdminProduct | null;
  /** El `PATCH` con clasificación, contenido y ejes ya se aplicó. */
  readonly enriched: boolean;
  readonly uploaded: readonly UploadedEntry[];
  /** La principal elegida ya está aplicada en el backend. */
  readonly primaryApplied: boolean;
  readonly variants: readonly CreatedVariant[];
  /** La publicación se pidió y el backend la aplicó. */
  readonly published: boolean;
  readonly failure: FlowFailure | null;
};

export type UploadInput = {
  readonly productId: string;
  readonly expectedVersion: number;
  readonly entry: QueuedImage;
};

export type UploadImage = (
  input: UploadInput,
) => Promise<MutationResult<{ product: AdminProduct; image: { id: string } }>>;

export type BatchProgress = {
  /** El producto autoritativo más reciente: el que devolvió la última subida que salió bien. */
  readonly product: AdminProduct;
  readonly uploaded: readonly UploadedEntry[];
  /** La entrada en la que se detuvo el lote, con su código. `null` si terminó entero. */
  readonly failure: { readonly entryId: string; readonly code: string } | null;
};

/**
 * Sube una cola de imágenes **en serie**, cada una con la versión que devolvió la anterior.
 *
 * Es la única implementación de lote que hay, y la comparten el alta y la edición. No es una
 * preferencia de estilo: cada subida incrementa la versión del producto, así que dos subidas
 * simultáneas partirían de la misma y la segunda chocaría con un `409`. `Promise.all` aquí no es
 * una optimización, es un error garantizado en cuanto hay dos archivos.
 *
 * Si una falla, se **detiene**: lo ya subido se conserva en `uploaded` —para no reenviarlo— y lo
 * que falta sigue pendiente con su clave de idempotencia intacta, lista para el reintento.
 */
export async function uploadQueueSequentially(
  product: AdminProduct,
  queue: readonly QueuedImage[],
  uploadImage: UploadImage,
  alreadyUploaded: readonly UploadedEntry[] = [],
  onProgress?: (product: AdminProduct, done: number) => void,
): Promise<BatchProgress> {
  let current = product;
  const uploaded = [...alreadyUploaded];

  for (const entry of queue) {
    if (uploaded.some((done) => done.entryId === entry.entryId)) {
      continue;
    }

    const result = await uploadImage({
      productId: current.id,
      expectedVersion: current.version,
      entry,
    });

    if (!result.ok) {
      return { product: current, uploaded, failure: { entryId: entry.entryId, code: result.code } };
    }

    current = result.data.product;
    uploaded.push({ entryId: entry.entryId, imageId: result.data.image.id });
    onProgress?.(current, uploaded.length);
  }

  return { product: current, uploaded, failure: null };
}

export type CreateFlowInput = {
  readonly intent: CreateIntent;
  /** Cuerpo de `POST /v1/admin/products`: solo lo que ese endpoint admite. */
  readonly fields: unknown;
  /**
   * Campos que solo acepta el `PATCH`. `null` cuando no hay nada que enriquecer: en ese caso no se
   * gasta una llamada para no cambiar nada.
   */
  readonly enrichment: Record<string, unknown> | null;
  readonly queue: readonly QueuedImage[];
  readonly primaryEntryId: string | null;
  readonly variants: readonly VariantDraft[];
};

export type CreateFlowDeps = {
  readonly createProduct: (fields: unknown) => Promise<MutationResult<AdminProduct>>;
  readonly enrichProduct: (input: {
    readonly productId: string;
    readonly expectedVersion: number;
    readonly enrichment: Record<string, unknown>;
  }) => Promise<MutationResult<AdminProduct>>;
  readonly uploadImage: UploadImage;
  readonly setPrimary: (input: {
    readonly productId: string;
    readonly imageId: string;
    readonly expectedVersion: number;
  }) => Promise<MutationResult<{ product: AdminProduct }>>;
  readonly createVariant: (input: {
    readonly productId: string;
    readonly expectedVersion: number;
    readonly draft: VariantDraft;
  }) => Promise<MutationResult<{ product: AdminProduct; variant: { id: string } }>>;
  readonly publishProduct: (input: {
    readonly productId: string;
    readonly expectedVersion: number;
  }) => Promise<MutationResult<AdminProduct>>;
};

export const EMPTY_PROGRESS: CreateFlowProgress = {
  product: null,
  enriched: false,
  uploaded: [],
  primaryApplied: false,
  variants: [],
  published: false,
  failure: null,
};

/** El flujo terminó del todo: producto creado, enriquecido, con sus imágenes y sus variantes. */
export function isComplete(progress: CreateFlowProgress): boolean {
  return progress.product !== null && progress.failure === null && progress.primaryApplied;
}

/**
 * Ejecuta —o reanuda— el alta.
 *
 * Devuelve siempre el progreso alcanzado, aunque haya fallado: quien llama lo conserva para poder
 * reintentar solo lo que falta, sin repetir nada de lo que ya llegó al backend.
 */
export async function runCreateFlow(
  input: CreateFlowInput,
  deps: CreateFlowDeps,
  previous: CreateFlowProgress = EMPTY_PROGRESS,
): Promise<CreateFlowProgress> {
  let product = previous.product;
  let enriched = previous.enriched;
  let published = previous.published;
  const uploaded = [...previous.uploaded];
  const variants = [...previous.variants];

  /** Progreso alcanzado hasta este punto, con el fallo que lo detuvo. */
  function stopped(step: FlowStep, entryId: string | null, code: string): CreateFlowProgress {
    return {
      product,
      enriched,
      uploaded,
      primaryApplied: false,
      variants,
      published,
      failure: { step, entryId, code },
    };
  }

  // 1. Crear el producto, solo si todavía no existe. Un reintento nunca vuelve a crearlo.
  if (product === null) {
    const created = await deps.createProduct(input.fields);

    if (!created.ok) {
      return { ...EMPTY_PROGRESS, failure: { step: 'create', entryId: null, code: created.code } };
    }

    product = created.data;
  }

  // 2. Enriquecer: clasificación, contenido y ejes de variación, con la versión autoritativa.
  //
  // `enriched` solo se marca cuando el `PATCH` se aplicó de verdad. Sin nada que enviar no se marca
  // nada: así, si alguien añade una categoría antes de reintentar, esa categoría sí viaja.
  if (!enriched && input.enrichment !== null) {
    const applied = await deps.enrichProduct({
      productId: product.id,
      expectedVersion: product.version,
      enrichment: input.enrichment,
    });

    if (!applied.ok) {
      return stopped('enrich', null, applied.code);
    }

    product = applied.data;
    enriched = true;
  }

  // 3. Subir en serie lo que falte, con el mismo lote que usa la edición.
  const batch = await uploadQueueSequentially(product, input.queue, deps.uploadImage, uploaded);

  product = batch.product;
  uploaded.length = 0;
  uploaded.push(...batch.uploaded);

  if (batch.failure !== null) {
    return stopped('image', batch.failure.entryId, batch.failure.code);
  }

  // 4. Aplicar la principal elegida, solo si no es ya la que fijó el backend.
  //
  // El backend marca principal a la primera imagen que recibe. Si la elegida es esa, no hace falta
  // gastar una llamada.
  const chosen = uploaded.find((done) => done.entryId === input.primaryEntryId);
  const currentPrimary =
    chosen === undefined ? undefined : product.images.find((image) => image.id === chosen.imageId);

  if (chosen !== undefined && currentPrimary?.isPrimary !== true) {
    const applied = await deps.setPrimary({
      productId: product.id,
      imageId: chosen.imageId,
      expectedVersion: product.version,
    });

    if (!applied.ok) {
      return stopped('primary', chosen.entryId, applied.code);
    }

    product = applied.data.product;
  }

  // 5. Crear las variantes en serie, cada una con la última versión devuelta.
  for (const draft of input.variants) {
    if (variants.some((done) => done.draftId === draft.draftId)) {
      continue;
    }

    const result = await deps.createVariant({
      productId: product.id,
      expectedVersion: product.version,
      draft,
    });

    if (!result.ok) {
      return stopped('variant', draft.draftId, result.code);
    }

    product = result.data.product;
    variants.push({ draftId: draft.draftId, variantId: result.data.variant.id });
  }

  // 6. Publicar, y solo si se pidió y el backend dice que se puede.
  //
  // La preparación se lee de la **última respuesta autoritativa**, no de un cálculo local: el
  // backend evalúa `publicationReadiness` sobre el registro real —imágenes y variantes incluidas—
  // y `publish` consume esa misma evaluación. Con `ready: false` no se llama: el borrador se
  // conserva y la pantalla enseña lo que falta.
  if (input.intent === 'publish' && !published && product.publicationReadiness.ready) {
    const result = await deps.publishProduct({
      productId: product.id,
      expectedVersion: product.version,
    });

    if (!result.ok) {
      return stopped('publish', null, result.code);
    }

    product = result.data;
    published = true;
  }

  return {
    product,
    enriched,
    uploaded,
    primaryApplied: true,
    variants,
    published,
    failure: null,
  };
}

export type FlowSummary = {
  readonly uploaded: number;
  readonly totalImages: number;
  readonly pendingImages: readonly QueuedImage[];
  readonly createdVariants: number;
  readonly totalVariants: number;
  readonly pendingVariants: readonly VariantDraft[];
};

/** Resumen para la pantalla tras un fallo parcial: qué quedó guardado y qué falta. */
export function describeProgress(
  progress: CreateFlowProgress,
  input: { readonly queue: readonly QueuedImage[]; readonly variants: readonly VariantDraft[] },
): FlowSummary {
  const pendingImages = input.queue.filter(
    (entry) => !progress.uploaded.some((done) => done.entryId === entry.entryId),
  );
  const pendingVariants = input.variants.filter(
    (draft) => !progress.variants.some((done) => done.draftId === draft.draftId),
  );

  // Solo se cuenta lo que sigue visible en la pantalla. Si una entrada desapareciera, el resumen
  // diría «3 de 2», que es un número imposible y erosiona la confianza en el resto del mensaje.
  const uploaded = progress.uploaded.filter((done) =>
    input.queue.some((entry) => entry.entryId === done.entryId),
  );
  const created = progress.variants.filter((done) =>
    input.variants.some((draft) => draft.draftId === done.draftId),
  );

  return {
    uploaded: uploaded.length,
    totalImages: input.queue.length,
    pendingImages,
    createdVariants: created.length,
    totalVariants: input.variants.length,
    pendingVariants,
  };
}
