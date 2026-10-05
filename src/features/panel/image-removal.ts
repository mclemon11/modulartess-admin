import { describeCatalogFailure } from './catalog-errors';

/**
 * Resultado de retirar una imagen, tal como lo necesita el diálogo de confirmación.
 *
 * El diálogo es modal: mientras está abierto tapa el aviso de la sección, así que un fallo tiene
 * que llegarle como texto para pintarlo dentro. Solo `ok: true` lo cierra.
 */
export type ImageRemovalOutcome =
  { readonly ok: true } | { readonly ok: false; readonly message: string };

export const IMAGE_REMOVAL_BUSY_MESSAGE =
  'Hay otra operación de imágenes en curso. Espera a que termine e inténtalo de nuevo.';

export const LAST_IMAGE_WITH_VIDEOS_MESSAGE =
  'No puedes quitar la única imagen mientras haya videos activos. Agrega otra imagen o elimina primero los videos.';

/**
 * Mensaje para un fallo al retirar una imagen.
 *
 * La regla de los videos necesita algo más que el mensaje genérico del catálogo: aquí se explica
 * con la salida concreta. El conflicto de versión ya pide recargar en su propio mensaje.
 */
export function describeImageRemovalFailure(code: string, reference?: string): string {
  if (code === 'video_invalid' && reference === 'image_required_with_videos') {
    return LAST_IMAGE_WITH_VIDEOS_MESSAGE;
  }

  return describeCatalogFailure(code, reference);
}
