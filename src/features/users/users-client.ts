/**
 * Llamadas del navegador al BFF de cuentas. Nunca al backend ni a Firebase.
 *
 * La clave de idempotencia la genera quien llama y la guarda mientras la operación no tenga un
 * desenlace: así un reintento tras un corte de red —o tras `account_sync_pending`— repite la
 * **misma** operación en lugar de lanzar otra.
 */

import { send, type MutationResult } from '@/features/panel/catalog-client';
import type { AdminRole } from '@/features/session/permissions';
import type { AdminUser } from '@/lib/api/admin-users';

export function createUser(body: {
  readonly idempotencyKey: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: AdminRole;
}): Promise<MutationResult<AdminUser>> {
  return send<AdminUser>('/api/admin/users', 'POST', body, 201);
}

export function changeUserRole(
  userId: string,
  body: {
    readonly idempotencyKey: string;
    readonly expectedVersion: number;
    readonly role: AdminRole;
  },
): Promise<MutationResult<AdminUser>> {
  return send<AdminUser>(`/api/admin/users/${encodeURIComponent(userId)}/role`, 'PATCH', body, 200);
}

export type UserTransition = 'disable' | 'reactivate' | 'resend-invitation';

export function transitionUser(
  userId: string,
  transition: UserTransition,
  body: { readonly idempotencyKey: string; readonly expectedVersion: number },
): Promise<MutationResult<AdminUser>> {
  return send<AdminUser>(
    `/api/admin/users/${encodeURIComponent(userId)}/${transition}`,
    'POST',
    body,
    200,
  );
}
