import { describe, expect, it } from 'vitest';

import {
  BACKEND_ENV_VAR_NAMES,
  isLoopbackHost,
  parseOrigin,
  readAdminOrigin,
  readBackendConfig,
} from './backend-config';

/** Valores de forma válida pero deliberadamente falsos. Nunca configuración real. */
const LOCAL = {
  baseUrl: 'http://localhost:4000',
  authMode: 'none',
  adminOrigin: 'http://localhost:3000',
} as const;

const CLOUD = {
  baseUrl: 'https://backend.example.invalid',
  authMode: 'google-oidc',
  // En `google-oidc` la audiencia debe ser el mismo origen que la URL del backend.
  audience: 'https://backend.example.invalid',
  adminOrigin: 'https://panel.example.invalid',
} as const;

describe('modo none (desarrollo local)', () => {
  it('acepta http y no exige audiencia', () => {
    const result = readBackendConfig(LOCAL);

    expect(result).toEqual({
      ok: true,
      config: {
        baseUrl: 'http://localhost:4000',
        authMode: 'none',
        audience: null,
        adminOrigin: 'http://localhost:3000',
      },
    });
  });

  it('ignora una audiencia sobrante en lugar de arrastrarla', () => {
    const result = readBackendConfig({ ...LOCAL, audience: 'https://otra.example.invalid' });

    expect(result.ok === true && result.config.audience).toBeNull();
  });
});

describe('modo google-oidc (Cloud Run)', () => {
  it('acepta la configuración completa y canoniza los orígenes', () => {
    const result = readBackendConfig(CLOUD);

    expect(result).toEqual({
      ok: true,
      config: {
        baseUrl: 'https://backend.example.invalid',
        authMode: 'google-oidc',
        audience: 'https://backend.example.invalid',
        adminOrigin: 'https://panel.example.invalid',
      },
    });
  });

  it('exige la audiencia', () => {
    const result = readBackendConfig({ ...CLOUD, audience: '   ' });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain(BACKEND_ENV_VAR_NAMES.audience);
  });
});

describe('audiencia inválida', () => {
  it.each([
    ['con ruta', 'https://backend.example.invalid/v1'],
    ['con consulta', 'https://backend.example.invalid?a=1'],
    ['con fragmento', 'https://backend.example.invalid#f'],
    ['con credenciales embebidas', 'https://user:pass@backend.example.invalid'],
    ['sin https', 'http://backend.example.invalid'],
    ['relativa', '/v1/admin'],
    ['sin esquema', 'backend.example.invalid'],
    ['vacía tras recortar', '  '],
  ])('rechaza una audiencia %s', (_label, audience) => {
    const result = readBackendConfig({ ...CLOUD, audience });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain(BACKEND_ENV_VAR_NAMES.audience);
  });
});

describe('validación estricta de la URL y del origen del panel', () => {
  it.each([
    ['con ruta', 'https://backend.example.invalid/api'],
    ['con consulta', 'https://backend.example.invalid?x=1'],
    ['con credenciales', 'https://u:p@backend.example.invalid'],
    ['no absoluta', 'localhost:4000'],
    ['en http remoto', 'http://backend.example.invalid'],
  ])('rechaza MODULARTESS_BACKEND_URL %s', (_label, baseUrl) => {
    const result = readBackendConfig({ ...LOCAL, baseUrl });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain(BACKEND_ENV_VAR_NAMES.baseUrl);
  });

  it.each([
    ['con ruta', 'https://panel.example.invalid/panel'],
    ['con fragmento', 'https://panel.example.invalid#x'],
    ['no absoluto', 'panel.example.invalid'],
    ['en http remoto', 'http://panel.example.invalid'],
  ])('rechaza MODULARTESS_ADMIN_ORIGIN %s', (_label, adminOrigin) => {
    const result = readBackendConfig({ ...LOCAL, adminOrigin });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain(BACKEND_ENV_VAR_NAMES.adminOrigin);
  });
});

describe('modo desconocido y variables ausentes', () => {
  it.each(['', 'None', 'oidc', 'google', 'disabled'])('rechaza el modo %o', (authMode) => {
    const result = readBackendConfig({ ...LOCAL, authMode });

    expect(result.ok).toBe(false);
  });

  it('nombra las variables del backend que faltan', () => {
    const result = readBackendConfig({});

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain(BACKEND_ENV_VAR_NAMES.baseUrl);
    expect(result.ok === false && result.reason).toContain(BACKEND_ENV_VAR_NAMES.authMode);
  });

  it('nombra el origen del panel cuando es lo único que falta', () => {
    const result = readBackendConfig({ ...LOCAL, adminOrigin: undefined });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain(BACKEND_ENV_VAR_NAMES.adminOrigin);
  });
});

