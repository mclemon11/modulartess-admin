import { describe, expect, it } from 'vitest';

import { can } from '@/features/session/permissions';

import { accountActions, assignableRoles, canManageRole } from './user-permissions';
import { describeUserFailure, keepsKey, offersReload } from './users-errors';
import { parseChangeRole, parseCreateUser, parseUserTransition } from './user-input';

/**
 * Qué muestra la pantalla de cuentas a cada rol (ADR 0007 y 0019 del backend).
 *
 * Es usabilidad: el backend decide igual, y rechaza una petición fabricada a mano.
 */
describe('matriz de cuentas por rol', () => {
  it('super_admin administra los tres roles', () => {
    expect(assignableRoles('super_admin')).toEqual(['super_admin', 'master_admin', 'moderator']);
    expect(can('super_admin', 'admin_users.read')).toBe(true);
  });

  it('master_admin solo administra moderator', () => {
    expect(assignableRoles('master_admin')).toEqual(['moderator']);
    expect(canManageRole('master_admin', 'master_admin')).toBe(false);
    expect(canManageRole('master_admin', 'super_admin')).toBe(false);
    expect(can('master_admin', 'admin_users.read')).toBe(true);
  });

  it('moderator no ve ni administra cuentas', () => {
    expect(assignableRoles('moderator')).toEqual([]);
    expect(can('moderator', 'admin_users.read')).toBe(false);
  });

  it('un rol desconocido no administra nada', () => {
    expect(assignableRoles('root')).toEqual([]);
  });
});

describe('acciones sobre una cuenta', () => {
  const moderator = { role: 'moderator', status: 'active' } as const;
  const invitedModerator = { role: 'moderator', status: 'invited' } as const;
  const disabledModerator = { role: 'moderator', status: 'disabled' } as const;
  const master = { role: 'master_admin', status: 'active' } as const;
  const superAdmin = { role: 'super_admin', status: 'active' } as const;

  it('nunca sobre la propia cuenta', () => {
    expect(accountActions('super_admin', superAdmin, true)).toEqual({
      changeRole: false,
      disable: false,
      reactivate: false,
      resendInvitation: false,
    });
  });

  it('master_admin deshabilita un moderator, pero no le cambia el rol', () => {
    expect(accountActions('master_admin', moderator, false)).toEqual({
      changeRole: false,
      disable: true,
      reactivate: false,
      resendInvitation: false,
    });
  });

  it('master_admin no toca a otro master_admin ni a un super_admin', () => {
    for (const target of [master, superAdmin]) {
      expect(Object.values(accountActions('master_admin', target, false))).not.toContain(true);
    }
  });

  it('reenviar solo con la invitación pendiente; reactivar solo si está deshabilitada', () => {
    expect(accountActions('master_admin', invitedModerator, false).resendInvitation).toBe(true);
    expect(accountActions('master_admin', moderator, false).resendInvitation).toBe(false);
    expect(accountActions('master_admin', disabledModerator, false)).toMatchObject({
      reactivate: true,
      disable: false,
    });
  });

  it('super_admin cambia el rol de otra cuenta', () => {
    expect(accountActions('super_admin', master, false).changeRole).toBe(true);
  });

  it('moderator no tiene ninguna acción', () => {
    expect(Object.values(accountActions('moderator', invitedModerator, false))).not.toContain(true);
  });
});

describe('cuerpos cerrados del BFF', () => {
  const KEY = 'c8a2b1f0-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

  it('acepta exactamente correo, nombre, rol y clave', () => {
    expect(
      parseCreateUser({
        idempotencyKey: KEY,
        email: ' ana@example.invalid ',
        displayName: ' Ana ',
        role: 'moderator',
      }),
    ).toEqual({
      idempotencyKey: KEY,
      email: 'ana@example.invalid',
      displayName: 'Ana',
      role: 'moderator',
    });
  });

  it.each(['password', 'uid', 'claims', 'disabled', 'emailVerified', 'extra'])(
    'rechaza la clave %s',
    (field) => {
      expect(
        parseCreateUser({
          idempotencyKey: KEY,
          email: 'ana@example.invalid',
          displayName: 'Ana',
          role: 'moderator',
          [field]: 'x',
        }),
      ).toBeNull();
    },
  );

  it('rechaza una clave con espacios o demasiado corta', () => {
    expect(parseUserTransition({ idempotencyKey: 'corta', expectedVersion: 1 })).toBeNull();
    expect(
      parseUserTransition({ idempotencyKey: 'con espacios 123', expectedVersion: 1 }),
    ).toBeNull();
  });

  it('exige una versión entera positiva', () => {
    expect(
      parseChangeRole({ idempotencyKey: KEY, expectedVersion: 0, role: 'moderator' }),
    ).toBeNull();
    expect(
      parseChangeRole({ idempotencyKey: KEY, expectedVersion: 1.5, role: 'moderator' }),
    ).toBeNull();
  });
});

describe('fallos', () => {
  it('conserva la clave solo si el desenlace es incierto', () => {
    expect(keepsKey('account_sync_pending')).toBe(true);
    expect(keepsKey('service_unavailable')).toBe(true);
    expect(keepsKey('version_conflict')).toBe(false);
    expect(keepsKey('last_super_admin')).toBe(false);
  });

  it('ofrece recargar ante un conflicto de versión', () => {
    expect(offersReload('version_conflict')).toBe(true);
    expect(offersReload('last_super_admin')).toBe(false);
  });

  it('cada código conocido tiene su texto y uno desconocido no promete nada', () => {
    expect(describeUserFailure('last_super_admin')).toContain('al menos un super administrador');
    expect(describeUserFailure('account_self_change')).toContain('propia cuenta');
    expect(describeUserFailure('algo_nuevo')).toContain('No se aplicó nada');
  });
});
