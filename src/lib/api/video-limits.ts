/**
 * Límites de video que publica el contrato (ADR 0026 del backend).
 *
 * Igual que `./image-limits`: módulo puro, fuera de `./catalog`, porque el navegador también los
 * necesita para validar antes de subir y `catalog` es `server-only`.
 */

/** Único formato admitido. Nada de YouTube, Vimeo, iframes ni GIF. */
export const VIDEO_CONTENT_TYPES = ['video/mp4'] as const;

/** Extensión admitida, en minúsculas. */
export const VIDEO_EXTENSION = 'mp4';

/** `AdminProductVideoDto.sizeBytes.maximum`: 20 MiB. */
export const VIDEO_MAX_BYTES = 20_971_520;

/** `AdminProductVideoDto.title.maxLength`. */
export const VIDEO_TITLE_MAX_LENGTH = 200;

/** Máximo de videos activos por producto, según la descripción de la operación de subida. */
export const VIDEO_MAX_ACTIVE = 3;

/**
 * Margen para las cabeceras del multipart sobre el tamaño del archivo, el mismo que aplica el
 * backend. El BFF rechaza antes de leer un cuerpo que declare más.
 */
export const MULTIPART_MARGIN_BYTES = 64 * 1024;

/** Tamaño legible en español: «12,4 MB». Base 1024, como el límite. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/** Duración legible: «0:12», «1:05». `null` se dice como desconocida, nunca se inventa. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return 'duración desconocida';
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export type VideoFileProblem =
  'video_empty' | 'video_too_large' | 'video_content_type_mismatch' | 'video_extension_mismatch';

/**
 * Comprobación previa en el navegador: tipo declarado, extensión y tamaño. No sustituye a la del
 * backend —que inspecciona el contenedor real—; evita subir 20 MB para que los rechacen.
 */
export function checkVideoFile(file: {
  readonly name: string;
  readonly type: string;
  readonly size: number;
}): VideoFileProblem | null {
  if (file.size === 0) return 'video_empty';
  if (file.size > VIDEO_MAX_BYTES) return 'video_too_large';
  const dot = file.name.lastIndexOf('.');
  const extension = dot === -1 ? '' : file.name.slice(dot + 1).toLowerCase();
  if (extension !== VIDEO_EXTENSION) return 'video_extension_mismatch';
  if (file.type !== 'video/mp4') return 'video_content_type_mismatch';
  return null;
}
