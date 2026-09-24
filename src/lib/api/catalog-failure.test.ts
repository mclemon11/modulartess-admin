import { describe, expect, it } from 'vitest';

import {
  describeCatalogFailure,
  offersReload,
  productFailureField,
} from '@/features/panel/catalog-errors';
import { readFailurePayload } from '@/features/panel/catalog-client';
import {
  sessionErrorBody,
  sessionErrorFromBackendFailure,
  sessionErrorStatus,
} from '@/features/session/api-errors';

import { catalogFailure, safeErrorReference, upstreamErrorCode } from './errors';

/**
 * Los conflictos del catálogo, de extremo a extremo: el cuerpo del backend, el código interno, el
 * código del BFF y lo que ve la persona.
 *
 * El error que se corrige aquí es concreto: **todo** `409` se convertía en «Alguien modificó este
 * producto mientras lo editabas», también un SKU repetido en un producto que ni siquiera se llegó a
 * crear. Estas pruebas fallan si se vuelve a aplanar.
 */

/** Lo que devuelve el backend en un `409`, reducido a lo que el panel lee. */
function conflict(code: string) {
  return catalogFailure(409, { code, message: 'no se lee nunca' });
}

/** El recorrido completo: backend → BFF → mensaje. */
function seen(code: string) {
  const failure = conflict(code);
  const bff = sessionErrorFromBackendFailure(failure.code);

  return {
    internal: failure.code,
    bff,
    status: sessionErrorStatus(bff),
    message: describeCatalogFailure(bff),
    field: productFailureField(bff),
    reload: offersReload(bff),
  };
}

describe('los tres conflictos del producto', () => {
  it('product_sku_conflict: SKU reservado, marca el SKU y no ofrece recargar', () => {
    expect(seen('product_sku_conflict')).toEqual({
      internal: 'backend_product_sku_conflict',
      bff: 'sku_conflict',
      status: 409,
      message:
        'Ese SKU ya está reservado, incluso si pertenece a un producto archivado. Usa otro SKU.',
      field: 'sku',
      reload: false,
    });
  });

  it('product_slug_conflict: URL reservada, marca el slug y no ofrece recargar', () => {
    expect(seen('product_slug_conflict')).toEqual({
      internal: 'backend_product_slug_conflict',
      bff: 'slug_conflict',
      status: 409,
      message: 'Esa URL ya está reservada, incluso si pertenece a un producto archivado. Usa otra.',
      field: 'slug',
      reload: false,
    });
  });

  it('product_version_conflict: edición concurrente, sin campo y con recarga', () => {
    expect(seen('product_version_conflict')).toEqual({
      internal: 'backend_conflict',
      bff: 'version_conflict',
      status: 409,
      message:
        'Alguien modificó este producto mientras lo editabas. Recarga para ver la versión actual y vuelve a intentarlo.',
      field: null,
      reload: true,
    });
  });

  it('los tres producen estados y mensajes distintos entre sí', () => {
    const outcomes = [
      'product_sku_conflict',
      'product_slug_conflict',
      'product_version_conflict',
    ].map(seen);

    expect(new Set(outcomes.map((outcome) => outcome.bff)).size).toBe(3);
    expect(new Set(outcomes.map((outcome) => outcome.message)).size).toBe(3);
    expect(new Set(outcomes.map((outcome) => String(outcome.field))).size).toBe(3);
    // Solo el de versión se arregla releyendo.
    expect(outcomes.map((outcome) => outcome.reload)).toEqual([false, false, true]);
  });

  it('un SKU repetido nunca dice que alguien modificó el producto', () => {
    expect(seen('product_sku_conflict').message).not.toContain('modificó');
    expect(seen('product_slug_conflict').message).not.toContain('modificó');
  });
});

