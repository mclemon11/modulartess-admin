import { NextRequest } from 'next/server';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE_NAME } from '@/features/session/session-cookie';
import { BackendFailure } from '@/lib/api/errors';

/** El cliente del backend se sustituye por dobles: ninguna prueba abre red. */
const createAdminSession = vi.fn();
const verifyAdminSession = vi.fn();

vi.mock('@/lib/api/backend-client', () => ({
  createAdminSession: (...args: unknown[]) => createAdminSession(...args),
  verifyAdminSession: (...args: unknown[]) => verifyAdminSession(...args),
}));

const { DELETE, GET, POST } = await import('./route');

const ALLOWED_ORIGIN = 'https://panel.example.invalid';
const FAKE_TOKEN = 'a'.repeat(64);
const FAKE_MATERIAL = 'material-de-sesion-opaco';

/** Configuración de forma válida y deliberadamente falsa. */
function setEnv(): void {
  process.env.MODULARTESS_BACKEND_URL = 'https://backend.example.invalid';
  process.env.MODULARTESS_BACKEND_AUTH_MODE = 'google-oidc';
  process.env.MODULARTESS_BACKEND_AUDIENCE = 'https://backend.example.invalid';
  process.env.MODULARTESS_ADMIN_ORIGIN = ALLOWED_ORIGIN;
}

function postRequest(options?: {
  readonly origin?: string | null;
  readonly contentType?: string | null;
  readonly body?: string;
}): NextRequest {
  const headers = new Headers();

  if (options?.origin !== null) {
    headers.set('origin', options?.origin ?? ALLOWED_ORIGIN);
  }

  if (options?.contentType !== null) {
    headers.set('content-type', options?.contentType ?? 'application/json');
  }

  return new NextRequest('https://panel.example.invalid/api/admin/auth/session', {
    method: 'POST',
    headers,
    body: options?.body ?? JSON.stringify({ idToken: FAKE_TOKEN }),
  });
}

function getRequest(material?: string): NextRequest {
  const request = new NextRequest('https://panel.example.invalid/api/admin/auth/session');

  if (material !== undefined) {
    request.cookies.set(SESSION_COOKIE_NAME, material);
  }

  return request;
}

function deleteRequest(origin?: string | null): NextRequest {
  const headers = new Headers();

  if (origin !== null) {
    headers.set('origin', origin ?? ALLOWED_ORIGIN);
  }

  return new NextRequest('https://panel.example.invalid/api/admin/auth/session', {
    method: 'DELETE',
    headers,
  });
}

/** Lee la cookie de sesión del `Set-Cookie` de la respuesta. */
function sessionCookie(response: Response) {
  return response.headers
    .getSetCookie()
    .map((raw) => raw.trim())
    .find((raw) => raw.startsWith(`${SESSION_COOKIE_NAME}=`));
}

const SUCCESSFUL_SESSION = {
  principal: { uid: 'uid-de-prueba', role: 'super_admin' },
  expiresAt: '2026-09-11T00:00:00.000Z',
  sessionMaterial: FAKE_MATERIAL,
  maxAgeSeconds: 28_800,
};

beforeEach(() => {
  setEnv();
  createAdminSession.mockReset();
  verifyAdminSession.mockReset();
});

afterEach(() => {
  delete process.env.MODULARTESS_BACKEND_URL;
  delete process.env.MODULARTESS_BACKEND_AUTH_MODE;
  delete process.env.MODULARTESS_BACKEND_AUDIENCE;
  delete process.env.MODULARTESS_ADMIN_ORIGIN;
});

describe('POST · validación de Origin', () => {
  it('rechaza un Origin ausente', async () => {
    const response = await POST(postRequest({ origin: null }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'invalid_origin' });
    expect(createAdminSession).not.toHaveBeenCalled();
  });

  it.each([
    ['distinto', 'https://atacante.example.invalid'],
    ['con sufijo engañoso', 'https://panel.example.invalid.atacante.tld'],
    ['con esquema distinto', 'http://panel.example.invalid'],
    ['con puerto distinto', 'https://panel.example.invalid:8443'],
  ])('rechaza un Origin %s', async (_label, origin) => {
    const response = await POST(postRequest({ origin }));

    expect(response.status).toBe(403);
    expect(createAdminSession).not.toHaveBeenCalled();
  });

  it.each([
    ['null literal', 'null'],
    ['sin esquema', 'panel.example.invalid'],
    ['basura', '???'],
  ])('rechaza un Origin malformado (%s)', async (_label, origin) => {
    const response = await POST(postRequest({ origin }));

    expect(response.status).toBe(403);
    expect(createAdminSession).not.toHaveBeenCalled();
  });
});

