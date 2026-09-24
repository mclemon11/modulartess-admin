/**
 * La categoría de un producto, elegida del catálogo. Módulo puro.
 *
 * El contrato del producto sigue guardando la categoría como **copia** —`{ slug, name }`— y no como
 * referencia: renombrar una categoría no toca los productos que ya la usan, y archivarla tampoco.
 * Por eso aquí conviven dos cosas distintas:
 *
 * - lo que el producto **ya tiene**, que se enseña tal cual y no se cambia solo, aunque la
 *   categoría esté archivada o ya no aparezca en el catálogo;
 * - lo que se **elige** del catálogo, que solo puede ser una categoría activa.
 *
 * Nada de esto se escribe a mano: el nombre y el slug que viajan salen de la categoría elegida.
 */

import type { ProductTaxonomy } from '@/lib/api/catalog';

/** Lo que el selector necesita de una categoría del catálogo. */
export type CategoryOption = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: 'active' | 'archived';
};

export type CategoryChoice =
  /** Sin categoría. */
  | { readonly kind: 'none' }
  /** Elegida del catálogo en esta pantalla. Siempre activa en el momento de elegirla. */
  | { readonly kind: 'catalog'; readonly category: CategoryOption }
  /** La que el producto ya tenía. No se toca mientras nadie elija otra. */
  | { readonly kind: 'current'; readonly taxonomy: ProductTaxonomy };

export const NO_CATEGORY: CategoryChoice = { kind: 'none' };

/** Estado de la categoría que ya tiene un producto, contrastada con el catálogo. */
export type CurrentCategoryStatus = 'active' | 'archived' | 'missing';

/**
 * Pliega tildes y mayúsculas, igual que compara el backend los nombres («Clósets» y «closets» son el
 * mismo). Solo se usa para buscar; lo que se envía conserva su forma.
 */
export function foldText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Lo que el producto ya tiene, como elección inicial. */
export function choiceFromProduct(category: ProductTaxonomy | null): CategoryChoice {
  return category === null ? NO_CATEGORY : { kind: 'current', taxonomy: category };
}

/**
 * ¿En qué estado está la categoría que ya tiene el producto?
 *
 * Se busca por **slug**, que es inmutable; el nombre puede haber cambiado en el catálogo sin que el
 * producto lo sepa. `missing` es que el catálogo no la conoce: un producto anterior al catálogo, o
 * un catálogo que no se pudo leer entero.
 */
export function currentCategoryStatus(
  taxonomy: ProductTaxonomy,
  catalog: readonly CategoryOption[],
  /**
   * `false` si el catálogo no se pudo leer, o no entero. Entonces «no la encuentro» no significa
   * «no existe», y afirmarlo sería falso: se devuelve `null`, que es «no se sabe».
   */
  catalogComplete = true,
): CurrentCategoryStatus | null {
  const found = catalog.find((option) => option.slug === taxonomy.slug);

  if (found !== undefined) return found.status;

  return catalogComplete ? 'missing' : null;
}

/**
 * Las categorías que se pueden elegir: **solo las activas**, filtradas por nombre o slug.
 *
 * Una archivada no se ofrece nunca para una asignación nueva. El orden es el del catálogo, que ya
 * llega ordenado por nombre.
 */
export function selectableCategories(
  catalog: readonly CategoryOption[],
  query: string,
): readonly CategoryOption[] {
  const needle = foldText(query);

  return catalog.filter(
    (option) =>
      option.status === 'active' &&
      (needle === '' || foldText(option.name).includes(needle) || option.slug.includes(needle)),
  );
}

/** El nombre y el slug que representa una elección, o `null` si no hay categoría. */
export function choiceTaxonomy(choice: CategoryChoice): ProductTaxonomy | null {
  switch (choice.kind) {
    case 'none':
      return null;
    case 'catalog':
      return { slug: choice.category.slug, name: choice.category.name };
    case 'current':
      return choice.taxonomy;
  }
}

/**
 * Lo que viaja en el cuerpo del producto, con la semántica del contrato: omitir deja el campo como
 * está y `null` lo borra.
 *
 * - En el **alta** solo viaja una categoría elegida del catálogo; sin categoría, se omite.
 * - En la **edición**, la que el producto ya tenía **no se reenvía**: reenviarla podría hacer que el
 *   backend rechazara un guardado ajeno a la categoría solo porque la categoría se archivó. Elegir
 *   «Sin categoría» la borra; elegir otra del catálogo la sustituye.
 *
 * Devuelve `undefined` cuando el campo se omite.
 */
export function categoryPatch(
  choice: CategoryChoice,
  mode: 'create' | 'edit',
): ProductTaxonomy | null | undefined {
  switch (choice.kind) {
    case 'catalog':
      return { slug: choice.category.slug, name: choice.category.name };
    case 'none':
      return mode === 'edit' ? null : undefined;
    case 'current':
      return undefined;
  }
}

/** Añade al catálogo local una categoría recién creada, sin duplicarla, y conserva el orden. */
export function withCreatedCategory(
  catalog: readonly CategoryOption[],
  created: CategoryOption,
): readonly CategoryOption[] {
  const rest = catalog.filter((option) => option.id !== created.id);

  return [...rest, created].sort(
    (a, b) => a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id),
  );
}
