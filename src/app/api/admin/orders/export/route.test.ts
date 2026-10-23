import { NextRequest } from 'next/server';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE_NAME } from '@/features/session/session-cookie';
import { BackendFailure } from '@/lib/api/errors';

/**
 * Exportación CSV por el BFF: solo viaja `status`, y los bytes del backend llegan intactos.
 *
 * El archivo lo compone el backend. Lo que se fija aquí es que el BFF no lo toque —ni las tildes,
 * ni las comillas, ni la protección contra fórmulas—, que no lo limite la cantidad por página de la
 * tabla y que el nombre que reenvía sea siempre de una forma cerrada.
 */

const exportOrders = vi.fn();

vi.mock('@/lib/api/orders', () => ({
  exportOrders: (...args: unknown[]) => exportOrders(...args),
}));

const { GET } = await import('./route');

const MATERIAL = 'material-de-sesion-opaco';

/** Lo que el backend compone: BOM, `;`, CRLF, comillas duplicadas y fórmulas neutralizadas. */
const CSV =
  '﻿"Pedido";"Cliente";"Dirección";"Total (COP)"\r\n' +
  '"MZ-7KQ2R9DA";"José ""Pepe"" Muñoz; Ñandú";"Cra 7\nApto 501";1450000\r\n' +
  '"MZ-8ABCDEFG";"\'=HYPERLINK(""http://x"")";"\'+57 300";99000\r\n' +
  '"MZ-9ABCDEFG";"\'-1";"\'@SUM(A1)";1\r\n';
const BYTES = new TextEncoder().encode(CSV);

function request(search: string, cookie = true): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set('cookie', `${SESSION_COOKIE_NAME}=${MATERIAL}`);
  return new NextRequest(`https://panel.example.invalid/api/admin/orders/export${search}`, {
    headers,
  });
}

function file(
  disposition: string | null = 'attachment; filename="pedidos-modulartess-2026-10-23.csv"',
) {
  return {
    kind: 'file' as const,
    bytes: BYTES.buffer.slice(0),
    contentDisposition: disposition,
    count: '3',
  };
}

beforeEach(() => {
  exportOrders.mockReset();
  exportOrders.mockResolvedValue(file());
});

describe('GET /api/admin/orders/export', () => {
  it('reenvía el CSV del backend byte a byte, como descarga y sin caché', async () => {
    const response = await GET(request(''));

    expect(response.status).toBe(200);
    expect(exportOrders).toHaveBeenCalledWith(MATERIAL, null);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="pedidos-modulartess-2026-10-23.csv"',
    );
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-order-export-count')).toBe('3');

    const received = new Uint8Array(await response.arrayBuffer());
    expect(received).toEqual(BYTES);
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(received);
    expect(text.startsWith('﻿')).toBe(true);
    expect(text).toContain('"José ""Pepe"" Muñoz; Ñandú"');
    expect(text).toContain('"Cra 7\nApto 501"');
    // Ninguna celda de texto empieza por un disparador de fórmula.
    expect(text).not.toMatch(/(^|;|\r\n)"[=+\-@]/);
  });

  it('propaga solo el estado: la cantidad por página no limita la exportación', async () => {
    for (const size of [10, 20, 50, 100]) {
      exportOrders.mockClear();
      await GET(request(`?status=paid&page=3&pageSize=${size}`));
      expect(exportOrders).toHaveBeenCalledWith(MATERIAL, 'paid');
    }
  });

  it('sin coincidencias responde 204 sin cuerpo', async () => {
    exportOrders.mockResolvedValue({ kind: 'empty' });

    const response = await GET(request('?status=shipped'));

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get('content-disposition')).toBeNull();
  });

  it('rechaza un estado mal formado en lugar de exportarlo todo', async () => {
    for (const status of ['PAID', 'paid%20', '1', 'pa-id']) {
      const response = await GET(request(`?status=${status}`));
      expect(response.status).toBe(400);
    }
    expect(exportOrders).not.toHaveBeenCalled();
  });

  it('sustituye un nombre de archivo que no tenga la forma esperada', async () => {
    exportOrders.mockResolvedValue(file('attachment; filename="../../etc/passwd"'));

    const response = await GET(request('?status=paid'));

    expect(response.headers.get('content-disposition')).toMatch(
      /^attachment; filename="pedidos-modulartess-estado-paid-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
  });

  it('sin cookie de sesión no llama al backend', async () => {
    const response = await GET(request('?status=paid', false));

    expect(response.status).toBe(401);
    expect(exportOrders).not.toHaveBeenCalled();
  });

  it('un rechazo de permiso del backend responde 403', async () => {
    exportOrders.mockRejectedValue(new BackendFailure('backend_forbidden'));

    const response = await GET(request(''));

    expect(response.status).toBe(403);
  });

  it('demasiados pedidos responde 422 con un texto fijo que pide filtrar', async () => {
    exportOrders.mockRejectedValue(new BackendFailure('backend_order_export_too_large'));

    const response = await GET(request(''));
    const body = (await response.json()) as { code: string; message: string };

    expect(response.status).toBe(422);
    expect(body.code).toBe('export_too_large');
    expect(body.message).toMatch(/Filtra por estado/);
  });

  it('traduce un fallo del backend sin propagar su texto', async () => {
    exportOrders.mockRejectedValue(new BackendFailure('backend_unavailable'));

    const response = await GET(request(''));
    const body = (await response.json()) as { code: string; message: string };

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(body.message).not.toMatch(/backend/i);
  });
});
