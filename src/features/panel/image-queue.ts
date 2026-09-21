/**
 * Cola local de imágenes de la pantalla de alta.
 *
 * El backend exige `productId` y `expectedVersion` para subir, así que no hay forma de subir nada
 * antes de crear el producto. En vez de crear el producto a escondidas al elegir el primer
 * archivo —que dejaría borradores huérfanos cada vez que alguien abandona la pantalla—, las
 * imágenes se guardan aquí hasta que la persona pulsa «Crear producto».
 *
 * Módulo puro sobre datos. Las `object URL` las crea y revoca el componente: las operaciones
 * devuelven qué URLs han quedado huérfanas para que las revoque quien las creó.
 */

import { IMAGE_MAX_ACTIVE, IMAGE_MAX_BYTES, IMAGE_CONTENT_TYPES } from '@/lib/api/image-limits';

/**
 * Para qué se eligió este archivo.
 *
 * Es **intención**, no posición, y por eso se guarda en la entrada en lugar de deducirse de dónde
 * aparece en la lista. Quien pulsa «Cambiar portada» está pidiendo una operación distinta de quien
 * pulsa «Agregar imágenes a la galería»: la primera termina con `isPrimary: true` y la segunda no
 * puede terminar así nunca. Deducirlo del orden fue exactamente el fallo que se corrige aquí.
 */
export type ImageIntent = 'cover' | 'gallery';

export type QueuedImage = {
  /** Identidad local de la entrada. No es el id del backend. */
  readonly entryId: string;
  readonly file: File;
  /** `URL.createObjectURL(file)`. Hay que revocarla al quitar la entrada o al desmontar. */
  readonly previewUrl: string;
  readonly altText: string;
  readonly intent: ImageIntent;
  /**
   * Id que devolvió el backend si este archivo **ya se subió**.
   *
   * Solo lo usa la portada, y existe por el fallo parcial que hace falta tolerar: subir la imagen
   * y marcarla como principal son dos llamadas, y la segunda puede fallar sola. Con el id guardado,
   * el reintento continúa en el `PATCH` en vez de volver a subir un archivo que ya está en el
   * bucket.
   */
  readonly uploadedImageId: string | null;
  /**
   * Clave de idempotencia de **esta** imagen.
   *
   * Se genera al encolar y se conserva en los reintentos, para que un fallo de red después de que
   * el objeto ya se creó no acabe subiéndolo dos veces. Cambiar el archivo de la entrada la
   * renueva: es otra operación.
   */
  readonly idempotencyKey: string;
};

/** La candidata a portada, si hay alguna. Solo puede haber una. */
export function coverCandidate(queue: readonly QueuedImage[]): QueuedImage | null {
  return queue.find((entry) => entry.intent === 'cover') ?? null;
}

/** Lo que va a la galería: todo lo que no es la candidata a portada. */
export function galleryEntries(queue: readonly QueuedImage[]): readonly QueuedImage[] {
  return queue.filter((entry) => entry.intent !== 'cover');
}

/**
 * Lo que todavía **no** está en el backend.
 *
 * Es lo que hay que sumar a las imágenes activas para saber cuántas habrá. Una entrada con
 * `uploadedImageId` ya viaja dentro de `product.images`: sigue en la cola porque le falta el paso
 * de marcarla como portada, no porque falte subirla. Contarla otra vez inflaba el total y podía
 * dar el límite por alcanzado con un hueco libre.
 */
export function pendingUploads(queue: readonly QueuedImage[]): readonly QueuedImage[] {
  return queue.filter((entry) => entry.uploadedImageId === null);
}

export type QueueChange = {
  readonly queue: readonly QueuedImage[];
  /** URLs que ya no usa nadie. El componente debe revocarlas. */
  readonly revoked: readonly string[];
  /** Motivo por el que no se pudo aplicar la operación, si lo hay. */
  readonly rejected: string | null;
};

export type NewEntry = {
  readonly file: File;
  readonly previewUrl: string;
  readonly entryId: string;
  readonly idempotencyKey: string;
  /** Por omisión, galería: encolar sin decir nada **no** puede acabar eligiendo la portada. */
  readonly intent?: ImageIntent;
};

function unchanged(queue: readonly QueuedImage[], rejected: string | null): QueueChange {
  return { queue, revoked: [], rejected };
}

/**
 * Motivo fijo por el que una entrada ya subida no se puede tocar.
 *
 * Tras un alta parcial, las imágenes que llegaron al backend existen de verdad: quitarlas,
 * reemplazarlas o reordenarlas aquí solo cambiaría la lista local y haría que el resumen mintiera
 * sobre lo que hay en el producto. Se gestionan desde el detalle, donde cada operación sí llega al
 * backend.
 */
