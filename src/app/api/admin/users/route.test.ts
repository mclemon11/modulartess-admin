import { NextRequest } from 'next/server';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE_NAME } from '@/features/session/session-cookie';
import { BackendFailure } from '@/lib/api/errors';

/**
 * Las rutas BFF de cuentas: `Origin` exacto, cookie `__Host-`, cuerpo cerrado y la clave de
 * idempotencia pasada al backend. Nunca se llama al backend si algo de eso falla.
 */

const createAdminUser = vi.fn();
const changeAdminUserRole = vi.fn();
const transitionAdminUser = vi.fn();

vi.mock('@/lib/api/admin-users', () => ({
  createAdminUser: (...args: unknown[]) => createAdminUser(...args),
  changeAdminUserRole: (...args: unknown[]) => changeAdminUserRole(...args),
  transitionAdminUser: (...args: unknown[]) => transitionAdminUser(...args),
}));

const create = await import('./route');
const role = await import('./[userId]/role/route');
const disable = await import('./[userId]/disable/route');
const reactivate = await import('./[userId]/reactivate/route');
const resend = await import('./[userId]/resend-invitation/route');

const ALLOWED_ORIGIN = 'https://panel.example.invalid';
const MATERIAL = 'material-de-sesion-opaco';
const KEY = 'c8a2b1f0-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const NEW_USER = {
  idempotencyKey: KEY,
  email: 'nueva@example.invalid',
  displayName: 'Persona Nueva',
  role: 'moderator',
};

function request(
  path: string,
  options: {
    readonly method?: string;
    readonly origin?: string | null;
    readonly body?: unknown;
    readonly cookie?: boolean;
  } = {},
): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });

  if (options.origin !== null) headers.set('origin', options.origin ?? ALLOWED_ORIGIN);

  const built = new NextRequest(`https://panel.example.invalid${path}`, {
    method: options.method ?? 'POST',
    headers,
    body: JSON.stringify(options.body ?? {}),
  });

  if (options.cookie !== false) built.cookies.set(SESSION_COOKIE_NAME, MATERIAL);

  return built;
}

const params = (userId: string) => ({ params: Promise.resolve({ userId }) });

const ACCOUNT = {
  id: 'adm_1',
  email: 'nueva@example.invalid',
  displayName: 'Persona Nueva',
  role: 'moderator',
  status: 'invited',
  version: 2,
  createdAt: '2026-09-27T12:00:00.000Z',
  activatedAt: null,
  lastSessionAt: null,
  invitation: { state: 'sent', sendCount: 1, lastAttemptAt: '2026-09-27T12:00:00.000Z' },
  identitySync: 'synced',
};

beforeEach(() => {
  process.env.MODULARTESS_ADMIN_ORIGIN = ALLOWED_ORIGIN;
  createAdminUser.mockReset();
  changeAdminUserRole.mockReset();
  transitionAdminUser.mockReset();
});

afterEach(() => {
  delete process.env.MODULARTESS_ADMIN_ORIGIN;
});

describe('POST /api/admin/users', () => {
  it('crea con 201 y pasa la clave aparte del cuerpo', async () => {
    createAdminUser.mockResolvedValue(ACCOUNT);

    const response = await create.POST(request('/api/admin/users', { body: NEW_USER }));

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(createAdminUser).toHaveBeenCalledWith(MATERIAL, KEY, {
      email: 'nueva@example.invalid',
      displayName: 'Persona Nueva',
      role: 'moderator',
    });
  });

  it.each([
    ['un Origin ajeno', { origin: 'https://atacante.example.invalid' }, 403],
    ['un Origin parecido', { origin: 'https://panel.example.invalid.atacante.tld' }, 403],
    ['sin Origin', { origin: null }, 403],
    ['sin cookie', { cookie: false }, 401],
  ] as const)('rechaza %s sin llamar al backend', async (_label, options, status) => {
    const response = await create.POST(request('/api/admin/users', { body: NEW_USER, ...options }));

    expect(response.status).toBe(status);
    expect(createAdminUser).not.toHaveBeenCalled();
  });

  it.each([
    ['password', { password: 'no-se-acepta' }],
    ['uid', { uid: 'uid_elegido' }],
    ['claims', { claims: { modulartess_admin_role: 'super_admin' } }],
    ['disabled', { disabled: false }],
    ['emailVerified', { emailVerified: true }],
  ])('un cuerpo con %s es 400 y no llega al backend', async (_field, extra) => {
    const response = await create.POST(
      request('/api/admin/users', { body: { ...NEW_USER, ...extra } }),
    );

    expect(response.status).toBe(400);
    expect(createAdminUser).not.toHaveBeenCalled();
  });

  it('sin clave de idempotencia es 400', async () => {
    const { idempotencyKey: _omitted, ...withoutKey } = NEW_USER;
    const response = await create.POST(request('/api/admin/users', { body: withoutKey }));

    expect(response.status).toBe(400);
    expect(createAdminUser).not.toHaveBeenCalled();
  });

  it('un rol inventado es 400', async () => {
    const response = await create.POST(
      request('/api/admin/users', { body: { ...NEW_USER, role: 'root' } }),
    );

    expect(response.status).toBe(400);
  });

  it.each([
    ['backend_admin_user_email_taken', 409, 'account_email_taken'],
    ['backend_forbidden', 403, 'admin_role_required'],
    ['backend_idempotency_conflict', 409, 'idempotency_conflict'],
    ['backend_unavailable', 503, 'service_unavailable'],
  ] as const)('traduce %s a %i %s', async (failure, status, code) => {
    createAdminUser.mockRejectedValue(new BackendFailure(failure));

    const response = await create.POST(request('/api/admin/users', { body: NEW_USER }));

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ code });
  });
});

