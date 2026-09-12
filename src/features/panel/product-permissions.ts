/**
 * Permisos de la pantalla de detalle, derivados del rol.
 *
 * Se extrae de la página para poder comprobarlo sin renderizar: es la función que decide si
 * `moderator` ve «Archivar», y esa decisión merece una prueba propia.
 *
 * Solo decide **qué se muestra**. La autoridad sigue siendo el backend, que rechaza cualquier
 * petición que el rol no permita aunque llegue fabricada a mano.
 */

import type { AdminProduct } from '@/lib/api/catalog';

import { can } from '@/features/session/permissions';

export type DetailPermissions = {
  readonly canCreate: boolean;
  readonly canUpdate: boolean;
  readonly canPublish: boolean;
  readonly canArchive: boolean;
  readonly canAdjustInventory: boolean;
};

export function detailPermissions(role: string): DetailPermissions {
  return {
    // Crear una variante cuenta como crear catálogo, igual que crear un producto.
    canCreate: can(role, 'products.create'),
    canUpdate: can(role, 'products.update'),
    canPublish: can(role, 'products.publish'),
    // Archivar —el producto, sus imágenes y sus variantes— es una transición de estado, no una
    // edición.
    canArchive: can(role, 'products.archive'),
    canAdjustInventory: can(role, 'inventory.adjust'),
  };
}

/**
 * Permisos de la sección de variantes.
 *
 * Cada acción reutiliza el permiso que exige el contrato, sin inventar uno nuevo:
 *
 *   - crear variante → `products.create`;
 *   - editar atributos o precio → `products.update`;
 *   - ajustar inventario → `inventory.adjust`;
 *   - archivar variante → `products.archive`, que `moderator` no tiene.
 */
export type VariantPermissions = {
  readonly canCreate: boolean;
  readonly canUpdate: boolean;
  readonly canArchive: boolean;
  readonly canAdjustInventory: boolean;
};

export function variantPermissions(role: string): VariantPermissions {
  return {
    canCreate: can(role, 'products.create'),
    canUpdate: can(role, 'products.update'),
    canArchive: can(role, 'products.archive'),
    canAdjustInventory: can(role, 'inventory.adjust'),
  };
}

/**
 * Permisos del gestor de imágenes.
 *
 * Editar el texto alternativo, reordenar y designar principal son ediciones (`products.update`);
 * archivar es una transición de estado (`products.archive`). `moderator` tiene lo primero y no lo
 * segundo, así que no puede ir en un único permiso.
 */
export type ImagePermissions = {
  readonly canEdit: boolean;
  readonly canArchive: boolean;
};

export function imagePermissions(role: string): ImagePermissions {
  return {
    canEdit: can(role, 'products.update'),
    canArchive: can(role, 'products.archive'),
  };
}

/**
 * ¿Se puede publicar este producto ahora mismo?
 *
 * Tres condiciones, y ninguna se deduce: el permiso sale de la matriz de roles, el estado y
 * `publicationReadiness` salen del backend. El panel **no** evalúa las reglas de publicación; si lo
 * hiciera, tarde o temprano diría «listo» sobre algo que el backend rechaza.
 */
export function canPublishNow(
  permissions: { readonly canPublish: boolean },
  product: Pick<AdminProduct, 'status' | 'publicationReadiness'>,
): boolean {
  return (
    permissions.canPublish && product.status !== 'active' && product.publicationReadiness.ready
  );
}
