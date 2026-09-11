import { describe, expect, it } from 'vitest';

import { sessionErrorFromBackendFailure, sessionErrorStatus } from '@/features/session/api-errors';
import type { BackendFailureCode } from '@/lib/api/errors';

import {
  describeBackendFailure,
  describeCatalogFailure,
  GENERIC_CATALOG_MESSAGE,
} from './catalog-errors';

describe('adaptación de errores del backend', () => {
  it.each([
    ['backend_invalid_request', 'invalid_request', 400],
    ['backend_unauthorized', 'session_required', 401],
    ['backend_forbidden', 'admin_role_required', 403],
    ['backend_not_found', 'not_found', 404],
    ['backend_conflict', 'version_conflict', 409],
    ['backend_unavailable', 'service_unavailable', 503],
  ] as const)('%s se convierte en %s con estado %i', (failure, code, status) => {
    expect(sessionErrorFromBackendFailure(failure as BackendFailureCode)).toBe(code);
    expect(sessionErrorStatus(code)).toBe(status);
  });

  it('el 404 de recurso no se confunde con la superficie desactivada', () => {
    expect(sessionErrorFromBackendFailure('backend_not_found')).toBe('not_found');
    expect(sessionErrorFromBackendFailure('backend_surface_disabled')).toBe(
      'admin_surface_disabled',
    );
  });
});

describe('mensajes de conflicto', () => {
  it('el 409 explica que hay que recargar, no que se reintente', () => {
    const message = describeCatalogFailure('version_conflict');

    expect(message).toMatch(/modificó/i);
    expect(message).toMatch(/recarga/i);
  });

  it('cada fallo del backend tiene un mensaje propio en español', () => {
    for (const code of [
      'backend_conflict',
      'backend_not_found',
      'backend_forbidden',
      'backend_unauthorized',
    ] as const) {
      expect(describeBackendFailure(code)).not.toBe(GENERIC_CATALOG_MESSAGE);
    }
  });

  it('un código desconocido cae al mensaje genérico, sin filtrar nada', () => {
    expect(describeCatalogFailure('algo_que_no_existe')).toBe(GENERIC_CATALOG_MESSAGE);
    expect(GENERIC_CATALOG_MESSAGE).not.toMatch(/backend|http|\d{3}/i);
  });
});
