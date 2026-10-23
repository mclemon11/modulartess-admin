import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BackendFailure } from './errors';
import { ADMIN_SESSION_HEADER } from './session-material';

/**
 * La llamada de exportación que sale del servidor de Next hacia el backend.
 *
 * Ruta exacta, canal de la sesión, solo el filtro por estado —nunca `page` ni `pageSize`— y los
 * tres desenlaces: archivo, 204 y error con su código estable.
 */

const GET = vi.fn();

vi.mock('./backend-client', () => ({
  backendClient: () => ({ GET }),
}));

const { exportOrders } = await import('./orders');

const MATERIAL = 'material-de-sesion-opaco';

beforeEach(() => {
  GET.mockReset();
});

function lastCall() {
  const [path, options] = GET.mock.calls.at(-1) as [string, Record<string, unknown>];
  return { path, options };
}

describe('exportOrders', () => {
  it('pide el CSV del filtro, como bytes, con la sesión en su encabezado', async () => {
    const bytes = new TextEncoder().encode('﻿"Pedido"\r\n').buffer;
    GET.mockResolvedValue({
      data: bytes,
      error: undefined,
      response: new Response(null, {
        status: 200,
        headers: {
          'content-disposition': 'attachment; filename="pedidos-modulartess-2026-10-23.csv"',
          'x-order-export-count': '1',
        },
      }),
    });

    const result = await exportOrders(MATERIAL, 'paid');

    const { path, options } = lastCall();
    expect(path).toBe('/v1/admin/orders/export');
    expect(options.params).toEqual({ query: { status: 'paid' } });
    expect(options.parseAs).toBe('arrayBuffer');
    expect(options.headers).toEqual({ [ADMIN_SESSION_HEADER]: MATERIAL });
    expect(result).toEqual({
      kind: 'file',
      bytes,
      contentDisposition: 'attachment; filename="pedidos-modulartess-2026-10-23.csv"',
      count: '1',
    });
  });

  it('sin filtro no manda ningún parámetro', async () => {
    GET.mockResolvedValue({ data: undefined, error: undefined, response: { status: 204 } });

    await expect(exportOrders(MATERIAL, null)).resolves.toEqual({ kind: 'empty' });
    expect(lastCall().options.params).toEqual({ query: {} });
  });

  it('distingue el tope de exportación de los demás rechazos', async () => {
    GET.mockResolvedValue({
      data: undefined,
      error: { code: 'order_export_too_large', limit: 10000 },
      response: { status: 422 },
    });
    await expect(exportOrders(MATERIAL, null)).rejects.toEqual(
      new BackendFailure('backend_order_export_too_large'),
    );

    GET.mockResolvedValue({
      data: undefined,
      error: { code: 'order_request_invalid' },
      response: { status: 400 },
    });
    await expect(exportOrders(MATERIAL, 'enviado')).rejects.toMatchObject({
      code: 'backend_invalid_request',
    });
  });

  it('un fallo de red se convierte en indisponibilidad', async () => {
    GET.mockRejectedValue(new Error('ECONNRESET'));
    await expect(exportOrders(MATERIAL, null)).rejects.toMatchObject({
      code: 'backend_unavailable',
    });
  });
});
