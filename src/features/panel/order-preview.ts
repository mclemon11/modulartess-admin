/**
 * Textos del primer producto de un pedido en el listado.
 *
 * Viven aparte de la pantalla porque son una cuenta, no una decoración: el contrato dice que
 * `itemCount` es el **total de líneas** y que «the panel subtracts one from it to say "and N more
 * products"; the backend does not compose that text». Equivocarse en esa resta hace que un pedido
 * de dos líneas diga que tiene dos productos más de los que tiene.
 *
 * Módulo puro.
 */

export function unitLabel(quantity: number): string {
  return `${quantity} unidad${quantity === 1 ? '' : 'es'}`;
}

/** «y N productos más», o `null` cuando el pedido tiene una sola línea. */
export function extraLabel(itemCount: number): string | null {
  const rest = itemCount - 1;

  return rest <= 0 ? null : `y ${rest} producto${rest === 1 ? '' : 's'} más`;
}
