/**
 * Qué cuentas puede administrar un rol, para decidir **qué se muestra**.
 *
 * Tabla literal, sin comparar roles: `super_admin` administra a todos porque tiene los tres
 * permisos, no por estar «por encima». La autoridad sigue siendo el backend, que además decide
 * dentro de su transacción sobre el rol actual de la cuenta.
 */

import { ADMIN_ROLES, can, type AdminRole, type Permission } from '@/features/session/permissions';

const MANAGE: Readonly<Record<AdminRole, Permission>> = {
  super_admin: 'admin_users.manage_super_admins',
  master_admin: 'admin_users.manage_masters',
  moderator: 'admin_users.manage_moderators',
};

export function canManageRole(viewerRole: string, targetRole: AdminRole): boolean {
  return can(viewerRole, MANAGE[targetRole]);
}

/** Roles que este rol puede asignar al invitar o al cambiar un rol. */
export function assignableRoles(viewerRole: string): readonly AdminRole[] {
  return ADMIN_ROLES.filter((role) => canManageRole(viewerRole, role));
}

/** Acciones visibles sobre una cuenta concreta. Nunca sobre la propia. */
export type AccountActions = {
  readonly changeRole: boolean;
  readonly disable: boolean;
  readonly reactivate: boolean;
  readonly resendInvitation: boolean;
};

export function accountActions(
  viewerRole: string,
  account: { readonly role: AdminRole; readonly status: 'invited' | 'active' | 'disabled' },
  isSelf: boolean,
): AccountActions {
  const manage = !isSelf && canManageRole(viewerRole, account.role);

  return {
    // Cambiar a otro rol exige poder asignar al menos uno distinto del actual.
    changeRole:
      manage &&
      account.status !== 'disabled' &&
      assignableRoles(viewerRole).some((role) => role !== account.role),
    disable: manage && account.status !== 'disabled',
    reactivate: manage && account.status === 'disabled',
    resendInvitation: manage && account.status === 'invited',
  };
}
