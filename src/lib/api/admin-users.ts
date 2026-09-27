import 'server-only';

/**
 * Administración de cuentas administrativas contra el backend. **Solo servidor.**
 *
 * La autoridad es el backend (ADR 0019 del backend): decide permisos, invariantes, auditoría y el
 * envío de la invitación. Este módulo solo transporta: la sesión de la persona en
 * `x-modulartess-admin-session`, la `Idempotency-Key` en su encabezado, y los cuerpos cerrados que
 * publica el contrato.
 *
 * El panel no usa ningún SDK de administración de Firebase para esto, ni el cliente de Firebase, y ninguna respuesta
 * lleva una contraseña, un token, claims ni el enlace de la invitación: no están en el contrato.
 */

import { backendClient } from './backend-client';
import { accountFailure, BackendFailure } from './errors';
import type { components } from './generated/schema';
import { ADMIN_SESSION_HEADER } from './session-material';

export type AdminUser = components['schemas']['AdminUserDto'];
export type AdminUserPage = components['schemas']['AdminUserPageDto'];
export type CreateAdminUserRequest = components['schemas']['CreateAdminUserDto'];
export type AdminUserRole = AdminUser['role'];

function sessionHeaders(sessionMaterial: string): Record<string, string> {
  return { [ADMIN_SESSION_HEADER]: sessionMaterial };
}

function toFailure(error: unknown): BackendFailure {
  return error instanceof BackendFailure ? error : new BackendFailure('backend_unavailable');
}

export async function listAdminUsers(
  sessionMaterial: string,
  options: { readonly pageToken?: string } = {},
): Promise<AdminUserPage> {
  const query: { pageToken?: string } = {};

  if (options.pageToken !== undefined && options.pageToken !== '') {
    query.pageToken = options.pageToken;
  }

  let response;

  try {
    response = await backendClient().GET('/v1/admin/users', {
      params: { query },
      headers: sessionHeaders(sessionMaterial),
    });
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw accountFailure(response.response.status, response.error);
  }

  return response.data;
}

export async function createAdminUser(
  sessionMaterial: string,
  idempotencyKey: string,
  body: CreateAdminUserRequest,
): Promise<AdminUser> {
  let response;

  try {
    response = await backendClient().POST('/v1/admin/users', {
      params: { header: { 'Idempotency-Key': idempotencyKey } },
      body,
      headers: sessionHeaders(sessionMaterial),
    });
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw accountFailure(response.response.status, response.error);
  }

  return response.data;
}

export async function changeAdminUserRole(
  sessionMaterial: string,
  userId: string,
  idempotencyKey: string,
  body: { readonly expectedVersion: number; readonly role: AdminUserRole },
): Promise<AdminUser> {
  let response;

  try {
    response = await backendClient().PATCH('/v1/admin/users/{userId}/role', {
      params: { path: { userId }, header: { 'Idempotency-Key': idempotencyKey } },
      body,
      headers: sessionHeaders(sessionMaterial),
    });
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw accountFailure(response.response.status, response.error);
  }

  return response.data;
}

/** Las tres transiciones que solo llevan `expectedVersion`. */
export type AdminUserAction = 'disable' | 'reactivate' | 'resend-invitation';

export async function transitionAdminUser(
  sessionMaterial: string,
  userId: string,
  action: AdminUserAction,
  idempotencyKey: string,
  expectedVersion: number,
): Promise<AdminUser> {
  const init = {
    params: { path: { userId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: { expectedVersion },
    headers: sessionHeaders(sessionMaterial),
  };

  let response;

  try {
    if (action === 'disable') {
      response = await backendClient().POST('/v1/admin/users/{userId}/disable', init);
    } else if (action === 'reactivate') {
      response = await backendClient().POST('/v1/admin/users/{userId}/reactivate', init);
    } else {
      response = await backendClient().POST('/v1/admin/users/{userId}/resend-invitation', init);
    }
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw accountFailure(response.response.status, response.error);
  }

  return response.data;
}
