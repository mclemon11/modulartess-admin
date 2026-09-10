import { describe, expect, it } from 'vitest';

import { FIREBASE_ENV_VAR_NAMES, readFirebaseConfig } from './config';

/** Valores de forma válida pero deliberadamente falsos: nunca configuración real de Firebase. */
const PLACEHOLDER_ENV = {
  apiKey: 'placeholder-api-key',
  authDomain: 'placeholder.example.invalid',
  projectId: 'placeholder-project',
  appId: 'placeholder-app-id',
} as const;

describe('readFirebaseConfig', () => {
  it('devuelve la configuración cuando están las cuatro variables', () => {
    const result = readFirebaseConfig(PLACEHOLDER_ENV);

    expect(result).toEqual({ ok: true, config: PLACEHOLDER_ENV });
  });

  it('informa de la variable que falta, por su nombre', () => {
    const result = readFirebaseConfig({ ...PLACEHOLDER_ENV, projectId: undefined });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.missing).toEqual([FIREBASE_ENV_VAR_NAMES.projectId]);
  });

  it('trata una cadena vacía o en blanco como variable ausente', () => {
    const result = readFirebaseConfig({ ...PLACEHOLDER_ENV, apiKey: '   ' });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.missing).toEqual([FIREBASE_ENV_VAR_NAMES.apiKey]);
  });

  it('enumera todas las que faltan cuando no hay ninguna configuración', () => {
    const result = readFirebaseConfig({});

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.missing).toEqual([
      FIREBASE_ENV_VAR_NAMES.apiKey,
      FIREBASE_ENV_VAR_NAMES.authDomain,
      FIREBASE_ENV_VAR_NAMES.projectId,
      FIREBASE_ENV_VAR_NAMES.appId,
    ]);
  });

  it('recorta los espacios sobrantes de los valores presentes', () => {
    const result = readFirebaseConfig({ ...PLACEHOLDER_ENV, appId: '  placeholder-app-id  ' });

    expect(result.ok === true && result.config.appId).toBe('placeholder-app-id');
  });
});