describe('parseOrigin', () => {
  it('canoniza el puerto por defecto', () => {
    expect(parseOrigin('https://panel.example.invalid:443', 'https-only')).toBe(
      'https://panel.example.invalid',
    );
  });

  it('conserva un puerto no estándar', () => {
    expect(parseOrigin('http://localhost:3000', 'https-or-loopback')).toBe('http://localhost:3000');
  });

  it('rechaza esquemas que no son http ni https', () => {
    expect(parseOrigin('ftp://x.example.invalid', 'https-or-loopback')).toBeNull();
    expect(parseOrigin('javascript:alert(1)', 'https-or-loopback')).toBeNull();
  });
});

describe('HTTP solo en loopback', () => {
  it.each(['localhost', '127.0.0.1', '[::1]'])('acepta http en %s', (host) => {
    expect(parseOrigin(`http://${host}:4000`, 'https-or-loopback')).toBe(`http://${host}:4000`);
  });

  it.each([
    'http://backend.example.invalid',
    'http://10.0.0.5:4000',
    'http://192.168.1.10',
    'http://localhost.atacante.tld',
    'http://notlocalhost',
  ])('rechaza http remoto: %s', (value) => {
    expect(parseOrigin(value, 'https-or-loopback')).toBeNull();
  });

  it('la política https-only rechaza http incluso en loopback', () => {
    expect(parseOrigin('http://localhost:4000', 'https-only')).toBeNull();
    expect(parseOrigin('http://127.0.0.1:4000', 'https-only')).toBeNull();
  });

  it('reconoce los hosts de loopback y solo esos', () => {
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('[::1]')).toBe(true);
    expect(isLoopbackHost('localhost.atacante.tld')).toBe(false);
    expect(isLoopbackHost('127.0.0.2')).toBe(false);
  });
});

describe('igualdad exacta entre baseUrl y audience en google-oidc', () => {
  it('acepta orígenes idénticos', () => {
    expect(readBackendConfig(CLOUD).ok).toBe(true);
  });

  it('acepta formas distintas del mismo origen tras canonizar', () => {
    const result = readBackendConfig({
      ...CLOUD,
      audience: 'https://backend.example.invalid:443',
    });

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.config.audience).toBe(
      result.ok === true && result.config.baseUrl,
    );
  });

  it.each([
    ['host distinto', 'https://otro-backend.example.invalid'],
    ['subdominio distinto', 'https://api.backend.example.invalid'],
    ['puerto distinto', 'https://backend.example.invalid:8443'],
  ])('rechaza una audiencia con %s', (_label, audience) => {
    const result = readBackendConfig({ ...CLOUD, audience });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('mismo origen');
  });

  it('rechaza una URL de backend en http dentro de google-oidc, aunque sea loopback', () => {
    const result = readBackendConfig({
      ...CLOUD,
      baseUrl: 'http://localhost:4000',
      audience: 'http://localhost:4000',
    });

    expect(result.ok).toBe(false);
  });
});

describe('readAdminOrigin, independiente del resto de la configuración', () => {
  it('valida el origen sin necesitar URL, modo ni audiencia', () => {
    expect(readAdminOrigin({ adminOrigin: 'https://panel.example.invalid' })).toEqual({
      ok: true,
      adminOrigin: 'https://panel.example.invalid',
    });
  });

  it('acepta loopback para desarrollo local', () => {
    expect(readAdminOrigin({ adminOrigin: 'http://localhost:3000' })).toEqual({
      ok: true,
      adminOrigin: 'http://localhost:3000',
    });
  });

  it.each([
    ['http remoto', 'http://panel.example.invalid'],
    ['con ruta', 'https://panel.example.invalid/panel'],
    ['con consulta', 'https://panel.example.invalid?x=1'],
    ['con fragmento', 'https://panel.example.invalid#x'],
    ['con credenciales', 'https://u:p@panel.example.invalid'],
    ['sin esquema', 'panel.example.invalid'],
  ])('rechaza %s', (_label, adminOrigin) => {
    expect(readAdminOrigin({ adminOrigin }).ok).toBe(false);
  });

  it('informa si falta la variable', () => {
    const result = readAdminOrigin({});

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain(BACKEND_ENV_VAR_NAMES.adminOrigin);
  });
});