describe('POST · validación del cuerpo', () => {
  it.each([
    ['ausente', null],
    ['texto plano', 'text/plain'],
    ['formulario', 'application/x-www-form-urlencoded'],
  ])('rechaza un content-type %s', async (_label, contentType) => {
    const response = await POST(postRequest({ contentType }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'invalid_request' });
    expect(createAdminSession).not.toHaveBeenCalled();
  });

  it.each([
    ['JSON inválido', '{'],
    ['cuerpo vacío', ''],
    ['objeto vacío', '{}'],
    ['campo mal nombrado', '{"id_token":"' + FAKE_TOKEN + '"}'],
    ['campo adicional', '{"idToken":"' + FAKE_TOKEN + '","role":"super_admin"}'],
    ['idToken corto', '{"idToken":"corto"}'],
    ['idToken no string', '{"idToken":123}'],
    ['array', '[]'],
  ])('rechaza %s', async (_label, body) => {
    const response = await POST(postRequest({ body }));

    expect(response.status).toBe(400);
    expect(createAdminSession).not.toHaveBeenCalled();
  });

  it('rechaza un cuerpo desproporcionado sin llamar al backend', async () => {
    const response = await POST(
      postRequest({ body: JSON.stringify({ idToken: 'a'.repeat(20_000) }) }),
    );

    expect(response.status).toBe(400);
    expect(createAdminSession).not.toHaveBeenCalled();
  });
});

describe('POST · éxito', () => {
  it('crea la cookie con los atributos exactos', async () => {
    createAdminSession.mockResolvedValue(SUCCESSFUL_SESSION);

    const response = await POST(postRequest());
    const cookie = sessionCookie(response);

    expect(response.status).toBe(201);
    expect(cookie).toBeDefined();
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=${FAKE_MATERIAL}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).not.toMatch(/Domain=/i);
    expect(cookie).toMatch(/Max-Age=28800/i);
  });

  it('devuelve solo principal y expiresAt', async () => {
    createAdminSession.mockResolvedValue(SUCCESSFUL_SESSION);

    const body = await (await POST(postRequest())).json();

    expect(Object.keys(body).sort()).toEqual(['expiresAt', 'principal']);
    expect(body.principal).toEqual({ uid: 'uid-de-prueba', role: 'super_admin' });
  });

  it('nunca filtra el ID token ni el material de sesión en el cuerpo', async () => {
    createAdminSession.mockResolvedValue(SUCCESSFUL_SESSION);

    const serialized = await (await POST(postRequest())).text();

    expect(serialized).not.toContain(FAKE_TOKEN);
    expect(serialized).not.toContain(FAKE_MATERIAL);
    expect(serialized).not.toContain('sessionMaterial');
  });

  it('no expone el encabezado interno al navegador', async () => {
    createAdminSession.mockResolvedValue(SUCCESSFUL_SESSION);

    const response = await POST(postRequest());

    expect(response.headers.get('x-modulartess-admin-session')).toBeNull();
    expect(response.headers.get('authorization')).toBeNull();
  });

  it('reenvía al backend exactamente el idToken recibido', async () => {
    createAdminSession.mockResolvedValue(SUCCESSFUL_SESSION);

    await POST(postRequest());

    expect(createAdminSession).toHaveBeenCalledWith(FAKE_TOKEN);
  });
});

describe('POST · fallos del backend', () => {
  it.each([
    ['backend_unauthorized', 401, 'session_required'],
    ['backend_forbidden', 403, 'admin_role_required'],
    ['backend_surface_disabled', 503, 'admin_surface_disabled'],
    ['backend_rate_limited', 429, 'too_many_requests'],
    ['backend_unavailable', 503, 'service_unavailable'],
    ['backend_contract_violation', 500, 'internal_error'],
    ['backend_misconfigured', 500, 'internal_error'],
  ] as const)('traduce %s a %i %s', async (failure, status, code) => {
    createAdminSession.mockRejectedValue(new BackendFailure(failure));

    const response = await POST(postRequest());

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ code });
  });

  it('no crea cookie cuando el backend incumple el contrato', async () => {
    createAdminSession.mockRejectedValue(new BackendFailure('backend_contract_violation'));

    const response = await POST(postRequest());

    expect(sessionCookie(response)).toBeUndefined();
  });

  it('no propaga el mensaje de un error inesperado', async () => {
    createAdminSession.mockRejectedValue(new Error('uid=abc correo@example.invalid audiencia=x'));

    const response = await POST(postRequest());
    const serialized = await response.text();

    expect(response.status).toBe(500);
    expect(serialized).not.toContain('uid=');
    expect(serialized).not.toContain('@example.invalid');
    expect(serialized).not.toContain('audiencia');
  });
});

