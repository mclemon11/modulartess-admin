import { NextRequest } from 'next/server';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE_NAME } from '@/features/session/session-cookie';
import { BackendFailure } from '@/lib/api/errors';

/**
 * Las tres rutas BFF de TikTok: guardar, activar y probar.
 *
 * Lo que se comprueba es la frontera —`Origin`, cookie, cuerpo estrechado— y que **nada se filtre
 * de vuelta**. El token con aspecto de credencial es inventado para la prueba.
 */

const updateTikTokIntegration = vi.fn();
const setTikTokActivation = vi.fn();
const testTikTokConnection = vi.fn();

vi.mock('@/lib/api/integrations', () => ({
  updateTikTokIntegration: (...args: unknown[]) => updateTikTokIntegration(...args),
  setTikTokActivation: (...args: unknown[]) => setTikTokActivation(...args),
  testTikTokConnection: (...args: unknown[]) => testTikTokConnection(...args),
}));

const { PATCH } = await import('./route');
const { POST: ACTIVATE } = await import('./activation/route');
const { POST: TEST } = await import('./test/route');

const ALLOWED_ORIGIN = 'https://panel.example.invalid';
const MATERIAL = 'material-de-sesion-opaco';
const TOKEN = 'TOKEN-PRUEBA-NUNCA-DEVUELTO-9fA2';

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
  provider: 'tiktok',
  version: 5,
  pixelId: 'PIXELPRUEBA0000000000',
  accessTokenConfigured: true,
  accessTokenHint: '…9fA2',
};

beforeEach(() => {
  process.env.MODULARTESS_ADMIN_ORIGIN = ALLOWED_ORIGIN;
  updateTikTokIntegration.mockReset();
  setTikTokActivation.mockReset();
  testTikTokConnection.mockReset();
});

afterEach(() => {
  delete process.env.MODULARTESS_ADMIN_ORIGIN;
});

const CONFIG = '/api/admin/integrations/tiktok';

describe('PATCH /api/admin/integrations/tiktok', () => {
  it('transporta la sesión y solo los campos del contrato', async () => {
    updateTikTokIntegration.mockResolvedValue(PROJECTION);

    const response = await PATCH(
      request(CONFIG, 'PATCH', {
        body: {
          expectedVersion: 4,
          pixelId: 'PIXELPRUEBA0000000000',
          accessToken: TOKEN,
          enabled: true,
          extra: 'x',
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(updateTikTokIntegration).toHaveBeenCalledWith(MATERIAL, {
      expectedVersion: 4,
      pixelId: 'PIXELPRUEBA0000000000',
      accessToken: TOKEN,
    });
  });

  it('el token vacío se conserva: no viaja', async () => {
    updateTikTokIntegration.mockResolvedValue(PROJECTION);

    await PATCH(
      request(CONFIG, 'PATCH', {
        body: { expectedVersion: 4, pixelId: '  OTROPIXEL  ', accessToken: '   ' },
      }),
    );

    expect(updateTikTokIntegration).toHaveBeenCalledWith(MATERIAL, {
      expectedVersion: 4,
      pixelId: 'OTROPIXEL',
    });
  });

  it('sin ningún cambio no llama al backend', async () => {
    const response = await PATCH(request(CONFIG, 'PATCH', { body: { expectedVersion: 4 } }));

    expect(response.status).toBe(400);
    expect(updateTikTokIntegration).not.toHaveBeenCalled();
  });

  it('el token no vuelve en la respuesta ni en el error', async () => {
    updateTikTokIntegration.mockResolvedValue(PROJECTION);
    const ok = await (
      await PATCH(request(CONFIG, 'PATCH', { body: { expectedVersion: 4, accessToken: TOKEN } }))
    ).text();

    updateTikTokIntegration.mockRejectedValue(
      new BackendFailure('backend_tiktok_configuration_invalid'),
    );
    const failed = await PATCH(
      request(CONFIG, 'PATCH', { body: { expectedVersion: 4, accessToken: TOKEN } }),
    );
    const body = await failed.text();

    expect(failed.status).toBe(400);
    expect(JSON.parse(body)).toMatchObject({ code: 'tiktok_configuration_invalid' });
    expect(ok).not.toContain(TOKEN);
    expect(body).not.toContain(TOKEN);
  });

  it('rechaza otro origen y la falta de sesión sin llamar al backend', async () => {
    const foreign = await PATCH(
      request(CONFIG, 'PATCH', {
        origin: 'https://otro.example',
        body: { expectedVersion: 1, accessToken: TOKEN },
      }),
    );
    const anonymous = await PATCH(
      request(CONFIG, 'PATCH', { cookie: false, body: { expectedVersion: 1, accessToken: TOKEN } }),
    );

    expect(foreign.status).toBe(403);
    expect(anonymous.status).toBe(401);
    expect(updateTikTokIntegration).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/integrations/tiktok/activation', () => {
  const PATH = '/api/admin/integrations/tiktok/activation';

  it('exige confirm: true literal', async () => {
    for (const body of [
      { expectedVersion: 5, enabled: true },
      { expectedVersion: 5, enabled: true, confirm: 'true' },
      { expectedVersion: 5, enabled: true, confirm: false },
      { expectedVersion: 5, enabledForNewPayments: true, confirm: true },
    ]) {
      expect((await ACTIVATE(request(PATH, 'POST', { body }))).status).toBe(400);
    }
    expect(setTikTokActivation).not.toHaveBeenCalled();
  });

  it('activa con confirmación y no transporta el token', async () => {
    setTikTokActivation.mockResolvedValue(PROJECTION);

    await ACTIVATE(
      request(PATH, 'POST', {
        body: { expectedVersion: 5, enabled: true, confirm: true, accessToken: TOKEN },
      }),
    );

    expect(setTikTokActivation).toHaveBeenCalledWith(MATERIAL, {
      expectedVersion: 5,
      enabled: true,
      confirm: true,
    });
  });

  it.each([
    ['backend_tiktok_configuration_incomplete', 'tiktok_configuration_incomplete', 409],
    ['backend_tiktok_connection_test_required', 'tiktok_connection_test_required', 409],
    ['backend_payment_integration_conflict', 'integration_conflict', 409],
    ['backend_payment_integration_invalid', 'integration_invalid', 400],
    ['backend_forbidden', 'admin_role_required', 403],
  ] as const)('traduce %s', async (failure, code, status) => {
    setTikTokActivation.mockRejectedValue(new BackendFailure(failure));

    const response = await ACTIVATE(
      request(PATH, 'POST', { body: { expectedVersion: 5, enabled: true, confirm: true } }),
    );

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code });
  });
});

describe('POST /api/admin/integrations/tiktok/test', () => {
  const PATH = '/api/admin/integrations/tiktok/test';

  it('solo transporta el código de eventos de prueba y devuelve el resultado', async () => {
    testTikTokConnection.mockResolvedValue({
      accepted: true,
      testedAt: '2026-11-18T12:00:00.000Z',
      errorCode: null,
    });

    const response = await TEST(
      request(PATH, 'POST', { body: { testEventCode: ' TEST123 ', accessToken: TOKEN } }),
    );

    expect(response.status).toBe(200);
    expect(testTikTokConnection).toHaveBeenCalledWith(MATERIAL, { testEventCode: 'TEST123' });
    expect(await response.text()).not.toContain(TOKEN);
  });

  it('sin código no llama al backend', async () => {
    const response = await TEST(request(PATH, 'POST', { body: {} }));

    expect(response.status).toBe(400);
    expect(testTikTokConnection).not.toHaveBeenCalled();
  });
});
