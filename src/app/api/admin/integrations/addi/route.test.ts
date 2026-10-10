import { NextRequest } from 'next/server';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE_NAME } from '@/features/session/session-cookie';
import { BackendFailure } from '@/lib/api/errors';

/**
 * Las tres rutas BFF de Addi (ADR 0015): guardar, activar y probar.
 *
 * Lo que se comprueba es la frontera —`Origin`, cookie, cuerpo estrechado— y que **nada se filtre
 * de vuelta**. Los valores con aspecto de credencial son inventados para la prueba.
 */

const updateAddiIntegration = vi.fn();
const setAddiActivation = vi.fn();
const testAddiConnection = vi.fn();

vi.mock('@/lib/api/integrations', () => ({
  updateAddiIntegration: (...args: unknown[]) => updateAddiIntegration(...args),
  setAddiActivation: (...args: unknown[]) => setAddiActivation(...args),
  testAddiConnection: (...args: unknown[]) => testAddiConnection(...args),
}));

const { PATCH } = await import('./route');
const { POST: ACTIVATE } = await import('./activation/route');
const { POST: TEST } = await import('./test/route');

const ALLOWED_ORIGIN = 'https://panel.example.invalid';
const MATERIAL = 'material-de-sesion-opaco';

const SECRET = {
  clientId: 'CLIENTE-PRUEBA-NUNCA-DEVUELTO-01',
  clientSecret: 'SECRETO-PRUEBA-NUNCA-DEVUELTO-02',
  callbackUsername: 'usuario-prueba-nunca-devuelto',
  callbackSecret: 'CLAVE-PRUEBA-NUNCA-DEVUELTA-03',
} as const;

function request(
  path: string,
  method: 'PATCH' | 'POST',
  options?: { readonly origin?: string | null; readonly body?: unknown; readonly cookie?: boolean },
): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });

  if (options?.origin !== null) headers.set('origin', options?.origin ?? ALLOWED_ORIGIN);
  if (options?.cookie !== false) headers.set('cookie', `${SESSION_COOKIE_NAME}=${MATERIAL}`);

  return new NextRequest(`https://panel.example.invalid${path}`, {
    method,
    headers,
    body: JSON.stringify(options?.body ?? {}),
  });
}

const PROJECTION = {
  provider: 'addi',
  environment: 'production',
  version: 5,
  clientIdConfigured: true,
  clientIdHint: '…ID01',
  clientSecretConfigured: true,
  callbackSecretConfigured: true,
};

beforeEach(() => {
  process.env.MODULARTESS_ADMIN_ORIGIN = ALLOWED_ORIGIN;
  updateAddiIntegration.mockReset();
  setAddiActivation.mockReset();
  testAddiConnection.mockReset();
});

afterEach(() => {
  delete process.env.MODULARTESS_ADMIN_ORIGIN;
});

const CONFIG = '/api/admin/integrations/addi';

