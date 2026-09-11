import { NextRequest } from 'next/server';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE_NAME } from '@/features/session/session-cookie';
import { BackendFailure } from '@/lib/api/errors';

/**
 * Mutación representativa del BFF: el ajuste de inventario.
 *
 * Es la que más partes toca a la vez —`Origin`, cookie, cuerpo, clave de idempotencia y traducción
 * de estados—, así que comprobarla cubre la frontera que comparten las cinco rutas.
 */

const adjustInventory = vi.fn();

vi.mock('@/lib/api/catalog', () => ({
  adjustInventory: (...args: unknown[]) => adjustInventory(...args),
}));

const { POST } = await import('./route');

const ALLOWED_ORIGIN = 'https://panel.example.invalid';
const MATERIAL = 'material-de-sesion-opaco';
const KEY = 'idem-0123456789abcdef';

const context = { params: Promise.resolve({ productId: 'prd_abc' }) };

function request(options?: {
  readonly origin?: string | null;
  readonly body?: unknown;
  readonly cookie?: boolean;
}): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });

  if (options?.origin !== null) {
    headers.set('origin', options?.origin ?? ALLOWED_ORIGIN);
  }

  const built = new NextRequest(
    'https://panel.example.invalid/api/admin/products/prd_abc/inventory-adjustments',
    {
      method: 'POST',
      headers,
      body: JSON.stringify(
        options?.body ?? { expectedVersion: 3, delta: -2, reason: 'dañado', idempotencyKey: KEY },
      ),
    },
  );

  if (options?.cookie !== false) {
    built.cookies.set(SESSION_COOKIE_NAME, MATERIAL);
  }

  return built;
}

beforeEach(() => {
  process.env.MODULARTESS_ADMIN_ORIGIN = ALLOWED_ORIGIN;
  adjustInventory.mockReset();
});

afterEach(() => {
  delete process.env.MODULARTESS_ADMIN_ORIGIN;
});

describe('frontera de la mutación', () => {
  it('rechaza un Origin distinto sin llamar al backend', async () => {
    const response = await POST(request({ origin: 'https://atacante.example.invalid' }), context);

    expect(response.status).toBe(403);
    expect(adjustInventory).not.toHaveBeenCalled();
  });

  it('rechaza la falta de cookie con 401 controlado', async () => {
    const response = await POST(request({ cookie: false }), context);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: 'session_required' });
    expect(adjustInventory).not.toHaveBeenCalled();
  });

  it.each([
    ['delta cero', { expectedVersion: 1, delta: 0, reason: 'x', idempotencyKey: KEY }],
    ['sin motivo', { expectedVersion: 1, delta: 1, reason: '  ', idempotencyKey: KEY }],
    ['sin clave', { expectedVersion: 1, delta: 1, reason: 'x' }],
    ['clave corta', { expectedVersion: 1, delta: 1, reason: 'x', idempotencyKey: 'corta' }],
    ['versión inválida', { expectedVersion: 0, delta: 1, reason: 'x', idempotencyKey: KEY }],
  ])('rechaza un cuerpo inválido (%s)', async (_label, body) => {
    const response = await POST(request({ body }), context);

    expect(response.status).toBe(400);
    expect(adjustInventory).not.toHaveBeenCalled();
  });
});

describe('reenvío al backend', () => {
  it('pasa sesión, productId y clave de idempotencia por separado del cuerpo', async () => {
    adjustInventory.mockResolvedValue({
      product: { id: 'prd_abc', version: 4 },
      replayed: false,
    });

    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    // La clave viaja como argumento propio, no dentro del cuerpo: el BFF la pasa al encabezado
    // `Idempotency-Key` que exige el contrato.
    expect(adjustInventory).toHaveBeenCalledWith(MATERIAL, 'prd_abc', KEY, {
      expectedVersion: 3,
      delta: -2,
      reason: 'dañado',
    });
  });

  it('devuelve la respuesta autoritativa del backend', async () => {
    const authoritative = { product: { id: 'prd_abc', version: 4 }, replayed: true };

    adjustInventory.mockResolvedValue(authoritative);

    await expect((await POST(request(), context)).json()).resolves.toEqual(authoritative);
  });

  it('no filtra el material de sesión al navegador', async () => {
    adjustInventory.mockResolvedValue({ product: { id: 'prd_abc' }, replayed: false });

    const response = await POST(request(), context);

    expect(await response.text()).not.toContain(MATERIAL);
    expect(response.headers.get('x-modulartess-admin-session')).toBeNull();
  });
});

describe('conservación de los estados del contrato', () => {
  it.each([
    ['backend_invalid_request', 400],
    ['backend_unauthorized', 401],
    ['backend_forbidden', 403],
    ['backend_not_found', 404],
    ['backend_conflict', 409],
    ['backend_unavailable', 503],
  ] as const)('%s se devuelve como %i', async (failure, status) => {
    adjustInventory.mockRejectedValue(new BackendFailure(failure));

    expect((await POST(request(), context)).status).toBe(status);
  });

  it('todas las respuestas llevan Cache-Control: no-store', async () => {
    adjustInventory.mockRejectedValue(new BackendFailure('backend_conflict'));
    expect((await POST(request(), context)).headers.get('cache-control')).toBe('no-store');

    adjustInventory.mockResolvedValue({ product: {}, replayed: false });
    expect((await POST(request(), context)).headers.get('cache-control')).toBe('no-store');
  });
});