export const LOCKED_MESSAGE =
  'Esa imagen ya se subió. Para cambiarla, abre el producto y edítala desde su detalle.';

function locked(lockedIds: readonly string[], entryId: string): boolean {
  return lockedIds.includes(entryId);
}

/** Comprueba el archivo contra los límites que publica el contrato. */
export function rejectFile(file: File): string | null {
  if (!(IMAGE_CONTENT_TYPES as readonly string[]).includes(file.type)) {
    return 'Solo se admiten JPG, PNG o WebP.';
  }

  if (file.size === 0) {
    return 'El archivo está vacío.';
  }

  if (file.size > IMAGE_MAX_BYTES) {
    return 'Cada imagen puede pesar como máximo 10 MB.';
  }

  return null;
}

export function addToQueue(queue: readonly QueuedImage[], entry: NewEntry): QueueChange {
  const intent: ImageIntent = entry.intent ?? 'gallery';
  const previous = intent === 'cover' ? coverCandidate(queue) : null;

  // Una candidata a portada **sustituye** a la anterior: elegir otro archivo en el bloque Portada
  // es cambiar de idea, no encolar dos portadas. Por eso no cuenta contra el tope aquí.
  if (previous === null && queue.length >= IMAGE_MAX_ACTIVE) {
    return unchanged(queue, `No puedes añadir más de ${IMAGE_MAX_ACTIVE} imágenes.`);
  }

  const rejected = rejectFile(entry.file);

  if (rejected !== null) {
    return { queue, revoked: [entry.previewUrl], rejected };
  }

  const added: QueuedImage = {
    entryId: entry.entryId,
    file: entry.file,
    previewUrl: entry.previewUrl,
    idempotencyKey: entry.idempotencyKey,
    altText: '',
    intent,
    uploadedImageId: null,
  };

  if (previous === null) {
    return { queue: [...queue, added], revoked: [], rejected: null };
  }

  /*
   * La candidata anterior desaparece con su vista previa. No se conserva «por si acaso»: nunca se
   * subió, así que no hay nada en el backend que recuperar, y dejarla viva retendría el archivo.
   *
   * Si la anterior **sí** se había subido ya —falló el paso de marcarla principal—, no se sustituye
   * en silencio: quitarla es una acción explícita.
   */
  if (previous.uploadedImageId !== null) {
    return {
      queue,
      revoked: [entry.previewUrl],
      rejected:
        'Esa imagen ya se subió y solo le falta quedar como portada. Reintenta la portada o quítala antes de elegir otra.',
    };
  }

  return {
    queue: queue.map((item) => (item.entryId === previous.entryId ? added : item)),
    revoked: [previous.previewUrl],
    rejected: null,
  };
}

/**
 * Marca una entrada de la galería como candidata a portada.
 *
 * Es el «Convertir en portada» del alta. La candidata anterior **vuelve a la galería** en lugar de
 * desaparecer: se eligió a propósito y sigue siendo una imagen del producto.
 */
export function setCoverIntent(
  queue: readonly QueuedImage[],
  entryId: string,
  lockedIds: readonly string[] = [],
): QueueChange {
  if (locked(lockedIds, entryId)) {
    return unchanged(queue, LOCKED_MESSAGE);
  }

  const target = queue.find((entry) => entry.entryId === entryId);

  if (target === undefined || target.intent === 'cover') {
    return unchanged(queue, null);
  }

  const previous = coverCandidate(queue);

  if (previous !== null && previous.uploadedImageId !== null) {
    return unchanged(
      queue,
      'La portada elegida ya se subió y solo le falta quedar como principal. Termina esa operación antes de elegir otra.',
    );
  }

  return {
    queue: queue.map((entry) =>
      entry.entryId === entryId
        ? { ...entry, intent: 'cover' }
        : entry.intent === 'cover'
          ? { ...entry, intent: 'gallery' }
          : entry,
    ),
    revoked: [],
    rejected: null,
  };
}

/** Anota que este archivo ya está en el backend. El reintento continuará en el paso siguiente. */
export function markUploaded(
  queue: readonly QueuedImage[],
  entryId: string,
  imageId: string,
): readonly QueuedImage[] {
  return queue.map((entry) =>
    entry.entryId === entryId ? { ...entry, uploadedImageId: imageId } : entry,
  );
}

export function removeFromQueue(
  queue: readonly QueuedImage[],
  entryId: string,
  lockedIds: readonly string[] = [],
): QueueChange {
  if (locked(lockedIds, entryId)) {
    return unchanged(queue, LOCKED_MESSAGE);
  }

  const target = queue.find((entry) => entry.entryId === entryId);

  if (target === undefined) {
    return unchanged(queue, null);
  }

  return {
    queue: queue.filter((entry) => entry.entryId !== entryId),
    revoked: [target.previewUrl],
    rejected: null,
  };
}