describe('PATCH /api/admin/integrations/addi', () => {
  it('transporta la sesión y solo los campos del contrato', async () => {
    updateAddiIntegration.mockResolvedValue(PROJECTION);

    const response = await PATCH(
      request(CONFIG, 'PATCH', {
        body: { expectedVersion: 4, ...SECRET, enabledForNewPayments: true, extra: 'x' },
      }),
    );

    expect(response.status).toBe(200);
    expect(updateAddiIntegration).toHaveBeenCalledWith(MATERIAL, { expectedVersion: 4, ...SECRET });
  });

  it('los campos vacíos u omitidos se conservan: no viajan', async () => {
    updateAddiIntegration.mockResolvedValue(PROJECTION);

    await PATCH(
      request(CONFIG, 'PATCH', {
        body: { expectedVersion: 4, clientSecret: '  nuevo-secreto  ', clientId: '   ' },
      }),
    );

    expect(updateAddiIntegration).toHaveBeenCalledWith(MATERIAL, {
      expectedVersion: 4,
      clientSecret: 'nuevo-secreto',
    });
  });

  it('sin ningún cambio no llama al backend', async () => {
    const response = await PATCH(request(CONFIG, 'PATCH', { body: { expectedVersion: 4 } }));

    expect(response.status).toBe(400);
    expect(updateAddiIntegration).not.toHaveBeenCalled();
  });

  it('ninguna credencial vuelve en la respuesta ni en el error', async () => {
    updateAddiIntegration.mockResolvedValue(PROJECTION);
    const ok = await (
      await PATCH(request(CONFIG, 'PATCH', { body: { expectedVersion: 4, ...SECRET } }))
    ).text();

    updateAddiIntegration.mockRejectedValue(
      new BackendFailure('backend_addi_configuration_invalid'),
    );
    const failed = await PATCH(
      request(CONFIG, 'PATCH', { body: { expectedVersion: 4, ...SECRET } }),
    );
    const body = await failed.text();

    expect(failed.status).toBe(400);
    expect(JSON.parse(body)).toMatchObject({ code: 'addi_configuration_invalid' });
    for (const value of Object.values(SECRET)) {
      expect(ok).not.toContain(value);
      expect(body).not.toContain(value);
    }
  });

  it('rechaza otro origen y la falta de sesión sin llamar al backend', async () => {
    const foreign = await PATCH(
      request(CONFIG, 'PATCH', {
        origin: 'https://otro.example',
        body: { expectedVersion: 1, ...SECRET },
      }),
    );
    const anonymous = await PATCH(
      request(CONFIG, 'PATCH', { cookie: false, body: { expectedVersion: 1, ...SECRET } }),
    );

    expect(foreign.status).toBe(403);
    expect(anonymous.status).toBe(401);
    expect(updateAddiIntegration).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/integrations/addi/activation', () => {
  const PATH = '/api/admin/integrations/addi/activation';

  it('exige confirm: true literal', async () => {
    for (const body of [
      { expectedVersion: 5, enabledForNewPayments: true },
      { expectedVersion: 5, enabledForNewPayments: true, confirm: 'true' },
      { expectedVersion: 5, enabledForNewPayments: true, confirm: false },
    ]) {
      expect((await ACTIVATE(request(PATH, 'POST', { body }))).status).toBe(400);
    }
    expect(setAddiActivation).not.toHaveBeenCalled();
  });

  it('activa con confirmación y no transporta credenciales', async () => {
    setAddiActivation.mockResolvedValue(PROJECTION);

    await ACTIVATE(
      request(PATH, 'POST', {
        body: { expectedVersion: 5, enabledForNewPayments: true, confirm: true, ...SECRET },
      }),
    );

    expect(setAddiActivation).toHaveBeenCalledWith(MATERIAL, {
      expectedVersion: 5,
      enabledForNewPayments: true,
      confirm: true,
    });
  });

  it.each([
    ['backend_addi_live_payments_not_enabled', 'addi_live_payments_not_enabled', 409],
    ['backend_addi_configuration_incomplete', 'addi_configuration_incomplete', 409],
    ['backend_addi_connection_test_required', 'addi_connection_test_required', 409],
    ['backend_payment_integration_conflict', 'integration_conflict', 409],
    ['backend_forbidden', 'admin_role_required', 403],
  ] as const)('traduce %s', async (failure, code, status) => {
    setAddiActivation.mockRejectedValue(new BackendFailure(failure));

    const response = await ACTIVATE(
      request(PATH, 'POST', {
        body: { expectedVersion: 5, enabledForNewPayments: true, confirm: true },
      }),
    );

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code });
  });
});

describe('POST /api/admin/integrations/addi/test', () => {
  it('no toma parámetros y devuelve solo el resultado', async () => {
    testAddiConnection.mockResolvedValue({
      authenticated: true,
      testedAt: '2026-10-09T12:00:00.000Z',
      errorCode: null,
    });

    const response = await TEST(
      request('/api/admin/integrations/addi/test', 'POST', { body: { clientId: SECRET.clientId } }),
    );

    expect(response.status).toBe(200);
    expect(testAddiConnection).toHaveBeenCalledWith(MATERIAL);
    expect(await response.text()).not.toContain(SECRET.clientId);
  });
});
