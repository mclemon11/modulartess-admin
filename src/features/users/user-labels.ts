/**
 * Textos de la pantalla de cuentas: roles, estados e invitación.
 *
 * Los roles se explican con lo que **pueden hacer**, que es lo que decide quien invita. Es la
 * misma descripción que lleva el correo de invitación del backend.
 */

import type { AdminRole } from '@/features/session/permissions';
import type { AdminUser } from '@/lib/api/admin-users';

export const ROLE_EXPLANATIONS: Readonly<
  Record<AdminRole, { readonly name: string; readonly summary: string }>
> = {
  super_admin: {
    name: 'Super administrador',
    summary:
      'Acceso técnico completo: cuentas y roles, integraciones, pagos y configuración de seguridad. Es el único que crea o promueve otros super administradores.',
  },
  master_admin: {
    name: 'Administrador general',
    summary:
      'Gestión comercial completa: catálogo, pedidos, cancelaciones y reembolsos. Crea y administra cuentas de moderador, y ninguna otra.',
  },
  moderator: {
    name: 'Moderador',
    summary:
      'Operación diaria: consultar pedidos y productos, crear y editar productos y ajustar inventario. No administra cuentas, integraciones ni pagos, y no elimina contenido.',
  },
};

export type UserStatusLabel = 'Invitación pendiente' | 'Activo' | 'Deshabilitado';

export function describeUserStatus(status: AdminUser['status']): UserStatusLabel {
  switch (status) {
    case 'invited':
      return 'Invitación pendiente';
    case 'active':
      return 'Activo';
    case 'disabled':
      return 'Deshabilitado';
  }
}

/** Qué pasó con la última invitación. Solo `sent` significa que salió un correo. */
export function describeInvitation(invitation: AdminUser['invitation']): string {
  switch (invitation.state) {
    case 'sent':
      return 'Invitación enviada';
    case 'failed':
      return 'La invitación no se pudo enviar';
    case 'suppressed':
      return 'Invitación no enviada: la entrega de correo no está permitida en este despliegue';
    case 'pending':
      return 'Invitación sin enviar todavía';
  }
}

/** Fecha legible, o un guion cuando no hay dato: nunca se inventa una. */
export function formatAccountDate(value: string | null): string {
  if (value === null) return '—';

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('es-CO', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'America/Bogota',
      }).format(date);
}
