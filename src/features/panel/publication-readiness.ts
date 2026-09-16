/**
 * Preparación para publicar, tal y como la evalúa el backend.
 *
 * `AdminProductDto.publicationReadiness` llega calculado desde el registro autoritativo —variantes
 * e inventario incluidos— y la propia operación de publicar consume **esa misma** evaluación. Por
 * eso el panel no vuelve a derivar ninguna regla: solo traduce los códigos que recibe. Recalcularlas
 * aquí garantizaría que un día el botón diga «listo» y el backend responda `400`.
 *
 * Las imágenes **no** son un requisito: el contrato ya no publica `primary_image` ni `gallery`, así
 * que un producto sin ninguna imagen se puede publicar. Subirlas, editarlas, reordenarlas, elegir la
 * principal y archivarlas sigue siendo posible en cualquier momento, solo que nunca bloquea.
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
 * `imagenes` sigue aquí porque es el ancla de la sección de imágenes de la ficha y del alta, aunque
 * hoy ningún requisito lleve a ella.
 */
export type ProductSection =
  'basica' | 'imagenes' | 'precio' | 'inventario' | 'contenido' | 'variantes';

export const SECTION_IDS: Readonly<Record<ProductSection, string>> = {
  basica: 'seccion-basica',
  imagenes: 'seccion-imagenes',
  precio: 'seccion-precio',
  inventario: 'seccion-inventario',
  contenido: 'seccion-contenido',
  variantes: 'seccion-variantes',
};

export const SECTION_LABELS: Readonly<Record<ProductSection, string>> = {
  basica: 'Información básica',
  imagenes: 'Imágenes',
  precio: 'Precio',
  inventario: 'Inventario',
  contenido: 'Características y especificaciones',
  variantes: 'Variantes',
};

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
    hint: 'Acompaña al producto en los listados de la tienda.',
    section: 'basica',
  },
  description: {
    title: 'Falta la descripción',
    hint: 'Es el texto principal de la ficha.',
    section: 'basica',
  },
  category: {
    title: 'Falta la categoría',
    hint: 'Escribe su nombre y su slug. Todavía no hay un catálogo de categorías del que elegir.',
    section: 'basica',
  },
  product_type: {
    title: 'Falta el tipo de producto',
    hint: 'Escribe su nombre y su slug, igual que la categoría.',
    section: 'basica',
  },
  features: {
    title: 'Faltan las características',
    hint: 'Una por línea, en «Características y especificaciones».',
    section: 'contenido',
  },
  materials: {
    title: 'Faltan los materiales',
    hint: 'Se muestran en la ficha, dentro de las especificaciones.',
    section: 'contenido',
  },
  measurements: {
    title: 'Faltan las medidas',
    hint: 'Se muestran en la ficha, dentro de las especificaciones.',
    section: 'contenido',
  },
  warranty: {
    title: 'Falta la garantía',
    hint: 'Se muestra en la ficha, dentro de las especificaciones.',
    section: 'contenido',
  },
  care: {
    title: 'Faltan los cuidados',
    hint: 'Se muestran en la ficha, dentro de las especificaciones.',
    section: 'contenido',
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
  const order: readonly ProductSection[] = [
    'basica',
    'imagenes',
    'precio',
    'inventario',
    'contenido',
    'variantes',
  ];

  return order
    .map((section) => ({
      section,
      items: readiness.missing
        .map((requirement) => describeRequirement(requirement))
        .filter((copy) => copy.section === section),
    }))
    .filter((group) => group.items.length > 0);
}
