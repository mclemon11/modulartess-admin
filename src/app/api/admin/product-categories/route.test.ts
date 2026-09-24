import { NextRequest } from 'next/server';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE_NAME } from '@/features/session/session-cookie';
import { catalogFailure } from '@/lib/api/errors';

/**
 * Las rutas BFF del catálogo de categorías, y el alta de producto con sus conflictos.
 *
 * Lo que se fija aquí es la frontera: qué cuerpo llega al backend —con `expectedVersion` en las tres
 * mutaciones sobre una categoría existente, y nada más— y qué código vuelve al navegador.
 */

const createCategory = vi.fn();
const renameCategory = vi.fn();
const transitionCategory = vi.fn();
const createProduct = vi.fn();

vi.mock('@/lib/api/categories', () => ({
  createCategory: (...args: unknown[]) => createCategory(...args),
  renameCategory: (...args: unknown[]) => renameCategory(...args),
  transitionCategory: (...args: unknown[]) => transitionCategory(...args),
}));

vi.mock('@/lib/api/catalog', () => ({
  createProduct: (...args: unknown[]) => createProduct(...args),
}));

const { POST: createRoute } = await import('./route');
const { POST: renameRoute } = await import('./[categoryId]/rename/route');
const { POST: archiveRoute } = await import('./[categoryId]/archive/route');
const { POST: reactivateRoute } = await import('./[categoryId]/reactivate/route');
const { POST: createProductRoute } = await import('../products/route');

const ORIGIN = 'https://panel.example.invalid';
const MATERIAL = 'material-de-sesion-opaco';

function request(body: unknown, origin: string | null = ORIGIN): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });

  if (origin !== null) headers.set('origin', origin);
  headers.set('cookie', `${SESSION_COOKIE_NAME}=${MATERIAL}`);

  return new NextRequest(`${ORIGIN}/api/admin/product-categories`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const params = (categoryId: string) => ({ params: Promise.resolve({ categoryId }) });

const CATEGORY = {
  id: 'cat_1',
  name: 'Tocadores',
  slug: 'tocadores',
  status: 'active',
  version: 3,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  assignedProducts: null,
  activeProducts: null,
};

beforeEach(() => {
  process.env.MODULARTESS_ADMIN_ORIGIN = ORIGIN;
  for (const mock of [createCategory, renameCategory, transitionCategory, createProduct]) {
    mock.mockReset();
  }
});

afterEach(() => {
  delete process.env.MODULARTESS_ADMIN_ORIGIN;
});

describe('POST /api/admin/product-categories', () => {
  it('manda solo nombre y slug, recortados', async () => {
    createCategory.mockResolvedValue(CATEGORY);

    const response = await createRoute(
      request({ name: '  Tocadores ', slug: 'tocadores', extra: 'no viaja' }),
    );

    expect(response.status).toBe(200);
    expect(createCategory).toHaveBeenCalledWith(MATERIAL, { name: 'Tocadores', slug: 'tocadores' });
  });

  it('un slug sin forma no gasta la llamada', async () => {
    const response = await createRoute(request({ name: 'Tocadores', slug: 'Tocadores Aura' }));

    expect(response.status).toBe(400);
    expect(createCategory).not.toHaveBeenCalled();
  });

  it('traduce el conflicto de slug con su propio código', async () => {
    createCategory.mockRejectedValue(
      catalogFailure(409, { code: 'product_category_slug_conflict' }),
    );

    const response = await createRoute(request({ name: 'Tocadores', slug: 'tocadores' }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'category_slug_conflict' });
  });

  it('un origen ajeno se rechaza antes de tocar el backend', async () => {
    const response = await createRoute(
      request({ name: 'Tocadores', slug: 'tocadores' }, 'https://ajeno.example.invalid'),
    );

    expect(response.status).toBe(403);
    expect(createCategory).not.toHaveBeenCalled();
  });
});

describe('mutaciones sobre una categoría existente: expectedVersion siempre', () => {
  it('renombrar manda el nombre y la versión leída, nunca el slug', async () => {
    renameCategory.mockResolvedValue({ ...CATEGORY, name: 'Tocadores y espejos', version: 4 });

    const response = await renameRoute(
      request({ name: 'Tocadores y espejos', expectedVersion: 3, slug: 'otro' }),
      params('cat_1'),
    );

    expect(response.status).toBe(200);
    expect(renameCategory).toHaveBeenCalledWith(MATERIAL, 'cat_1', {
      name: 'Tocadores y espejos',
      expectedVersion: 3,
    });
  });

  it.each([
    ['archive', archiveRoute],
    ['reactivate', reactivateRoute],
  ] as const)('%s manda la versión leída', async (transition, route) => {
    transitionCategory.mockResolvedValue({ ...CATEGORY, version: 4 });

    const response = await route(request({ expectedVersion: 3 }), params('cat_1'));

    expect(response.status).toBe(200);
    expect(transitionCategory).toHaveBeenCalledWith(MATERIAL, 'cat_1', transition, 3);
  });

  it.each([
    ['rename', renameRoute, { name: 'Tocadores' }],
    ['archive', archiveRoute, {}],
    ['reactivate', reactivateRoute, {}],
  ] as const)('%s sin expectedVersion no llega al backend', async (_, route, body) => {
    const response = await route(request(body), params('cat_1'));

    expect(response.status).toBe(400);
    expect(renameCategory).not.toHaveBeenCalled();
    expect(transitionCategory).not.toHaveBeenCalled();
  });

  it('una versión vieja vuelve como conflicto de la categoría, no del producto', async () => {
    transitionCategory.mockRejectedValue(
      catalogFailure(409, { code: 'product_category_version_conflict' }),
    );

    const response = await archiveRoute(request({ expectedVersion: 3 }), params('cat_1'));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'category_version_conflict' });
  });

  it('una categoría inexistente vuelve como 404 propio', async () => {
    transitionCategory.mockRejectedValue(
      catalogFailure(404, { code: 'product_category_not_found' }),
    );

    const response = await reactivateRoute(request({ expectedVersion: 3 }), params('cat_x'));

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'category_not_found' });
  });
});

describe('POST /api/admin/products: los 409 ya no se aplanan', () => {
  const BODY = { sku: 'TOC-AURA', slug: 'tocador-aura', name: 'Tocador Aura', priceCop: 1490000 };

  it.each([
    ['product_sku_conflict', 'sku_conflict'],
    ['product_slug_conflict', 'slug_conflict'],
    ['product_version_conflict', 'version_conflict'],
  ])('%s llega al navegador como %s', async (upstream, bff) => {
    createProduct.mockRejectedValue(catalogFailure(409, { code: upstream }));

    const response = await createProductRoute(request(BODY));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: bff });
  });

  it('un 409 desconocido llega con su referencia, no como conflicto de versión', async () => {
    createProduct.mockRejectedValue(catalogFailure(409, { code: 'product_new_rule' }));

    const response = await createProductRoute(request(BODY));

    expect(await response.json()).toEqual({
      code: 'conflict_unrecognized',
      message: 'El backend rechazó la operación por un conflicto.',
      reference: 'product_new_rule',
    });
  });
});
