/**
 * Coordinador del alta de un producto con sus imágenes.
 *
 * El contrato obliga a este orden: no se puede subir una imagen sin `productId` ni sin la
 * `expectedVersion` vigente del producto. Y cada subida **incrementa** esa versión, porque el
 * backend devuelve el producto completo con su versión nueva. De ahí las dos reglas duras:
 *
 *   1. Las subidas van en serie, nunca en paralelo. Dos subidas simultáneas partirían de la misma
 *      versión y la segunda chocaría con un `409`.
 *   2. Cada subida usa la versión que devolvió la anterior, no la que se leyó al crear.
 *
 * El coordinador es **reanudable**: recibe el progreso previo y continúa desde donde se quedó. Un
 * reintento tras un fallo parcial no vuelve a crear el producto ni resube lo ya subido, y reutiliza
 * la clave de idempotencia de cada imagen.
 *
 * Módulo puro salvo por las dependencias inyectadas: no toca red, DOM ni React.
 */

import type { AdminProduct } from '@/lib/api/catalog';

import type { MutationResult } from './catalog-client';
import type { QueuedImage } from './image-queue';

export type UploadedEntry = {
  readonly entryId: string;
  /** Id que asignó el backend a la imagen. Hace falta para designar la principal al final. */
  readonly imageId: string;
};

export type FlowFailure = {
  /** `null` cuando lo que falló fue la creación del producto. */
  readonly entryId: string | null;
  readonly code: string;
};

export type CreateFlowProgress = {
  /** Producto creado, siempre en su versión autoritativa más reciente. */
  readonly product: AdminProduct | null;
  readonly uploaded: readonly UploadedEntry[];
  readonly failure: FlowFailure | null;
  /** La principal elegida ya está aplicada en el backend. */
  readonly primaryApplied: boolean;
};

export type UploadInput = {
  readonly productId: string;
  readonly expectedVersion: number;
  readonly entry: QueuedImage;
};

export type CreateFlowDeps = {
  readonly createProduct: (fields: unknown) => Promise<MutationResult<AdminProduct>>;
  readonly uploadImage: (
    input: UploadInput,
  ) => Promise<MutationResult<{ product: AdminProduct; image: { id: string } }>>;
  readonly setPrimary: (input: {
    readonly productId: string;
    readonly imageId: string;
    readonly expectedVersion: number;
  }) => Promise<MutationResult<{ product: AdminProduct }>>;
};

export const EMPTY_PROGRESS: CreateFlowProgress = {
  product: null,
  uploaded: [],
  failure: null,
  primaryApplied: false,
};

/** El flujo terminó del todo: producto creado, imágenes subidas y principal aplicada. */
export function isComplete(progress: CreateFlowProgress): boolean {
  return progress.product !== null && progress.failure === null && progress.primaryApplied;
}

/**
 * Ejecuta —o reanuda— el alta.
 *
 * Devuelve siempre el progreso alcanzado, aunque haya fallado: quien llama lo conserva para poder
 * reintentar sin repetir nada.
 */
export async function runCreateFlow(
  fields: unknown,
  queue: readonly QueuedImage[],
  primaryEntryId: string | null,
  deps: CreateFlowDeps,
  previous: CreateFlowProgress = EMPTY_PROGRESS,
): Promise<CreateFlowProgress> {
  let product = previous.product;
  const uploaded = [...previous.uploaded];

  // 1. Crear el producto, solo si todavía no existe. Un reintento nunca vuelve a crearlo.
  if (product === null) {
    const created = await deps.createProduct(fields);

    if (!created.ok) {
      return {
        product: null,
        uploaded: [],
        failure: { entryId: null, code: created.code },
        primaryApplied: false,
      };
    }

    product = created.data;
  }

  // 2. Subir en serie lo que falte, cada una con la versión que devolvió la anterior.
  for (const entry of queue) {
    if (uploaded.some((done) => done.entryId === entry.entryId)) {
      continue;
    }

    const result = await deps.uploadImage({
      productId: product.id,
      expectedVersion: product.version,
      entry,
    });

    if (!result.ok) {
      return {
        product,
        uploaded,
        failure: { entryId: entry.entryId, code: result.code },
        primaryApplied: false,
      };
    }

    product = result.data.product;
    uploaded.push({ entryId: entry.entryId, imageId: result.data.image.id });
  }

  // 3. Aplicar la principal elegida, solo si no es ya la que fijó el backend.
  //
  // El backend marca principal a la primera imagen que recibe. Si la elegida es esa, no hace falta
  // gastar una llamada.
  const chosen = uploaded.find((done) => done.entryId === primaryEntryId);

  if (chosen === undefined) {
    return { product, uploaded, failure: null, primaryApplied: true };
  }

  const current = product.images.find((image) => image.id === chosen.imageId);

  if (current?.isPrimary === true) {
    return { product, uploaded, failure: null, primaryApplied: true };
  }

  const applied = await deps.setPrimary({
    productId: product.id,
    imageId: chosen.imageId,
    expectedVersion: product.version,
  });

  if (!applied.ok) {
    return {
      product,
      uploaded,
      failure: { entryId: chosen.entryId, code: applied.code },
      primaryApplied: false,
    };
  }

  return { product: applied.data.product, uploaded, failure: null, primaryApplied: true };
}

/** Resumen para la pantalla tras un fallo parcial. */
export function describeProgress(
  progress: CreateFlowProgress,
  queue: readonly QueuedImage[],
): { readonly uploaded: number; readonly total: number; readonly pending: readonly QueuedImage[] } {
  const pending = queue.filter(
    (entry) => !progress.uploaded.some((done) => done.entryId === entry.entryId),
  );

  // Solo se cuentan las subidas que siguen visibles en la cola. Si una desapareciera, el resumen
  // diría «3 de 2», que es un número imposible y erosiona la confianza en el resto del mensaje.
  const uploaded = progress.uploaded.filter((done) =>
    queue.some((entry) => entry.entryId === done.entryId),
  );

  return { uploaded: uploaded.length, total: queue.length, pending };
}
