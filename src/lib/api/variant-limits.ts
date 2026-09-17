/**
 * Límites del catálogo enriquecido y de las variantes, tal y como los publica el contrato.
 *
 * Viven aparte de `./catalog` por el mismo motivo que `./image-limits`: ese módulo es
 * `server-only`, y estos números los necesita también el formulario del navegador para avisar
 * antes de gastar una llamada. Importarlos desde `catalog` arrastraría el cliente del backend
 * —y con él `google-auth-library`— al bundle cliente.
 *
 * Cada constante apunta al sitio exacto del contrato del que sale. El backend sigue siendo la
 * autoridad: esto solo evita enviar lo que ya se sabe que va a rechazar.
 *
 * Módulo puro: solo datos del contrato.
 */

/** `AdminProductDto.variants`: «At most 72 active ones». */
export const VARIANT_MAX_ACTIVE = 72;

/** `AdminProductDto.attributes.maxItems`. */
export const ATTRIBUTE_MAX_AXES = 6;

/** `ProductVariantAttributeDto.value.maxLength`. */
export const ATTRIBUTE_VALUE_MAX_LENGTH = 60;

/** `ProductTaxonomyDto.slug.maxLength`. */
export const TAXONOMY_SLUG_MAX_LENGTH = 60;

/** `UpdateProductRequestDto.features.maxItems`. */
export const FEATURES_MAX_ITEMS = 5;

/** `UpdateProductRequestDto.features.items.maxLength`. */
export const FEATURE_MAX_LENGTH = 60;

/** `CreateProductRequestDto.shortDescription.maxLength`, igual en el `PATCH`. */
export const SHORT_DESCRIPTION_MAX_LENGTH = 180;

/** `CreateProductRequestDto.description.maxLength`, igual en el `PATCH`. */
export const DESCRIPTION_MAX_LENGTH = 3000;

/** `ProductSpecificationsDto.*.maxLength`, igual en los cuatro campos. */
export const SPECIFICATION_MAX_LENGTH = 2000;

/**
 * Clave de un eje de variación.
 *
 * El contrato la describe como «Lowercase identifier» y da `finish` como ejemplo, sin publicar un
 * enum: los ejes son extensibles y el panel no los cierra. Esta forma —minúsculas, dígitos y
 * guiones— es la más estrecha que admite los ejemplos del contrato.
 */
export const ATTRIBUTE_KEY_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;

/**
 * Valor normalizado de un eje: «Stable, accent-folded value. This is what the public filter
 * takes.» El ejemplo del contrato es `roble-natural`, y `size` usa valores como `80`.
 */
export const ATTRIBUTE_VALUE_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Slug de categoría o tipo de producto: kebab-case, como el resto de slugs del contrato. */
export const TAXONOMY_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Ejes que el catálogo ya usa y que el panel ofrece como atajo.
 *
 * **No son un enum.** El contrato no cierra la lista y el editor deja escribir cualquier otra
 * clave: esto solo ahorra teclear las tres que hoy existen en la tienda.
 */
export const SUGGESTED_AXES: readonly { readonly key: string; readonly label: string }[] = [
  { key: 'finish', label: 'Acabado' },
  { key: 'size', label: 'Medida' },
  { key: 'mirror', label: 'Espejo' },
];