describe('GET', () => {
  it('responde 401 controlado sin cookie', async () => {
    const response = await GET(getRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: 'session_required' });
    expect(verifyAdminSession).not.toHaveBeenCalled();
  });

  it('responde 401 con una cookie vacía', async () => {
    const response = await GET(getRequest(''));

    expect(response.status).toBe(401);
    expect(verifyAdminSession).not.toHaveBeenCalled();
  });

  it('reenvía el material de la cookie al cliente del backend', async () => {
    verifyAdminSession.mockResolvedValue({ uid: 'uid-de-prueba', role: 'super_admin' });

    await GET(getRequest(FAKE_MATERIAL));

    expect(verifyAdminSession).toHaveBeenCalledWith(FAKE_MATERIAL);
  });

  it('devuelve únicamente el principal verificado', async () => {
    verifyAdminSession.mockResolvedValue({ uid: 'uid-de-prueba', role: 'super_admin' });

    const response = await GET(getRequest(FAKE_MATERIAL));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Object.keys(body)).toEqual(['principal']);
    expect(await (await GET(getRequest(FAKE_MATERIAL))).text()).not.toContain(FAKE_MATERIAL);
  });

  it('no renueva ni rota la sesión: no reescribe la cookie', async () => {
    verifyAdminSession.mockResolvedValue({ uid: 'uid-de-prueba', role: 'super_admin' });

    const response = await GET(getRequest(FAKE_MATERIAL));

    expect(sessionCookie(response)).toBeUndefined();
  });

  it('traduce 401 y 403 a códigos estables', async () => {
    verifyAdminSession.mockRejectedValue(new BackendFailure('backend_unauthorized'));
    await expect((await GET(getRequest(FAKE_MATERIAL))).json()).resolves.toMatchObject({
      code: 'session_required',
    });

    verifyAdminSession.mockRejectedValue(new BackendFailure('backend_forbidden'));
    await expect((await GET(getRequest(FAKE_MATERIAL))).json()).resolves.toMatchObject({
      code: 'admin_role_required',
    });
  });
});