describe('mutaciones sobre una cuenta', () => {
  it('cambiar el rol pasa versión, rol y clave', async () => {
    changeAdminUserRole.mockResolvedValue({ ...ACCOUNT, role: 'master_admin' });

    const response = await role.PATCH(
      request('/api/admin/users/adm_1/role', {
        method: 'PATCH',
        body: { idempotencyKey: KEY, expectedVersion: 2, role: 'master_admin' },
      }),
      params('adm_1'),
    );

    expect(response.status).toBe(200);
    expect(changeAdminUserRole).toHaveBeenCalledWith(MATERIAL, 'adm_1', KEY, {
      expectedVersion: 2,
      role: 'master_admin',
    });
  });

  it.each([
    ['disable', disable],
    ['reactivate', reactivate],
    ['resend-invitation', resend],
  ] as const)('%s pasa la acción, la clave y la versión', async (action, module) => {
    transitionAdminUser.mockResolvedValue(ACCOUNT);

    const response = await module.POST(
      request(`/api/admin/users/adm_1/${action}`, {
        body: { idempotencyKey: KEY, expectedVersion: 2 },
      }),
      params('adm_1'),
    );

    expect(response.status).toBe(200);
    expect(transitionAdminUser).toHaveBeenCalledWith(MATERIAL, 'adm_1', action, KEY, 2);
  });

  it('exige expectedVersion', async () => {
    const response = await disable.POST(
      request('/api/admin/users/adm_1/disable', { body: { idempotencyKey: KEY } }),
      params('adm_1'),
    );

    expect(response.status).toBe(400);
    expect(transitionAdminUser).not.toHaveBeenCalled();
  });

  it('un identificador con formas raras es 404 sin llamar al backend', async () => {
    const response = await disable.POST(
      request('/api/admin/users/x/disable', { body: { idempotencyKey: KEY, expectedVersion: 1 } }),
      params('../otra-ruta'),
    );

    expect(response.status).toBe(404);
    expect(transitionAdminUser).not.toHaveBeenCalled();
  });

  it.each([
    ['backend_conflict', 409, 'version_conflict'],
    ['backend_admin_user_last_super_admin', 409, 'last_super_admin'],
    ['backend_admin_user_self_change', 409, 'account_self_change'],
    ['backend_admin_user_state_conflict', 409, 'account_state_conflict'],
    ['backend_admin_user_invitation_recently_sent', 409, 'invitation_recently_sent'],
    ['backend_admin_user_sync_pending', 503, 'account_sync_pending'],
  ] as const)('traduce %s a %i %s', async (failure, status, code) => {
    transitionAdminUser.mockRejectedValue(new BackendFailure(failure));

    const response = await disable.POST(
      request('/api/admin/users/adm_1/disable', {
        body: { idempotencyKey: KEY, expectedVersion: 2 },
      }),
      params('adm_1'),
    );

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ code });
  });

  it('ninguna respuesta de error lleva la cookie ni el material de sesión', async () => {
    transitionAdminUser.mockRejectedValue(new BackendFailure('backend_unauthorized'));

    const response = await disable.POST(
      request('/api/admin/users/adm_1/disable', {
        body: { idempotencyKey: KEY, expectedVersion: 2 },
      }),
      params('adm_1'),
    );

    expect(await response.text()).not.toContain(MATERIAL);
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
