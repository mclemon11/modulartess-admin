/**
 * Normalización de texto a slug. Módulo puro.
 *
 * Sirve para **sugerir**: el slug de categoría o de tipo, y el valor normalizado de un eje de
 * variación. Lo que se sugiere queda siempre editable antes de guardar, porque quien escribe el
 * nombre puede querer otro slug, y el contrato solo exige la forma, no la procedencia.
 *
 * El acento se pliega con `NFD` y se descarta la marca diacrítica: el contrato describe el valor
 * de un atributo como «accent-folded», y es lo que espera el filtro público.
 */

export function toSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * SKU sugerido a partir de un texto: mayúsculas, dígitos y guiones.
 *
 * El SKU es inmutable en cuanto se crea, así que esto es solo un punto de partida que se puede
 * corregir mientras la variante siga siendo local.
 */
export function toSku(value: string): string {
  return toSlug(value).toUpperCase();
}
