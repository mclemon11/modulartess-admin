import { describe, expect, it } from 'vitest';

import { detailPermissions } from './product-permissions';

describe('permisos del detalle por rol', () => {
  it('super_admin puede todo lo que la pantalla ofrece', () => {
    expect(detailPermissions('super_admin')).toEqual({
      canUpdate: true,
      canPublish: true,
      canArchive: true,
      canAdjustInventory: true,
    });
  });

  it('master_admin también publica y archiva', () => {
    expect(detailPermissions('master_admin')).toEqual({
      canUpdate: true,
      canPublish: true,
      canArchive: true,
      canAdjustInventory: true,
    });
  });

  it('moderator gestiona imágenes e inventario pero NO ve archivar', () => {
    const permissions = detailPermissions('moderator');

    // Sube, edita el texto alternativo, reordena y elige principal…
    expect(permissions.canUpdate).toBe(true);
    expect(permissions.canAdjustInventory).toBe(true);
    // …pero archivar es una transición de estado, y no la tiene.
    expect(permissions.canArchive).toBe(false);
    expect(permissions.canPublish).toBe(false);
  });

  it('un rol desconocido no obtiene ninguna acción', () => {
    expect(detailPermissions('rol-inventado')).toEqual({
      canUpdate: false,
      canPublish: false,
      canArchive: false,
      canAdjustInventory: false,
    });
  });
});
