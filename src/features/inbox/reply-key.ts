/**
 * Clave de idempotencia de una respuesta, atada a lo que dice.
 *
 * Reintentar exactamente la misma respuesta —misma conversación, versión y texto— reutiliza la
 * clave, y el backend devuelve la que ya encoló en lugar de mandar otro correo. Cambiar el texto o
 * la versión produce una clave nueva: con la vieja, el backend lo trataría como conflicto.
 *
 * Módulo puro.
 */

export type ReplyKey = { readonly fingerprint: string; readonly key: string };

export function replyFingerprint(conversationId: string, version: number, text: string): string {
  return `${encodeURIComponent(conversationId)}|${version}|${encodeURIComponent(text)}`;
}

export function keyFor(
  current: ReplyKey | null,
  fingerprint: string,
  newKey: () => string,
): ReplyKey {
  return current !== null && current.fingerprint === fingerprint
    ? current
    : { fingerprint, key: newKey() };
}
