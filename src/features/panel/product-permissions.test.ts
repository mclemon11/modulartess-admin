import { describe, expect, it } from 'vitest';

import { detailPermissions, variantPermissions } from './product-permissions';

describe('permisos del detalle por rol', () => {
  it('super_admin puede todo lo que la pantalla ofrece', () => {
    expect(detailPermissions('super_admin')).toEqual({
      canCreate: true,
      canUpdate: true,
      canPublish: true,
      canArchive: true,
      canAdjustInventory: true,
    });
  });

  it('master_admin también publica y archiva', () => {
    expect(detailPermissions('master_admin')).toEqual({
      canCreate: true,
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
      canCreate: false,
      canUpdate: false,
      canPublish: false,
      canArchive: false,
      canAdjustInventory: false,
    });
  });
});

describe('permisos de variantes por rol', () => {
  it('cada acción reutiliza el permiso que exige el contrato', () => {
    // Crear variante → products.create; editar → products.update; inventario → inventory.adjust;
    // archivar → products.archive. No hay ningún permiso nuevo.
    expect(variantPermissions('super_admin')).toEqual({
      canCreate: true,
      canUpdate: true,
      canArchive: true,
      canAdjustInventory: true,
    });
    expect(variantPermissions('master_admin')).toEqual({
      canCreate: true,
      canUpdate: true,
      canArchive: true,
      canAdjustInventory: true,
    });
  });

  it('moderator crea, edita y ajusta inventario, pero NO archiva variantes', () => {
    expect(variantPermissions('moderator')).toEqual({
      canCreate: true,
      canUpdate: true,
      canArchive: false,
      canAdjustInventory: true,
    });
  });

  it('un rol desconocido no obtiene ninguna acción sobre las variantes', () => {
    expect(variantPermissions('rol-inventado')).toEqual({
      canCreate: false,
      canUpdate: false,
      canArchive: false,
      canAdjustInventory: false,
    });
  });
});
