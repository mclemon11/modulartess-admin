import { NextRequest } from 'next/server';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE_NAME } from '@/features/session/session-cookie';
import { BackendFailure } from '@/lib/api/errors';

/**
 * La ruta BFF de la configuración de Wompi.
 *
 * Es por donde pasan las cuatro credenciales en claro, así que lo que se comprueba aquí es la
 * frontera entera —`Origin`, cookie, forma del cuerpo— y, sobre todo, **que nada se filtre de
 * vuelta**: ni en la respuesta correcta, ni en el error, ni en el mensaje.
 *
 * Los valores con aspecto de credencial de este archivo son inventados para la prueba.
 */

const updateWompiIntegration = vi.fn();

vi.mock('@/lib/api/integrations', () => ({
  updateWompiIntegration: (...args: unknown[]) => updateWompiIntegration(...args),
}));

const { PATCH } = await import('./route');

const ALLOWED_ORIGIN = 'https://panel.example.invalid';
const MATERIAL = 'material-de-sesion-opaco';

/** Credenciales inventadas. Solo se usan para comprobar que no vuelven. */
const SECRET = {
  publicKey: 'pub_test_PRUEBANUNCADEVUELTA01',
  privateKey: 'prv_test_PRUEBANUNCADEVUELTA01',
  eventsSecret: 'test_events_PRUEBANUNCADEVUELTA',
  integritySecret: 'test_integrity_PRUEBANUNCADEV01',
} as const;

const VALID_BODY = { expectedVersion: 3, environment: 'sandbox', ...SECRET };

function request(options?: {
  readonly origin?: string | null;
  readonly body?: unknown;
  readonly cookie?: boolean;
}): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });

  if (options?.origin !== null) headers.set('origin', options?.origin ?? ALLOWED_ORIGIN);
  if (options?.cookie !== false) headers.set('cookie', `${SESSION_COOKIE_NAME}=${MATERIAL}`);

  return new NextRequest('https://panel.example.invalid/api/admin/integrations/wompi', {
    method: 'PATCH',
    headers,
    body: JSON.stringify(options?.body ?? VALID_BODY),
  });
}

beforeEach(() => {
  process.env.MODULARTESS_ADMIN_ORIGIN = ALLOWED_ORIGIN;
  updateWompiIntegration.mockReset();
});

afterEach(() => {
  delete process.env.MODULARTESS_ADMIN_ORIGIN;
});

/** Respuesta típica del backend: estado, sin una sola credencial. */
const PROJECTION = {
  provider: 'wompi',
  version: 4,
  activeEnvironment: 'sandbox',
  livePaymentsEnabled: false,
  sandbox: { configured: true, publicKeyMasked: 'pub_test_…TA01', privateKeyConfigured: true },
};

describe('PATCH /api/admin/integrations/wompi', () => {
  it('transporta la sesión y devuelve la proyección del backend', async () => {
    updateWompiIntegration.mockResolvedValue(PROJECTION);

    const response = await PATCH(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(PROJECTION);
    expect(updateWompiIntegration).toHaveBeenCalledWith(MATERIAL, VALID_BODY);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  /*
   * La prueba que da sentido a todo este archivo: por la ruta entran cuatro credenciales y por la
   * respuesta no puede volver ninguna.
   */
  it('ninguna credencial vuelve en la respuesta', async () => {
    updateWompiIntegration.mockResolvedValue(PROJECTION);

    const response = await PATCH(request());
    const body = await response.text();

    for (const value of Object.values(SECRET)) {
      expect(body, value.slice(0, 14)).not.toContain(value);
    }
  });

  it('tampoco vuelven en un error', async () => {
    updateWompiIntegration.mockRejectedValue(
      new BackendFailure('backend_payment_integration_invalid'),
    );

    const response = await PATCH(request());
    const body = await response.text();

    expect(response.status).toBe(400);
    for (const value of Object.values(SECRET)) {
      expect(body, value.slice(0, 14)).not.toContain(value);
    }
  });

  it('rechaza un Origin que no es el del panel sin llamar al backend', async () => {
    const response = await PATCH(request({ origin: 'https://otro.invalid' }));

    expect(response.status).toBe(403);
    expect(updateWompiIntegration).not.toHaveBeenCalled();
  });

  it('rechaza la petición sin cookie de sesión', async () => {
    const response = await PATCH(request({ cookie: false }));

    expect(response.status).toBe(401);
    expect(updateWompiIntegration).not.toHaveBeenCalled();
  });

  it.each([
    ['sin expectedVersion', { environment: 'sandbox' }],
    ['sin ambiente', { expectedVersion: 3 }],
    ['con un ambiente inventado', { expectedVersion: 3, environment: 'staging' }],
  ])('rechaza un cuerpo %s sin llamar al backend', async (_case, body) => {
    const response = await PATCH(request({ body }));

    expect(response.status).toBe(400);
    expect(updateWompiIntegration).not.toHaveBeenCalled();
  });

  /* Producción está bloqueada por código: el backend lo dice y el BFF lo traduce sin suavizarlo. */
  it('traduce el bloqueo de producción a su propio código', async () => {
    updateWompiIntegration.mockRejectedValue(
      new BackendFailure('backend_live_payments_not_enabled'),
    );

    const response = await PATCH(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'live_payments_not_enabled' });
  });

  it('traduce el conflicto de versión a 409 integration_conflict', async () => {
    updateWompiIntegration.mockRejectedValue(
      new BackendFailure('backend_payment_integration_conflict'),
    );

    const response = await PATCH(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'integration_conflict' });
  });

  it('traduce la falta de permiso sin decir cuál falta', async () => {
    updateWompiIntegration.mockRejectedValue(new BackendFailure('backend_forbidden'));

    const response = await PATCH(request());
    const body = (await response.json()) as { code: string; message: string };

    expect(response.status).toBe(403);
    expect(body.code).toBe('admin_role_required');
    expect(body.message).not.toContain('integrations.manage');
  });

  it('no propaga el mensaje del backend en un fallo inesperado', async () => {
    updateWompiIntegration.mockRejectedValue(
      new Error('backend en https://interno.invalid rechazó prv_test_ALGO'),
    );

    const response = await PATCH(request());
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).not.toContain('interno.invalid');
    expect(body).not.toContain('prv_test_ALGO');
  });
});
