/**
 * Cabeceras de la descarga de un adjunto.
 *
 * Lo que el backend manda se acepta solo si tiene la forma esperada; cualquier otra cosa se
 * sustituye por lo más conservador —binario opaco, descarga sin nombre—. Módulo puro.
 */

/** Los tipos que el backend admite guardar. Cualquier otro valor viaja como binario opaco. */
const SAFE_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
]);

/** Solo `attachment; filename="..."` con un nombre sin comillas, barras ni controles. */
const SAFE_DISPOSITION = /^attachment; filename="[^"\\/\u0000-\u001f]{1,200}"$/;

export function safeContentType(value: string | null): string {
  const base = value?.split(';')[0]?.trim().toLowerCase() ?? '';

  return SAFE_TYPES.has(base) ? base : 'application/octet-stream';
}

export function safeDisposition(value: string | null): string {
  return value !== null && SAFE_DISPOSITION.test(value) ? value : 'attachment';
}
