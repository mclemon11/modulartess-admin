/**
 * Anclas de los dos bloques de imagen.
 *
 * Viven fuera de `SECTION_IDS` a propósito: aquello enumera las secciones que recorre el checklist
 * de publicación, y Portada y Galería no son requisitos —el contrato dejó de exigir imágenes—. Lo
 * que sí son es destinos reales a los que la guía enlaza, y por eso el identificador se escribe una
 * sola vez y lo usan tanto quien lo pinta como quien enlaza.
 */
export const IMAGE_ANCHORS = {
  portada: 'portada',
  galeria: 'galeria',
} as const;

export type ImageAnchor = (typeof IMAGE_ANCHORS)[keyof typeof IMAGE_ANCHORS];
