import { describe, expect, it } from 'vitest';

import type { AdminProduct } from '@/lib/api/catalog';

import {
  canPublishNow,
  detailPermissions,
  imagePermissions,
  variantPermissions,
} from './product-permissions';

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

describe('acciones sobre imágenes', () => {
  it('moderator edita imágenes pero NO puede archivarlas', () => {
    // Editar el texto alternativo, reordenar y designar principal son ediciones; archivar es una
    // transición de estado, y ese permiso no lo tiene.
    expect(imagePermissions('moderator')).toEqual({ canEdit: true, canArchive: false });
  });

  it.each(['super_admin', 'master_admin'])('%s sí archiva imágenes', (role) => {
    expect(imagePermissions(role)).toEqual({ canEdit: true, canArchive: true });
  });

  it('un rol desconocido no toca las imágenes', () => {
    expect(imagePermissions('rol-inventado')).toEqual({ canEdit: false, canArchive: false });
  });
});

function product(
  status: AdminProduct['status'],
  ready: boolean,
): Pick<AdminProduct, 'status' | 'publicationReadiness'> {
  return {
    status,
    publicationReadiness: { ready, missing: ready ? [] : ['description'] },
  };
}

describe('habilitación de publicar', () => {
  it('con permiso y ready=true se puede publicar un borrador', () => {
    expect(canPublishNow({ canPublish: true }, product('draft', true))).toBe(true);
  });

  it('ready=false bloquea la acción aunque el rol la tenga', () => {
    expect(canPublishNow({ canPublish: true }, product('draft', false))).toBe(false);
  });

  it('sin permiso no se publica, esté listo o no', () => {
    expect(canPublishNow({ canPublish: false }, product('draft', true))).toBe(false);
    expect(canPublishNow({ canPublish: false }, product('draft', false))).toBe(false);
  });

  it('un producto ya publicado no se vuelve a publicar', () => {
    expect(canPublishNow({ canPublish: true }, product('active', true))).toBe(false);
  });

  it('un archivado listo no se bloquea aquí: esa regla es del backend', () => {
    // El contrato no dice que un archivado no pueda volver a publicarse, así que el panel no se
    // inventa la prohibición. Lo único que bloquea es lo que sí publica: permiso y preparación.
    expect(canPublishNow({ canPublish: true }, product('archived', true))).toBe(true);
  });
});
