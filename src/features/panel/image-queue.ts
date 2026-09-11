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

export type QueuedImage = {
  /** Identidad local de la entrada. No es el id del backend. */
  readonly entryId: string;
  readonly file: File;
  /** `URL.createObjectURL(file)`. Hay que revocarla al quitar la entrada o al desmontar. */
  readonly previewUrl: string;
  readonly altText: string;
  /**
   * Clave de idempotencia de **esta** imagen.
   *
   * Se genera al encolar y se conserva en los reintentos, para que un fallo de red después de que
   * el objeto ya se creó no acabe subiéndolo dos veces. Cambiar el archivo de la entrada la
   * renueva: es otra operación.
   */
  readonly idempotencyKey: string;
};

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
  if (queue.length >= IMAGE_MAX_ACTIVE) {
    return unchanged(queue, `No puedes añadir más de ${IMAGE_MAX_ACTIVE} imágenes.`);
  }

  const rejected = rejectFile(entry.file);

  if (rejected !== null) {
    return { queue, revoked: [entry.previewUrl], rejected };
  }

  return {
    queue: [...queue, { ...entry, altText: '' }],
    revoked: [],
    rejected: null,
  };
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

  if (
    locked(lockedIds, entryId) ||
    (destination !== undefined && locked(lockedIds, destination.entryId))
  ) {
    return unchanged(queue, LOCKED_MESSAGE);
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
      entry.entryId === entryId ? { ...entry, file, previewUrl, idempotencyKey } : entry,
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
  if (queue.length === 0) {
    return null;
  }

  if (chosen !== null && queue.some((entry) => entry.entryId === chosen)) {
    return chosen;
  }

  return queue[0]?.entryId ?? null;
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