describe('conflictos que el panel no reconoce', () => {
  it('no se convierten en conflicto de versión y conservan su código', () => {
    const failure = conflict('product_something_new');

    expect(failure.code).toBe('backend_conflict_unrecognized');
    expect(failure.reference).toBe('product_something_new');

    const bff = sessionErrorFromBackendFailure(failure.code);

    expect(bff).toBe('conflict_unrecognized');
    expect(offersReload(bff)).toBe(false);
  });

  it('el mensaje dice el código para diagnóstico y no promete una recarga', () => {
    const message = describeCatalogFailure('conflict_unrecognized', 'product_something_new');

    expect(message).toContain('(código: product_something_new)');
    expect(message).not.toContain('Recarga');
    expect(message).not.toContain('modificó');
  });

  it('un 409 sin código sigue sin ser de versión', () => {
    const failure = catalogFailure(409, undefined);

    expect(failure.code).toBe('backend_conflict_unrecognized');
    expect(failure.reference).toBeNull();
    expect(describeCatalogFailure('conflict_unrecognized')).toContain('(código: sin código)');
  });

  it('la referencia solo pasa si tiene forma de identificador', () => {
    expect(safeErrorReference('product_x_conflict')).toBe('product_x_conflict');

    for (const unsafe of [
      'Alguien con correo ana@example.com',
      'eyJhbGciOiJIUzI1NiJ9.token',
      'UPPER_CASE',
      'a'.repeat(80),
      42,
      null,
    ]) {
      expect(safeErrorReference(unsafe), String(unsafe)).toBeNull();
    }

    expect(catalogFailure(409, { code: 'con espacios y datos' }).reference).toBeNull();
  });

  it('el mensaje del backend no se lee nunca', () => {
    expect(upstreamErrorCode({ message: 'product_sku_conflict' })).toBeNull();
  });
});

describe('el cuerpo del BFF', () => {
  it('lleva la referencia solo cuando la hay', () => {
    expect(sessionErrorBody('conflict_unrecognized', 'product_x')).toEqual({
      code: 'conflict_unrecognized',
      message: 'El backend rechazó la operación por un conflicto.',
      reference: 'product_x',
    });
    expect(sessionErrorBody('sku_conflict')).not.toHaveProperty('reference');
  });

  it('el navegador vuelve a validar la referencia antes de pintarla', () => {
    expect(readFailurePayload({ code: 'conflict_unrecognized', reference: 'product_x' })).toEqual({
      ok: false,
      code: 'conflict_unrecognized',
      reference: 'product_x',
    });
    expect(
      readFailurePayload({ code: 'conflict_unrecognized', reference: '<script>alert(1)</script>' }),
    ).toEqual({ ok: false, code: 'conflict_unrecognized' });
    expect(readFailurePayload({ message: 'sin código' })).toBeNull();
  });
});

describe('categorías', () => {
  it.each([
    ['product_category_not_found', 'category_not_found', 'category'],
    ['product_category_archived', 'category_archived', 'category'],
    ['product_category_name_conflict', 'category_name_conflict', null],
    ['product_category_slug_conflict', 'category_slug_conflict', null],
    ['product_category_version_conflict', 'category_version_conflict', null],
  ])('%s llega con su propio código y mensaje', (upstream, bff, field) => {
    const failure = catalogFailure(upstream === 'product_category_not_found' ? 404 : 409, {
      code: upstream,
    });

    expect(sessionErrorFromBackendFailure(failure.code)).toBe(bff);
    expect(productFailureField(bff)).toBe(field);
    expect(describeCatalogFailure(bff)).not.toBe(describeCatalogFailure('version_conflict'));
  });

  it('inexistente y archivada dicen cosas distintas', () => {
    expect(describeCatalogFailure('category_not_found')).toContain('ya no existe');
    expect(describeCatalogFailure('category_archived')).toContain('archivada');
  });

  it('un 404 de categoría sin código es «categoría inexistente», no «producto inexistente»', () => {
    const failure = catalogFailure(404, undefined, {
      notFound: 'backend_product_category_not_found',
    });

    expect(sessionErrorFromBackendFailure(failure.code)).toBe('category_not_found');
  });
});