/**
 * Mueve una entrada una posición. El orden de la cola es el orden con el que se subirá.
 *
 * Una entrada ya subida no se mueve, y tampoco se puede mover una pendiente por encima de una
 * subida: el orden de lo que ya está en el backend lo decide el detalle, no esta pantalla.
 */
export function moveInQueue(
  queue: readonly QueuedImage[],
  entryId: string,
  direction: -1 | 1,
  lockedIds: readonly string[] = [],
): QueueChange {
  const index = queue.findIndex((entry) => entry.entryId === entryId);
  const target = index + direction;

  if (index === -1 || target < 0 || target >= queue.length) {
    return unchanged(queue, null);
  }

  const destination = queue[target];
  const moving = queue[index];

  if (
    locked(lockedIds, entryId) ||
    (destination !== undefined && locked(lockedIds, destination.entryId))
  ) {
    return unchanged(queue, LOCKED_MESSAGE);
  }

  /*
   * Mover no cruza la frontera entre portada y galería. El orden solo tiene sentido dentro de la
   * galería, y permitir el intercambio convertiría una pulsación de «Subir» en un cambio de
   * portada que nadie pidió.
   */
  if (moving !== undefined && destination !== undefined && moving.intent !== destination.intent) {
    return unchanged(queue, null);
  }

  const next = [...queue];
  const [moved] = next.splice(index, 1);

  if (moved === undefined) {
    return unchanged(queue, null);
  }

  next.splice(target, 0, moved);

  return { queue: next, revoked: [], rejected: null };
}

export function setAltText(
  queue: readonly QueuedImage[],
  entryId: string,
  altText: string,
  lockedIds: readonly string[] = [],
): QueueChange {
  if (locked(lockedIds, entryId)) {
    return unchanged(queue, LOCKED_MESSAGE);
  }

  return {
    queue: queue.map((entry) => (entry.entryId === entryId ? { ...entry, altText } : entry)),
    revoked: [],
    rejected: null,
  };
}

/**
 * Sustituye el archivo de una entrada.
 *
 * Renueva la clave de idempotencia: subir un archivo distinto es otra operación, y reutilizar la
 * clave haría que el backend la considerase repetida y devolviera la imagen anterior.
 */
export function replaceFile(
  queue: readonly QueuedImage[],
  entryId: string,
  file: File,
  previewUrl: string,
  idempotencyKey: string,
  lockedIds: readonly string[] = [],
): QueueChange {
  if (locked(lockedIds, entryId)) {
    return { queue, revoked: [previewUrl], rejected: LOCKED_MESSAGE };
  }

  const target = queue.find((entry) => entry.entryId === entryId);

  if (target === undefined) {
    return { queue, revoked: [previewUrl], rejected: null };
  }

  const rejected = rejectFile(file);

  if (rejected !== null) {
    return { queue, revoked: [previewUrl], rejected };
  }

  return {
    queue: queue.map((entry) =>
      entry.entryId === entryId
        ? // `uploadedImageId` vuelve a `null`: lo que había subido era el archivo anterior, y dar
          // por bueno su id marcaría como portada una imagen que ya no es la elegida.
          { ...entry, file, previewUrl, idempotencyKey, uploadedImageId: null }
        : entry,
    ),
    revoked: [target.previewUrl],
    rejected: null,
  };
}

/**
 * Resuelve qué entrada es la principal.
 *
 * La primera lo es por defecto. Si la elegida ya no está —porque se quitó—, vuelve a serlo la
 * primera que quede, sin que haya que recordarlo en ningún sitio.
 */
export function resolvePrimary(
  queue: readonly QueuedImage[],
  chosen: string | null,
): string | null {
  const cover = coverCandidate(queue);

  if (cover !== null) {
    return cover.entryId;
  }

  /*
   * Sin candidata **no hay portada**, y no se elige una por descarte.
   *
   * Antes esto devolvía `queue[0]`, y ahí estaba el fallo: quitar la portada ascendía en silencio
   * a la primera imagen que hubiera llegado por la galería. Quien mira la pantalla ve «Agregar
   * portada» y el formulario bloquea el envío hasta que se elija.
   */
  return chosen !== null && queue.some((entry) => entry.entryId === chosen) ? chosen : null;
}

/**
 * Entradas a las que todavía les falta el texto alternativo, que es obligatorio.
 *
 * Las ya subidas quedan fuera: su texto lo fijó el backend y aquí no se puede cambiar.
 */
export function entriesMissingAltText(
  queue: readonly QueuedImage[],
  lockedIds: readonly string[] = [],
): readonly QueuedImage[] {
  return queue.filter(
    (entry) => !locked(lockedIds, entry.entryId) && entry.altText.trim().length === 0,
  );
}
