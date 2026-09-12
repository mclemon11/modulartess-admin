import { NextRequest } from 'next/server';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE_NAME } from '@/features/session/session-cookie';
import { BackendFailure } from '@/lib/api/errors';

/**
 * Ruta representativa de la superficie de pedidos: la transición de estado.
 *
 * Es la que más partes toca a la vez —`Origin`, cookie, `expectedVersion`, estado y traducción de
 * conflictos—, así que comprobarla cubre la frontera que comparten las cuatro rutas nuevas. El
 * navegador nunca llama al backend: no conoce su URL ni puede leer la cookie.
 */

const changeOrderStatus = vi.fn();

vi.mock('@/lib/api/orders', () => ({
  changeOrderStatus: (...args: unknown[]) => changeOrderStatus(...args),
}));

const { POST } = await import('./route');

const ALLOWED_ORIGIN = 'https://panel.example.invalid';
const MATERIAL = 'material-de-sesion-opaco';

const context = { params: Promise.resolve({ orderId: 'ord_abc' }) };

const VALID_BODY = { expectedVersion: 3, status: 'preparing' };

function request(options?: {
  readonly origin?: string | null;
  readonly body?: unknown;
  readonly cookie?: boolean;
}): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });

  if (options?.origin !== null) {
    headers.set('origin', options?.origin ?? ALLOWED_ORIGIN);
  }

  if (options?.cookie !== false) {
    headers.set('cookie', `${SESSION_COOKIE_NAME}=${MATERIAL}`);
  }

  return new NextRequest('https://panel.example.invalid/api/admin/orders/ord_abc/status', {
    method: 'POST',
    headers,
    body: JSON.stringify(options?.body ?? VALID_BODY),
  });
}

beforeEach(() => {
  process.env.MODULARTESS_ADMIN_ORIGIN = ALLOWED_ORIGIN;
  changeOrderStatus.mockReset();
});

afterEach(() => {
  delete process.env.MODULARTESS_ADMIN_ORIGIN;
});

describe('POST /api/admin/orders/[orderId]/status', () => {
  it('transporta la sesión de la cookie y devuelve el pedido autoritativo', async () => {
    const order = { id: 'ord_abc', publicId: 'MZ-1', version: 4, status: 'preparing' };

    changeOrderStatus.mockResolvedValue(order);

    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(order);
    expect(changeOrderStatus).toHaveBeenCalledWith(MATERIAL, 'ord_abc', {
      expectedVersion: 3,
      status: 'preparing',
    });
    // Una respuesta de pedido nunca se cachea: lleva datos de una persona.
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('rechaza un Origin que no es el del panel sin llamar al backend', async () => {
    const response = await POST(request({ origin: 'https://otro.invalid' }), context);

    expect(response.status).toBe(403);
    expect(changeOrderStatus).not.toHaveBeenCalled();
  });

  it('rechaza la petición sin cookie de sesión', async () => {
    const response = await POST(request({ cookie: false }), context);

    expect(response.status).toBe(401);
    expect(changeOrderStatus).not.toHaveBeenCalled();
  });

  /* `expectedVersion` es obligatorio: sin él, dos personas moviendo el pedido se pisarían. */
  it.each([
    ['sin expectedVersion', { status: 'preparing' }],
    ['con expectedVersion cero', { expectedVersion: 0, status: 'preparing' }],
    ['con expectedVersion fraccionario', { expectedVersion: 1.5, status: 'preparing' }],
    ['sin estado', { expectedVersion: 2 }],
    ['con un estado que no existe en el contrato', { expectedVersion: 2, status: 'refunded' }],
  ])('rechaza un cuerpo %s sin llamar al backend', async (_case, body) => {
    const response = await POST(request({ body }), context);

    expect(response.status).toBe(400);
    expect(changeOrderStatus).not.toHaveBeenCalled();
  });

  /* Un 409 del backend llega como conflicto de versión, que el panel ofrece recargar. */
  it('traduce el conflicto del backend a 409 version_conflict', async () => {
    changeOrderStatus.mockRejectedValue(new BackendFailure('backend_conflict'));

    const response = await POST(request(), context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'version_conflict' });
  });

  it('no propaga el mensaje del backend en un fallo inesperado', async () => {
    changeOrderStatus.mockRejectedValue(new Error('backend en https://interno.invalid falló'));

    const response = await POST(request(), context);
    const body = (await response.json()) as { code: string; message: string };

    expect(response.status).toBe(500);
    expect(body.code).toBe('internal_error');
    expect(JSON.stringify(body)).not.toContain('interno.invalid');
  });
});