describe('GET es de solo lectura: no muta nunca', () => {
  it.each([
    'backend_unauthorized',
    'backend_forbidden',
    'backend_unavailable',
    'backend_surface_disabled',
    'backend_rate_limited',
    'backend_contract_violation',
    'backend_misconfigured',
    'backend_unexpected',
  ] as const)('no emite Set-Cookie ante %s', async (failure) => {
    verifyAdminSession.mockRejectedValue(new BackendFailure(failure));

    const response = await GET(getRequest(FAKE_MATERIAL));

    // Borrar la cookie es una mutación; corresponde al DELETE, no a esta ruta.
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it('no emite Set-Cookie en el éxito', async () => {
    verifyAdminSession.mockResolvedValue({ uid: 'uid-de-prueba', role: 'super_admin' });

    expect((await GET(getRequest(FAKE_MATERIAL))).headers.getSetCookie()).toEqual([]);
  });

  it('no emite Set-Cookie cuando falta la cookie', async () => {
    expect((await GET(getRequest())).headers.getSetCookie()).toEqual([]);
  });

  it('no emite Set-Cookie ante un error inesperado', async () => {
    verifyAdminSession.mockRejectedValue(new Error('fallo cualquiera'));

    expect((await GET(getRequest(FAKE_MATERIAL))).headers.getSetCookie()).toEqual([]);
  });
});

describe('DELETE', () => {
  it('rechaza un Origin ausente', async () => {
    const response = await DELETE(deleteRequest(null));

    expect(response.status).toBe(403);
    expect(sessionCookie(response)).toBeUndefined();
  });

  it('rechaza un Origin distinto', async () => {
    const response = await DELETE(deleteRequest('https://atacante.example.invalid'));

    expect(response.status).toBe(403);
  });

  it('responde 204 y borra la cookie con los mismos atributos', async () => {
    const response = await DELETE(deleteRequest());
    const cookie = sessionCookie(response);

    expect(response.status).toBe(204);
    expect(cookie).toMatch(/Max-Age=0/i);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it('no llama al backend: el contrato no publica un DELETE', async () => {
    await DELETE(deleteRequest());

    expect(createAdminSession).not.toHaveBeenCalled();
    expect(verifyAdminSession).not.toHaveBeenCalled();
  });
});

describe('DELETE no depende de la configuración del backend', () => {
  it.each([
    'MODULARTESS_BACKEND_URL',
    'MODULARTESS_BACKEND_AUTH_MODE',
    'MODULARTESS_BACKEND_AUDIENCE',
  ])('cierra la sesión aunque falte %s', async (variable) => {
    delete process.env[variable];

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(204);
    expect(sessionCookie(response)).toMatch(/Max-Age=0/i);
  });

  it('cierra la sesión sin ninguna variable del backend, solo con el origen', async () => {
    delete process.env.MODULARTESS_BACKEND_URL;
    delete process.env.MODULARTESS_BACKEND_AUTH_MODE;
    delete process.env.MODULARTESS_BACKEND_AUDIENCE;

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(204);
    expect(sessionCookie(response)).toMatch(/HttpOnly/i);
    expect(sessionCookie(response)).toMatch(/SameSite=Strict/i);
  });

  it('sigue validando Origin sin la configuración del backend', async () => {
    delete process.env.MODULARTESS_BACKEND_URL;
    delete process.env.MODULARTESS_BACKEND_AUTH_MODE;
    delete process.env.MODULARTESS_BACKEND_AUDIENCE;

    expect((await DELETE(deleteRequest('https://atacante.example.invalid'))).status).toBe(403);
  });

  it('falla de forma controlada si falta el propio origen autorizado', async () => {
    delete process.env.MODULARTESS_ADMIN_ORIGIN;

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('MODULARTESS');
  });
});

describe('POST · tamaño medido en bytes UTF-8', () => {
  it('rechaza un cuerpo con menos caracteres que el límite pero más bytes', async () => {
    // Cada emoji ocupa 4 bytes en UTF-8 y 2 unidades UTF-16.
    const multibyte = '😀'.repeat(3000);
    const body = JSON.stringify({ idToken: multibyte });

    // La premisa: `raw.length` no habría detectado el exceso.
    expect(body.length).toBeLessThan(8192);

    const request = new NextRequest('https://panel.example.invalid/api/admin/auth/session', {
      method: 'POST',
      headers: new Headers({ origin: ALLOWED_ORIGIN, 'content-type': 'application/json' }),
      body,
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(createAdminSession).not.toHaveBeenCalled();
  });

  it('acepta un cuerpo multibyte que sí cabe en bytes', async () => {
    createAdminSession.mockResolvedValue(SUCCESSFUL_SESSION);

    const response = await POST(postRequest({ body: JSON.stringify({ idToken: 'ñ'.repeat(64) }) }));

    expect(response.status).toBe(201);
  });
});

describe('Cache-Control: no-store en todas las respuestas', () => {
  it('en el éxito del POST', async () => {
    createAdminSession.mockResolvedValue(SUCCESSFUL_SESSION);

    expect((await POST(postRequest())).headers.get('cache-control')).toBe('no-store');
  });

  it('en los errores del POST', async () => {
    expect((await POST(postRequest({ origin: null }))).headers.get('cache-control')).toBe(
      'no-store',
    );
    expect(
      (await POST(postRequest({ contentType: 'text/plain' }))).headers.get('cache-control'),
    ).toBe('no-store');
  });

  it('en el éxito del GET', async () => {
    verifyAdminSession.mockResolvedValue({ uid: 'uid-de-prueba', role: 'super_admin' });

    expect((await GET(getRequest(FAKE_MATERIAL))).headers.get('cache-control')).toBe('no-store');
  });

  it('en el 401 del GET', async () => {
    expect((await GET(getRequest())).headers.get('cache-control')).toBe('no-store');
  });

  it('en el DELETE, con éxito y con Origin rechazado', async () => {
    expect((await DELETE(deleteRequest())).headers.get('cache-control')).toBe('no-store');
    expect((await DELETE(deleteRequest(null))).headers.get('cache-control')).toBe('no-store');
  });
});

describe('configuración ausente', () => {
  it('sin el origen autorizado, POST falla de forma controlada sin nombrar variables', async () => {
    delete process.env.MODULARTESS_ADMIN_ORIGIN;

    const response = await POST(postRequest());
    const serialized = await response.text();

    expect(response.status).toBe(500);
    expect(serialized).not.toContain('MODULARTESS');
    expect(createAdminSession).not.toHaveBeenCalled();
  });

  it('la validación de Origin no depende de la configuración del backend', async () => {
    delete process.env.MODULARTESS_BACKEND_URL;
    delete process.env.MODULARTESS_BACKEND_AUDIENCE;
    createAdminSession.mockResolvedValue(SUCCESSFUL_SESSION);

    // El Origin sigue validándose y el flujo llega al cliente del backend, que es quien exige el
    // resto de la configuración.
    expect((await POST(postRequest({ origin: 'https://atacante.example.invalid' }))).status).toBe(
      403,
    );
    expect(createAdminSession).not.toHaveBeenCalled();
  });
});
