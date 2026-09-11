/**
 * Permisos de la pantalla de detalle, derivados del rol.
 *
 * Se extrae de la página para poder comprobarlo sin renderizar: es la función que decide si
 * `moderator` ve «Archivar», y esa decisión merece una prueba propia.
 *
 * Solo decide **qué se muestra**. La autoridad sigue siendo el backend, que rechaza cualquier
 * petición que el rol no permita aunque llegue fabricada a mano.
 */

import { can } from '@/features/session/permissions';

export type DetailPermissions = {
  readonly canUpdate: boolean;
  readonly canPublish: boolean;
  readonly canArchive: boolean;
  readonly canAdjustInventory: boolean;
};

export function detailPermissions(role: string): DetailPermissions {
  return {
    canUpdate: can(role, 'products.update'),
    canPublish: can(role, 'products.publish'),
    // Archivar —el producto y sus imágenes— es una transición de estado, no una edición.
    canArchive: can(role, 'products.archive'),
    canAdjustInventory: can(role, 'inventory.adjust'),
  };
}
