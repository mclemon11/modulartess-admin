import { NextRequest } from 'next/server';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE_NAME } from '@/features/session/session-cookie';
import { BackendFailure } from '@/lib/api/errors';

/**
 * Ruta representativa de la superficie de variantes: el alta.
 *
 * Es la que más partes toca a la vez —`Origin`, cookie, cuerpo con atributos, `expectedVersion` y
 * traducción de estados—, así que comprobarla cubre la frontera que comparten las cuatro rutas
 * nuevas. El navegador nunca llama al backend: no conoce su URL ni puede leer la cookie.
 */

const createProductVariant = vi.fn();

vi.mock('@/lib/api/catalog', () => ({
  createProductVariant: (...args: unknown[]) => createProductVariant(...args),
}));

const { POST } = await import('./route');

const ALLOWED_ORIGIN = 'https://panel.example.invalid';
const MATERIAL = 'material-de-sesion-opaco';

const context = { params: Promise.resolve({ productId: 'prd_abc' }) };

const VALID_BODY = {
  expectedVersion: 3,
  sku: 'TOCADOR-AURA-80-ROBLE',
  priceCop: 1490000,
  stockQuantity: 4,
  attributes: [
    { key: 'finish', value: 'roble-natural', label: 'Roble natural' },
    { key: 'size', value: '80', label: '80 cm' },
  ],
};

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
    'https://panel.example.invalid/api/admin/products/prd_abc/variants',
    { method: 'POST', headers, body: JSON.stringify(options?.body ?? VALID_BODY) },
  );

  if (options?.cookie !== false) {
    built.cookies.set(SESSION_COOKIE_NAME, MATERIAL);
  }

  return built;
}

beforeEach(() => {
  process.env.MODULARTESS_ADMIN_ORIGIN = ALLOWED_ORIGIN;
  createProductVariant.mockReset();
});

afterEach(() => {
  delete process.env.MODULARTESS_ADMIN_ORIGIN;
});

describe('frontera de la mutación', () => {
  it('rechaza un Origin distinto sin llamar al backend', async () => {
    const response = await POST(request({ origin: 'https://atacante.example.invalid' }), context);

    expect(response.status).toBe(403);
    expect(createProductVariant).not.toHaveBeenCalled();
  });

  it('rechaza la falta de cookie con 401 controlado', async () => {
    const response = await POST(request({ cookie: false }), context);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: 'session_required' });
    expect(createProductVariant).not.toHaveBeenCalled();
  });

  it.each([
    ['sin expectedVersion', { ...VALID_BODY, expectedVersion: undefined }],
    ['versión cero', { ...VALID_BODY, expectedVersion: 0 }],
    ['precio cero', { ...VALID_BODY, priceCop: 0 }],
    ['precio con decimales', { ...VALID_BODY, priceCop: 1490000.5 }],
    ['inventario negativo', { ...VALID_BODY, stockQuantity: -1 }],
    ['sku en minúsculas', { ...VALID_BODY, sku: 'tocador-aura' }],
    ['sin atributos', { ...VALID_BODY, attributes: [] }],
    ['atributo sin etiqueta', { ...VALID_BODY, attributes: [{ key: 'finish', value: 'roble' }] }],
    [
      'valor sin normalizar',
      { ...VALID_BODY, attributes: [{ key: 'finish', value: 'Roble Natural', label: 'Roble' }] },
    ],
    [
      'dos veces el mismo eje',
      {
        ...VALID_BODY,
        attributes: [
          { key: 'finish', value: 'roble', label: 'Roble' },
          { key: 'finish', value: 'nogal', label: 'Nogal' },
        ],
      },
    ],
  ])('rechaza un cuerpo inválido (%s)', async (_label, body) => {
    const response = await POST(request({ body }), context);

    expect(response.status).toBe(400);
    expect(createProductVariant).not.toHaveBeenCalled();
  });
});

describe('reenvío al backend', () => {
  it('pasa la sesión y el productId aparte del cuerpo, y responde 201', async () => {
    const authoritative = {
      product: { id: 'prd_abc', version: 4 },
      variant: { id: 'var_1', sku: VALID_BODY.sku },
    };

    createProductVariant.mockResolvedValue(authoritative);

    const response = await POST(request(), context);

    expect(response.status).toBe(201);
    expect(createProductVariant).toHaveBeenCalledWith(MATERIAL, 'prd_abc', VALID_BODY);
    await expect(response.json()).resolves.toEqual(authoritative);
  });

  it('no filtra el material de sesión al navegador', async () => {
    createProductVariant.mockResolvedValue({ product: { id: 'prd_abc' }, variant: { id: 'v' } });

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
    createProductVariant.mockRejectedValue(new BackendFailure(failure));

    expect((await POST(request(), context)).status).toBe(status);
  });

  it('todas las respuestas llevan Cache-Control: no-store', async () => {
    createProductVariant.mockRejectedValue(new BackendFailure('backend_conflict'));
    expect((await POST(request(), context)).headers.get('cache-control')).toBe('no-store');

    createProductVariant.mockResolvedValue({ product: {}, variant: {} });
    expect((await POST(request(), context)).headers.get('cache-control')).toBe('no-store');
  });
});
