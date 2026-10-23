import { NextRequest } from 'next/server';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE_NAME } from '@/features/session/session-cookie';
import { BackendFailure } from '@/lib/api/errors';

/**
 * Listado de pedidos por el BFF: solo viajan `page` y `pageSize`.
 *
 * El navegador pide una página numerada; la ruta lee la cookie en el servidor y entrega la página
 * del backend tal cual, con su total. Ningún cursor llega ya desde el navegador.
 */

const listOrders = vi.fn();

vi.mock('@/lib/api/orders', () => ({
  listOrders: (...args: unknown[]) => listOrders(...args),
}));

const { GET } = await import('./route');

const MATERIAL = 'material-de-sesion-opaco';
const PAGE = { items: [], nextPageToken: null, total: 0, page: 1, pageSize: 20 };

function request(search: string, cookie = true): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set('cookie', `${SESSION_COOKIE_NAME}=${MATERIAL}`);
  return new NextRequest(`https://panel.example.invalid/api/admin/orders${search}`, { headers });
}

beforeEach(() => {
  listOrders.mockReset();
  listOrders.mockResolvedValue(PAGE);
});

describe('GET /api/admin/orders', () => {
  it('reenvía la página y el tamaño pedidos', async () => {
    const response = await GET(request('?page=3&pageSize=50'));

    expect(response.status).toBe(200);
    expect(listOrders).toHaveBeenCalledWith(MATERIAL, { page: 3, pageSize: 50 });
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual(PAGE);
  });

  it.each([10, 20, 50, 100])('admite %i por página', async (size) => {
    await GET(request(`?page=1&pageSize=${size}`));
    expect(listOrders).toHaveBeenCalledWith(MATERIAL, { page: 1, pageSize: size });
  });

  it('sin parámetros pide la página 1 con 20 por página', async () => {
    await GET(request(''));
    expect(listOrders).toHaveBeenCalledWith(MATERIAL, { page: 1, pageSize: 20 });
  });

  it('ignora el cursor antiguo y los valores irreconocibles', async () => {
    await GET(request('?pageToken=abc&page=-2&pageSize=7'));
    expect(listOrders).toHaveBeenCalledWith(MATERIAL, { page: 1, pageSize: 20 });
  });

  it('reenvía el filtro por estado junto con la posición', async () => {
    await GET(request('?page=2&pageSize=50&status=ready_to_ship'));
    expect(listOrders).toHaveBeenCalledWith(MATERIAL, {
      page: 2,
      pageSize: 50,
      status: 'ready_to_ship',
    });
  });

  it('sin estado, o con uno mal formado, lista todos', async () => {
    for (const search of ['?page=1&pageSize=20', '?page=1&pageSize=20&status=', '?status=PAID']) {
      listOrders.mockClear();
      await GET(request(search));
      expect(listOrders).toHaveBeenCalledWith(MATERIAL, { page: 1, pageSize: 20 });
    }
  });

  it('sin cookie de sesión no llama al backend', async () => {
    const response = await GET(request('?page=2', false));

    expect(response.status).toBe(401);
    expect(listOrders).not.toHaveBeenCalled();
  });

  it('traduce un fallo del backend sin propagar su texto', async () => {
    listOrders.mockRejectedValue(new BackendFailure('backend_unavailable'));

    const response = await GET(request('?page=2'));
    const body = (await response.json()) as { code: string; message: string };

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(typeof body.message).toBe('string');
  });
});
