/**
 * Proyecciones que el BFF de envíos entrega al navegador.
 *
 * Son **recortes** de DTOs del contrato —nunca campos nuevos—: solo lo que necesita cada selector,
 * para no mandar al navegador el producto entero con su inventario, sus imágenes y su auditoría
 * cuando lo único que hace falta es su nombre, su estado y sus variantes.
 *
 * Módulo puro.
 */

import type { AdminProduct } from '@/lib/api/catalog';
import type { ShippingRule, ShippingZone } from '@/lib/api/shipping';

export type PickerVariant = {
  readonly id: string;
  readonly sku: string;
  /** Las etiquetas de sus atributos, tal como las ve el comprador: «Roble natural · 180 cm». */
  readonly label: string;
};

export type PickerProduct = {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly status: AdminProduct['status'];
  readonly categorySlug: string | null;
  readonly categoryName: string | null;
  /** Solo las variantes activas: una archivada no se puede cotizar. */
  readonly variants: readonly PickerVariant[];
};

export type PickerProductPage = {
  readonly items: readonly PickerProduct[];
  readonly nextPageToken: string | null;
};

export function toPickerProduct(product: AdminProduct): PickerProduct {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    status: product.status,
    categorySlug: product.category === null ? null : product.category.slug,
    categoryName: product.category === null ? null : product.category.name,
    variants: product.variants
      .filter((variant) => variant.status === 'active')
      .map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        label: variant.attributes.map((attribute) => attribute.label).join(' · ') || variant.sku,
      })),
  };
}

/** Una zona con sus reglas, para elegir en qué regla asignar productos. */
export type ShippingZoneWithRules = {
  readonly zone: ShippingZone;
  readonly rules: readonly ShippingRule[];
};

/** Una página de zonas asignables, con el cursor del backend. */
export type AssignableZonePage = {
  readonly items: readonly ShippingZoneWithRules[];
  readonly nextPageToken: string | null;
};
