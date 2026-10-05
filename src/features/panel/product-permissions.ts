/**
 * Permisos de la pantalla de detalle, derivados del rol.
 *
 * Se extrae de la página para poder comprobarlo sin renderizar: es la función que decide si
 * `moderator` ve cada acción, y esa decisión merece una prueba propia.
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
    // Este permiso solo controla el producto. Imágenes y variantes deciden el suyo por separado.
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
 * Subir, editar, reordenar, designar principal y retirar una foto son ediciones de la galería
 * (`products.update`). Esto permite corregir una carga equivocada sin conceder el permiso más
 * amplio de archivar productos o variantes.
 */
export type ImagePermissions = {
  readonly canEdit: boolean;
  readonly canArchive: boolean;
};

export function imagePermissions(role: string): ImagePermissions {
  return {
    canEdit: can(role, 'products.update'),
    canArchive: can(role, 'products.update'),
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
