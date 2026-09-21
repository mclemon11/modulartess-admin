import { describe, expect, it } from 'vitest';

import { ADMIN_ROLES, can, isAdminRole, permissionsFor, PERMISSIONS } from './permissions';

/** Lo que la fase decide: qué ve y qué no ve cada rol en el catálogo y en los pedidos. */
const EXPECTED: Readonly<Record<string, readonly string[]>> = {
  super_admin: [...PERMISSIONS],
  // Todo lo del catálogo y los pedidos, menos el simulador de pagos: el contrato lo reserva a
  // `super_admin`, y una escala «master_admin ≥ moderator» habría arrastrado ese permiso con ella.
  // Todo menos el simulador de pagos y la gestión de integraciones: las dos las reserva el
  // contrato a `super_admin`, y una escala «master_admin ≥ moderator» las habría arrastrado.
  master_admin: [...PERMISSIONS].filter(
    (permission) => permission !== 'payments.simulate' && permission !== 'integrations.manage',
  ),
  moderator: [
    'dashboard.read',
    // Mueve el trabajo del día del pedido, pero no lo cancela: cancelar es irreversible.
    'orders.read',
    'orders.update_status',
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

  /*
   * El simulador de pago decide el desenlace del dinero en staging. El contrato lo reserva a
   * `super_admin`, y el panel no lo deduce de `orders.update_status`.
   */
  it('solo super_admin puede simular un resultado de pago', () => {
    expect(can('super_admin', 'payments.simulate')).toBe(true);
    expect(can('master_admin', 'payments.simulate')).toBe(false);
    expect(can('moderator', 'payments.simulate')).toBe(false);
  });

  /*
   * Leer el estado de una integración es operación; editar sus credenciales o cerrar una
   * incidencia, no. El backend exige lo mismo, y el panel no puede ser más permisivo.
   */
  it('separa leer una integración de administrarla', () => {
    expect(can('super_admin', 'integrations.read')).toBe(true);
    expect(can('master_admin', 'integrations.read')).toBe(true);
    expect(can('moderator', 'integrations.read')).toBe(false);

    expect(can('super_admin', 'integrations.manage')).toBe(true);
    expect(can('master_admin', 'integrations.manage')).toBe(false);
    expect(can('moderator', 'integrations.manage')).toBe(false);
  });

  /* Cancelar un pedido es irreversible: solo lo tienen los dos roles que ya archivan catálogo. */
  it('solo super_admin y master_admin pueden cancelar pedidos', () => {
    expect(can('super_admin', 'orders.cancel')).toBe(true);
    expect(can('master_admin', 'orders.cancel')).toBe(true);
    expect(can('moderator', 'orders.cancel')).toBe(false);
  });

  it('los tres roles consultan pedidos y mueven su estado', () => {
    for (const role of ADMIN_ROLES) {
      expect(can(role, 'orders.read'), role).toBe(true);
      expect(can(role, 'orders.update_status'), role).toBe(true);
    }
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
