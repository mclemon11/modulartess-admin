import { describe, expect, it } from 'vitest';

import { ADMIN_ROLES, can, isAdminRole, permissionsFor, PERMISSIONS } from './permissions';

/** Lo que la fase decide: qué ve y qué no ve cada rol en el catálogo. */
const EXPECTED: Readonly<Record<string, readonly string[]>> = {
  super_admin: [...PERMISSIONS],
  master_admin: [...PERMISSIONS],
  moderator: [
    'dashboard.read',
    'products.read',
    'products.create',
    'products.update',
    'inventory.read',
    'inventory.adjust',
  ],
};

describe('matriz de permisos', () => {
  it.each(ADMIN_ROLES)('%s tiene exactamente los permisos acordados', (role) => {
    expect([...permissionsFor(role)].sort()).toEqual([...(EXPECTED[role] ?? [])].sort());
  });

  it('super_admin conserva todos los permisos publicados', () => {
    for (const permission of PERMISSIONS) {
      expect(can('super_admin', permission), permission).toBe(true);
    }
  });

  it('master_admin puede publicar y archivar', () => {
    expect(can('master_admin', 'products.publish')).toBe(true);
    expect(can('master_admin', 'products.archive')).toBe(true);
  });

  it('moderator no ve acciones de publicación ni archivado', () => {
    expect(can('moderator', 'products.publish')).toBe(false);
    expect(can('moderator', 'products.archive')).toBe(false);
  });

  it('moderator sí puede consultar, crear, editar y ajustar inventario', () => {
    for (const permission of [
      'products.read',
      'products.create',
      'products.update',
      'inventory.adjust',
    ] as const) {
      expect(can('moderator', permission), permission).toBe(true);
    }
  });
});

describe('roles desconocidos', () => {
  it.each(['', 'SUPER_ADMIN', 'superadmin', 'admin', 'owner'])('%o no es un rol', (value) => {
    expect(isAdminRole(value)).toBe(false);
  });

  it('un rol desconocido no obtiene ningún permiso', () => {
    for (const permission of PERMISSIONS) {
      expect(can('rol-inventado', permission), permission).toBe(false);
    }

    expect(permissionsFor('rol-inventado')).toEqual([]);
  });
});
