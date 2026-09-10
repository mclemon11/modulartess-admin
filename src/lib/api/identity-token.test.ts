import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `google-auth-library` se sustituye por un doble: ninguna prueba consulta el servidor de
 * metadatos ni usa credenciales.
 */
const getIdTokenClient = vi.fn();

vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    getIdTokenClient(audience: string) {
      return getIdTokenClient(audience);
    }
  },
}));

const { getIamAuthorizationHeader, resetIdentityTokenCache } = await import('./identity-token');
const { BackendFailure } = await import('./errors');

const AUDIENCE = 'https://backend.example.invalid';
const OTHER_AUDIENCE = 'https://otro-backend.example.invalid';

/** Cliente falso que devuelve un encabezado de forma correcta y contenido inventado. */
function fakeClient(token = 'identity-token-de-prueba') {
  return {
    getRequestHeaders: vi.fn(async () => new Headers({ authorization: `Bearer ${token}` })),
  };
}

beforeEach(() => {
  resetIdentityTokenCache();
  getIdTokenClient.mockReset();
});

describe('obtención del encabezado IAM', () => {
  it('devuelve el Authorization completo', async () => {
    getIdTokenClient.mockResolvedValue(fakeClient());

    await expect(getIamAuthorizationHeader(AUDIENCE)).resolves.toBe(
      'Bearer identity-token-de-prueba',
    );
  });

  it('pide el token para la audiencia solicitada', async () => {
    getIdTokenClient.mockResolvedValue(fakeClient());

    await getIamAuthorizationHeader(AUDIENCE);

    expect(getIdTokenClient).toHaveBeenCalledWith(AUDIENCE);
  });

  it('falla de forma controlada si el encabezado viene vacío', async () => {
    getIdTokenClient.mockResolvedValue({
      getRequestHeaders: vi.fn(async () => new Headers()),
    });

    await expect(getIamAuthorizationHeader(AUDIENCE)).rejects.toMatchObject({
      code: 'backend_misconfigured',
    });
  });
});

describe('caché por audiencia', () => {
  it('construye el cliente una sola vez para la misma audiencia', async () => {
    getIdTokenClient.mockResolvedValue(fakeClient());

    await getIamAuthorizationHeader(AUDIENCE);
    await getIamAuthorizationHeader(AUDIENCE);
    await getIamAuthorizationHeader(AUDIENCE);

    expect(getIdTokenClient).toHaveBeenCalledTimes(1);
  });

  it('comparte una sola construcción entre llamadas simultáneas', async () => {
    getIdTokenClient.mockResolvedValue(fakeClient());

    await Promise.all([
      getIamAuthorizationHeader(AUDIENCE),
      getIamAuthorizationHeader(AUDIENCE),
      getIamAuthorizationHeader(AUDIENCE),
    ]);

    expect(getIdTokenClient).toHaveBeenCalledTimes(1);
  });

  it('mantiene entradas separadas por audiencia', async () => {
    getIdTokenClient.mockResolvedValue(fakeClient());

    await getIamAuthorizationHeader(AUDIENCE);
    await getIamAuthorizationHeader(OTHER_AUDIENCE);

    expect(getIdTokenClient).toHaveBeenCalledTimes(2);
    expect(getIdTokenClient).toHaveBeenNthCalledWith(1, AUDIENCE);
    expect(getIdTokenClient).toHaveBeenNthCalledWith(2, OTHER_AUDIENCE);
  });
});

describe('recuperación tras un fallo', () => {
  it('retira la promesa fallida y permite reintentar', async () => {
    getIdTokenClient.mockRejectedValueOnce(new Error('metadata no disponible'));

    await expect(getIamAuthorizationHeader(AUDIENCE)).rejects.toBeInstanceOf(BackendFailure);

    // La audiencia no queda envenenada: el segundo intento vuelve a construir el cliente.
    getIdTokenClient.mockResolvedValue(fakeClient('token-tras-reintento'));

    await expect(getIamAuthorizationHeader(AUDIENCE)).resolves.toBe('Bearer token-tras-reintento');
    expect(getIdTokenClient).toHaveBeenCalledTimes(2);
  });

  it('traduce el fallo a un error interno estable', async () => {
    getIdTokenClient.mockRejectedValue(new Error('audiencia https://real.invalid rechazada'));

    await expect(getIamAuthorizationHeader(AUDIENCE)).rejects.toMatchObject({
      code: 'backend_unavailable',
    });
  });

  it('no filtra la audiencia ni el mensaje original en el error', async () => {
    getIdTokenClient.mockRejectedValue(
      new Error('audiencia https://secreto.invalid rechazada uid=abc'),
    );

    const error = await getIamAuthorizationHeader(AUDIENCE).catch((caught: unknown) => caught);

    expect(String(error)).not.toContain('secreto.invalid');
    expect(String(error)).not.toContain('uid=');
  });
});
