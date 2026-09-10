import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  endAdminSession,
  exchangeIdTokenForSession,
  SESSION_CREATED_STATUS,
  SESSION_DELETED_STATUS,
  SESSION_ENDPOINT,
} from './exchange-session';

const FAKE_TOKEN = 'a'.repeat(64);

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('el canje exige un 201 exacto', () => {
  it('acepta 201', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ principal: {} }), { status: 201 }));

    await expect(exchangeIdTokenForSession(FAKE_TOKEN)).resolves.toEqual({ ok: true });
  });

  it.each([200, 202, 204, 205, 226])(
    'rechaza el 2xx %i, que response.ok habría aceptado',
    async (status) => {
      fetchMock.mockResolvedValue(new Response(null, { status }));

      const result = await exchangeIdTokenForSession(FAKE_TOKEN);

      // La premisa: `response.ok` es true para todos estos.
      expect(new Response(null, { status }).ok).toBe(true);
      expect(result).toEqual({ ok: false, code: 'unexpected_status' });
    },
  );

  it('lee el código estable de una respuesta de error', async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, { code: 'admin_role_required', message: 'x' }));

    await expect(exchangeIdTokenForSession(FAKE_TOKEN)).resolves.toEqual({
      ok: false,
      code: 'admin_role_required',
    });
  });

  it('cae a un código genérico si el error no trae uno utilizable', async () => {
    fetchMock.mockResolvedValue(new Response('no es json', { status: 500 }));

    await expect(exchangeIdTokenForSession(FAKE_TOKEN)).resolves.toEqual({
      ok: false,
      code: 'internal_error',
    });
  });

  it('distingue el fallo de red', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(exchangeIdTokenForSession(FAKE_TOKEN)).resolves.toEqual({
      ok: false,
      code: 'service_unavailable',
    });
  });

  it('llama solo a la ruta local del BFF, con no-store y same-origin', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));

    await exchangeIdTokenForSession(FAKE_TOKEN);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe(SESSION_ENDPOINT);
    expect(init.method).toBe('POST');
    expect(init.cache).toBe('no-store');
    expect(init.credentials).toBe('same-origin');
  });

  it('el resultado nunca contiene el ID token', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { code: 'invalid_request', token: FAKE_TOKEN }));

    const result = await exchangeIdTokenForSession(FAKE_TOKEN);

    expect(JSON.stringify(result)).not.toContain(FAKE_TOKEN);
  });
});

describe('el cierre de sesión exige un 204 exacto', () => {
  it('acepta 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(endAdminSession()).resolves.toEqual({ ok: true });
  });

  it.each([200, 201, 202, 205])(
    'rechaza el 2xx %i, que response.ok habría aceptado',
    async (status) => {
      fetchMock.mockResolvedValue(new Response(null, { status }));

      await expect(endAdminSession()).resolves.toEqual({
        ok: false,
        reason: 'unexpected_status',
      });
    },
  );

  it.each([403, 500, 503])('rechaza el estado de error %i', async (status) => {
    fetchMock.mockResolvedValue(new Response(null, { status }));

    await expect(endAdminSession()).resolves.toEqual({ ok: false, reason: 'unexpected_status' });
  });

  it('distingue el fallo de red de un estado inesperado', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(endAdminSession()).resolves.toEqual({ ok: false, reason: 'network' });
  });

  it('ya no ignora los errores: nunca devuelve undefined', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));

    const result = await endAdminSession();

    expect(result).not.toBeUndefined();
    expect(result.ok).toBe(false);
  });

  it('usa DELETE contra la ruta local, con no-store', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await endAdminSession();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe(SESSION_ENDPOINT);
    expect(init.method).toBe('DELETE');
    expect(init.cache).toBe('no-store');
  });
});

describe('estados exactos del contrato del BFF', () => {
  it('son 201 y 204', () => {
    expect([SESSION_CREATED_STATUS, SESSION_DELETED_STATUS]).toEqual([201, 204]);
  });
});
