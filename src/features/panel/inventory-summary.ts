/**
 * Cómo se dice un inventario en el **listado** del catálogo.
 *
 * Módulo puro: recibe lo que publicó el backend y devuelve texto. No llama, no calcula
 * disponibilidad y no decide si algo se puede comprar —eso es una regla comercial y vive en el
 * backend—. Lo que hace es elegir qué frase corresponde, que es exactamente donde la tabla y la
 * tarjeta móvil se desviaban una de otra.
 *
 * La regla de fondo es una sola: **un producto con variantes activas no tiene inventario
 * vendible propio**. Su `inventory` base sigue existiendo en el contrato y sigue llegando, pero
 * mientras haya variantes activas deja de gobernar, así que enseñarlo en la lista afirmaría algo
 * falso. En su lugar se resume lo que sí se vende.
 */

import { readInventory, unitsLabel, type InventoryTone } from './inventory-control';

import type { AdminProduct, AdminProductVariant } from '@/lib/api/catalog';

/** Una línea de inventario lista para pintar: el texto y el tono que lo acompaña. */
export type ListingInventory = {
  readonly tone: InventoryTone;
  readonly label: string;
};

/** Las variantes que cuentan: las activas. Una archivada ya no se vende. */
export function activeVariants(
  variants: readonly AdminProductVariant[],
): readonly AdminProductVariant[] {
  return variants.filter((variant) => variant.archivedAt === null);
}

/**
 * El inventario base dicho en palabras.
 *
 * En `tracked` se dice la cantidad; en `availability` **no hay número que decir**, y escribir
 * «0 unidades» ahí inventaría un dato que el contrato se cuida de mandar en `null`.
 */
export function baseInventoryLabel(product: AdminProduct): ListingInventory {
  const reading = readInventory(product.inventory);

  if (product.inventory.mode === 'availability') {
    return { tone: reading.tone, label: reading.label };
  }

  if (reading.tone === 'outOfStock') {
    return { tone: 'outOfStock', label: 'Sin existencias' };
  }

  if (reading.tone === 'lowStock') {
    // Las dos cosas: cuántas quedan y que son pocas. «Stock bajo» a secas obliga a abrir la ficha
    // para saber si quedan dos o veinte.
    return { tone: 'lowStock', label: `${reading.quantityLabel ?? ''} · Stock bajo`.trim() };
  }

  return { tone: 'inStock', label: reading.quantityLabel ?? '' };
}

function variantsLabel(count: number): string {
  return `${count} ${count === 1 ? 'variante' : 'variantes'}`;
}

/**
 * El resumen de las variantes activas.
 *
 * Es **informativo**. La suma de unidades no es un inventario: no se le aplica el umbral del
 * producto, no decide disponibilidad y no se usa para ninguna regla de compra. Sirve para que
 * quien mira la lista sepa si tiene que entrar.
 *
 * El orden de los casos no es casual. «Todo agotado» va primero porque es el único que cambia una
 * decisión: da igual si esas cuatro variantes llevan conteo o no si ninguna se puede vender.
 */
export function variantInventorySummary(
  variants: readonly AdminProductVariant[],
): ListingInventory {
  const active = activeVariants(variants);

  if (active.length === 0) {
    return { tone: 'inStock', label: 'Sin variantes activas' };
  }

  if (active.every((variant) => variant.inventory.availability === 'out_of_stock')) {
    return { tone: 'outOfStock', label: 'Variantes sin existencias' };
  }

  const tracked = active.filter((variant) => variant.inventory.mode === 'tracked');
  const availability = active.filter((variant) => variant.inventory.mode === 'availability');

  if (availability.length === 0) {
    const units = tracked.reduce((total, variant) => total + (variant.inventory.quantity ?? 0), 0);

    return { tone: 'inStock', label: `${unitsLabel(units)} en ${variantsLabel(tracked.length)}` };
  }

  if (tracked.length === 0) {
    const inStock = availability.filter(
      (variant) => variant.inventory.availability === 'in_stock',
    ).length;
    const outOfStock = availability.length - inStock;
    const parts: string[] = [];

    // Un «0 sin existencias» no aporta nada y se lee como si algo fallara. Solo se dice lo que hay.
    if (inStock > 0) parts.push(`${inStock} con existencias`);
    if (outOfStock > 0) parts.push(`${outOfStock} sin existencias`);

    return { tone: 'inStock', label: parts.join(' · ') };
  }

  /*
   * Mixto: **no se suma**. Sumar las unidades de las que llevan conteo y presentarlas como el
   * inventario del producto diría «hay 12» cuando además hay dos variantes disponibles sin
   * cantidad conocida. Lo honesto es decir que conviven dos formas de controlarlo.
   */
  return {
    tone: 'inStock',
    label: `Inventario mixto · ${tracked.length} con cantidad · ${availability.length} por disponibilidad`,
  };
}

/** Lo que va en la celda «Inventario» del listado, venga de la base o de las variantes. */
export function listingInventory(product: AdminProduct): ListingInventory {
  return activeVariants(product.variants).length > 0
    ? variantInventorySummary(product.variants)
    : baseInventoryLabel(product);
}
