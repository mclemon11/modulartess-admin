import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cancelOrder, changeOrderStatus, simulateOrderPayment } from './orders-client';

/**
 * La frontera del navegador hacia el BFF.
 *
 * Dos cosas se comprueban aquí y las dos importan. La primera: el navegador habla **solo** con
 * rutas locales, con la cookie del mismo origen y sin caché. La segunda, y es la que puede costar
 * dinero: distinguir un rechazo definitivo de un resultado que no se llegó a conocer. Afirmar «no
 * se aplicó» sobre algo que sí se aplicó lleva a repetirlo.
 */

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function lastCall(): { readonly url: string; readonly init: RequestInit } {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];

  return { url, init };
}

describe('a dónde llama el navegador', () => {
  it.each([
    ['estado', () => changeOrderStatus('ord_abc', 'preparing', 3), '/status'],
    ['cancelación', () => cancelOrder('ord_abc', 3), '/cancel'],
    [
      'simulación',
      () => simulateOrderPayment('ord_abc', 'approved', 3, 'evt-0000-0001'),
      '/payment-simulation',
    ],
  ])('la %s va a la ruta local del BFF', async (_case, run, suffix) => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 'ord_abc' }));

    await run();

    const { url, init } = lastCall();

    expect(url).toBe(`/api/admin/orders/ord_abc${suffix}`);
    expect(url).not.toContain('http');
    expect(init.credentials).toBe('same-origin');
    expect(init.cache).toBe('no-store');
  });

  it('el identificador del pedido se codifica antes de entrar en la URL', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await cancelOrder('ord/../otro', 1);

    expect(lastCall().url).toBe('/api/admin/orders/ord%2F..%2Fotro/cancel');
  });

  it('la simulación envía el evento, la versión y el identificador idempotente', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await simulateOrderPayment('ord_abc', 'approved', 7, 'evt-0000-0001');

    expect(JSON.parse(String(lastCall().init.body))).toEqual({
      event: 'approved',
      expectedVersion: 7,
      eventId: 'evt-0000-0001',
    });
  });
});

describe('respuesta correcta', () => {
  it('devuelve el pedido autoritativo tal cual', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 'ord_abc', version: 4 }));

    const result = await simulateOrderPayment('ord_abc', 'approved', 3, 'evt-0000-0001');

    expect(result).toEqual({ ok: true, data: { id: 'ord_abc', version: 4 } });
  });
});

describe('rechazos definitivos del contrato', () => {
  /*
   * Un código del contrato es una respuesta: el backend recibió la petición y la rechazó. Repetirla
   * con el mismo identificador no cambiaría nada, así que la operación puede cerrarse.
   */
  it.each([
    [400, 'invalid_request'],
    [401, 'session_required'],
    [403, 'admin_role_required'],
    [404, 'simulator_disabled'],
    [409, 'version_conflict'],
    [409, 'payment_transition_invalid'],
    [409, 'payment_conflict'],
  ])('%i %s no deja nada en el aire', async (status, code) => {
    fetchMock.mockResolvedValue(jsonResponse(status, { code, message: 'da igual' }));

    const result = await simulateOrderPayment('ord_abc', 'approved', 3, 'evt-0000-0001');

    expect(result).toEqual({ ok: false, code, ambiguous: false });
  });
});

describe('resultados que no se llegan a conocer', () => {
  /* La petición salió y nunca se supo qué pasó con ella. Pudo haberse aplicado. */
  it('un corte de red es ambiguo, no un fallo', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await simulateOrderPayment('ord_abc', 'approved', 3, 'evt-0000-0001');

    expect(result).toMatchObject({ ok: false, code: 'service_unavailable', ambiguous: true });
  });

  it('un 503 del servicio también es ambiguo', async () => {
    fetchMock.mockResolvedValue(jsonResponse(503, { code: 'service_unavailable', message: '' }));

    const result = await simulateOrderPayment('ord_abc', 'approved', 3, 'evt-0000-0001');

    expect(result).toMatchObject({ ambiguous: true });
  });

  it('un cuerpo ilegible es ambiguo', async () => {
    fetchMock.mockResolvedValue(new Response('<html>502</html>', { status: 502 }));

    const result = await simulateOrderPayment('ord_abc', 'approved', 3, 'evt-0000-0001');

    expect(result).toMatchObject({ ok: false, code: 'internal_error', ambiguous: true });
  });

  it('un 200 con cuerpo roto no se da por aplicado ni por fallido', async () => {
    fetchMock.mockResolvedValue(new Response('no es json', { status: 200 }));

    const result = await simulateOrderPayment('ord_abc', 'approved', 3, 'evt-0000-0001');

    expect(result).toMatchObject({ ok: false, ambiguous: true });
  });
});

describe('qué no se filtra', () => {
  it('no propaga el mensaje del backend, solo su código', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, {
        code: 'payment_conflict',
        message: 'conflicto en https://backend.interno.invalid',
      }),
    );

    const result = await simulateOrderPayment('ord_abc', 'approved', 3, 'evt-0000-0001');

    expect(JSON.stringify(result)).not.toContain('backend.interno.invalid');
  });
});
