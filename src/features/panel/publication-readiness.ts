/**
 * Preparación para publicar, tal y como la evalúa el backend.
 *
 * `AdminProductDto.publicationReadiness` llega calculado desde el registro autoritativo —variantes
 * e inventario incluidos— y la propia operación de publicar consume **esa misma** evaluación. Por
 * eso el panel no vuelve a derivar ninguna regla: solo traduce los códigos que recibe. Recalcularlas
 * aquí garantizaría que un día el botón diga «listo» y el backend responda `400`.
 *
 * Casi todo el contenido editorial **no** es un requisito. El contrato ya no publica
 * `primary_image` ni `gallery`, y retiró además `description`, `features`, `materials`,
 * `measurements`, `warranty` y `care`: de lo editorial solo `short_description` bloquea. Rellenar
 * cualquiera de los demás sigue siendo posible en todo momento, solo que nunca impide publicar.
 *
 * La traducción es **exhaustiva por construcción**: el mapa está tipado como
 * `Record<PublicationRequirement, …>`, así que si el contrato añade un código el proyecto deja de
 * compilar hasta que alguien escriba su texto. Un requisito sin traducir se mostraría como un
 * identificador en inglés en mitad de la pantalla.
 *
 * Módulo puro.
 */

import type { PublicationReadiness } from '@/lib/api/catalog';

/** Cada código que publica el contrato. Sale del tipo generado, no de una copia a mano. */
export type PublicationRequirement = PublicationReadiness['missing'][number];

/**
 * Secciones de la pantalla a las que lleva cada requisito pendiente.
 *
 * Son las mismas en el alta y en la ficha, y en el mismo orden, para que el checklist enlace
 * siempre a algo que existe en la pantalla que se está mirando. `imagenes` y `detalles` siguen
 * aquí porque son anclas reales del formulario, aunque hoy ningún requisito lleve a ellas: el
 * contrato dejó de exigir imágenes, descripción detallada, características y especificaciones.
 */
export type ProductSection =
  | 'basica'
  | 'clasificacion'
  | 'contenido'
  | 'detalles'
  | 'imagenes'
  | 'precio'
  | 'inventario'
  | 'variantes';

export const SECTION_IDS: Readonly<Record<ProductSection, string>> = {
  basica: 'seccion-basica',
  clasificacion: 'seccion-clasificacion',
  contenido: 'seccion-contenido',
  detalles: 'seccion-detalles',
  imagenes: 'seccion-imagenes',
  precio: 'seccion-precio',
  inventario: 'seccion-inventario',
  variantes: 'seccion-variantes',
};

export const SECTION_LABELS: Readonly<Record<ProductSection, string>> = {
  basica: 'Información básica',
  clasificacion: 'Clasificación',
  contenido: 'Contenido visible',
  detalles: 'Detalles adicionales',
  imagenes: 'Imágenes',
  precio: 'Precio',
  inventario: 'Inventario',
  variantes: 'Variantes',
};

/**
 * Orden en el que las secciones aparecen en pantalla. El checklist lo respeta.
 *
 * Es el de la ficha; el alta reparte Información e Imágenes en dos columnas cuando hay sitio, pero
 * el resto va igual. Recorrer los pendientes en este orden significa bajar por el formulario sin
 * volver atrás.
 */
export const SECTION_ORDER: readonly ProductSection[] = [
  'basica',
  'clasificacion',
  'contenido',
  'detalles',
  'imagenes',
  'precio',
  'inventario',
  'variantes',
];

export type RequirementCopy = {
  /** Qué falta, en una línea. */
  readonly title: string;
  /** Qué hay que hacer para resolverlo. */
  readonly hint: string;
  /** Sección de esta misma pantalla donde se resuelve. */
  readonly section: ProductSection;
};

const REQUIREMENTS: Readonly<Record<PublicationRequirement, RequirementCopy>> = {
  name: {
    title: 'Falta el nombre',
    hint: 'Es lo primero que se lee en la tienda.',
    section: 'basica',
  },
  sku: {
    title: 'Falta el SKU',
    hint: 'Se fija al crear el producto y no se puede cambiar después.',
    section: 'basica',
  },
  slug: {
    title: 'Falta el slug',
    hint: 'Es la dirección pública del producto. También es inmutable.',
    section: 'basica',
  },
  short_description: {
    title: 'Falta la descripción corta',
    hint: 'Es el único texto que la publicación exige: acompaña al precio en la ficha y en los listados.',
    section: 'basica',
  },
  category: {
    title: 'Falta la categoría',
    hint: 'Escribe su nombre y su slug. Todavía no hay un catálogo de categorías del que elegir.',
    section: 'clasificacion',
  },
  product_type: {
    title: 'Falta el tipo de producto',
    hint: 'Escribe su nombre y su slug, igual que la categoría.',
    section: 'clasificacion',
  },
  sellable_option: {
    title: 'No hay nada que vender',
    hint: 'Necesita inventario propio o al menos una variante activa.',
    section: 'variantes',
  },
  positive_price: {
    title: 'El precio tiene que ser mayor que cero',
    hint: 'En pesos enteros, sin centavos.',
    section: 'precio',
  },
  unique_variant_combinations: {
    title: 'Hay combinaciones de variante repetidas',
    hint: 'Dos variantes activas no pueden compartir la misma combinación de ejes.',
    section: 'variantes',
  },
};

/**
 * Campos que el contrato publica como opcionales y que, por tanto, **nunca** aparecen arriba.
 *
 * El backend retiró `description`, `features`, `materials`, `measurements`, `warranty` y `care` de
 * `missing`: vacíos no bloquean la publicación. El panel lo dice en voz alta en lugar de dejar que
 * parezca un olvido, y no vuelve a evaluarlo por su cuenta.
 */
export const OPTIONAL_CONTENT_NOTE =
  'La descripción detallada, las características y los detalles adicionales son opcionales: ' +
  'vacíos no aparecen aquí y no impiden publicar.';

/** Texto de un requisito. Un código que el contrato aún no publicaba se muestra tal cual. */
export function describeRequirement(requirement: string): RequirementCopy {
  return (
    REQUIREMENTS[requirement as PublicationRequirement] ?? {
      title: requirement,
      hint: 'El backend pide este requisito. Actualiza el panel para describirlo.',
      section: 'basica',
    }
  );
}

/** Resumen de una línea para cabeceras, listados y badges. */
export function describeReadiness(readiness: PublicationReadiness): string {
  if (readiness.ready) {
    return 'Listo para publicar';
  }

  const count = readiness.missing.length;

  return count === 1 ? 'Falta 1 requisito' : `Faltan ${count} requisitos`;
}

/** Requisitos pendientes agrupados por sección, en el orden en el que aparecen en pantalla. */
export function groupBySection(
  readiness: PublicationReadiness,
): readonly { readonly section: ProductSection; readonly items: readonly RequirementCopy[] }[] {
  return SECTION_ORDER.map((section) => ({
    section,
    items: readiness.missing
      .map((requirement) => describeRequirement(requirement))
      .filter((copy) => copy.section === section),
  })).filter((group) => group.items.length > 0);
}
