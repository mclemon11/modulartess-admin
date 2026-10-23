import { describe, expect, it, vi } from 'vitest';

import {
  EXPORT_FAILED_MESSAGE,
  exportDoneMessage,
  exportEmptyMessage,
  exportFilenameFromDisposition,
  requestOrderExport,
} from './order-export';

/**
 * La exportación del lado del navegador: una única petición al BFF por el filtro activo, y un
 * desenlace cerrado. El navegador no recibe páginas de pedidos: recibe un archivo.
 */

function fetcher(response: Response | Error) {
  return vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe('requestOrderExport', () => {
  it('pide una sola vez el filtro activo, sin página ni tamaño', async () => {
    const fake = fetcher(new Response(null, { status: 204 }));

    await requestOrderExport('ready_to_ship', fake);
    await requestOrderExport(null, fake);

    expect(fake.mock.calls.map(([url]) => url)).toEqual([
      '/api/admin/orders/export?status=ready_to_ship',
      '/api/admin/orders/export',
    ]);
  });

  it('devuelve el archivo con el nombre del backend y el recuento', async () => {
    const csv = '﻿"Pedido";"Cliente"\r\n"MZ-1";"José ""Pepe""; Ñandú"\r\n';
    const outcome = await requestOrderExport(
      'paid',
      fetcher(
        new Response(csv, {
          status: 200,
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition':
              'attachment; filename="pedidos-modulartess-estado-pedido-confirmado-2026-10-23.csv"',
            'x-order-export-count': '1',
          },
        }),
      ),
    );

    expect(outcome).toMatchObject({
      kind: 'file',
      filename: 'pedidos-modulartess-estado-pedido-confirmado-2026-10-23.csv',
      count: 1,
    });
    if (outcome.kind !== 'file') throw new Error('se esperaba un archivo');
    // Los bytes no se reinterpretan: tildes, comillas y BOM llegan tal cual.
    const bytes = new Uint8Array(await outcome.blob.arrayBuffer());
    expect(bytes).toEqual(new TextEncoder().encode(csv));
  });

  it('204 o un cuerpo vacío son «no hay pedidos», nunca un archivo vacío', async () => {
    await expect(
      requestOrderExport(null, fetcher(new Response(null, { status: 204 }))),
    ).resolves.toEqual({ kind: 'empty' });
    await expect(
      requestOrderExport(null, fetcher(new Response('', { status: 200 }))),
    ).resolves.toEqual({ kind: 'empty' });
  });

  it('un error usa el texto fijo del BFF o, sin él, uno genérico', async () => {
    await expect(
      requestOrderExport(
        null,
        fetcher(
          Response.json(
            { code: 'export_too_large', message: 'Hay demasiados pedidos.' },
            { status: 422 },
          ),
        ),
      ),
    ).resolves.toEqual({ kind: 'error', message: 'Hay demasiados pedidos.' });
    await expect(
      requestOrderExport(null, fetcher(new Response('<html>', { status: 502 }))),
    ).resolves.toEqual({ kind: 'error', message: EXPORT_FAILED_MESSAGE });
    await expect(requestOrderExport(null, fetcher(new Error('offline')))).resolves.toEqual({
      kind: 'error',
      message: EXPORT_FAILED_MESSAGE,
    });
  });
});

describe('nombre y mensajes', () => {
  const now = new Date('2026-10-24T03:00:00.000Z');

  it('usa el día de Colombia cuando el nombre del backend no tiene la forma esperada', () => {
    expect(exportFilenameFromDisposition(null, null, now)).toBe(
      'pedidos-modulartess-2026-10-23.csv',
    );
    expect(
      exportFilenameFromDisposition('attachment; filename="x.csv"', 'ready_to_ship', now),
    ).toBe('pedidos-modulartess-estado-ready-to-ship-2026-10-23.csv');
  });

  it('cuenta los pedidos exportados y explica la exportación vacía', () => {
    expect(exportDoneMessage(1)).toBe('Se exportó 1 pedido.');
    expect(exportDoneMessage(1234)).toBe('Se exportaron 1.234 pedidos.');
    expect(exportDoneMessage(null)).toBe('Exportación lista.');
    expect(exportEmptyMessage(true)).toMatch(/con este estado/);
    expect(exportEmptyMessage(false)).toMatch(/No se descargó ningún archivo/);
  });
});
