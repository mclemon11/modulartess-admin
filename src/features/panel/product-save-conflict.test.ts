import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { saveOutcome } from './catalog-errors';
import { parseUpdateProduct } from './product-input';

/**
 * Guardar la ficha cuando otra persona ya la cambió.
 *
 * El backend responde `409 product_version_conflict` y no aplica nada. Lo que se fija aquí es que el
 * panel lo dice, pide recargar y **no** afirma haber guardado; y que recargar sirve de verdad.
 */

describe('conflicto de versión al guardar', () => {
  it('no deja mensaje de éxito, marca el conflicto y pide recargar', () => {
    const outcome = saveOutcome({ ok: false, code: 'version_conflict' }, 'Cambios guardados.');
    expect(outcome.notice).toBeNull();
    expect(outcome.conflict).toBe(true);
    expect(outcome.failure).toContain('Alguien modificó este producto');
    expect(outcome.failure).toContain('Recarga');
    expect(outcome.failure).not.toMatch(/guardad/i);
  });

  it('otro fallo tampoco dice que guardó, pero no ofrece recargar', () => {
    const outcome = saveOutcome({ ok: false, code: 'invalid_request' }, 'Cambios guardados.');
    expect(outcome).toMatchObject({ notice: null, conflict: false });
  });

  it('solo un guardado correcto deja el aviso de éxito', () => {
    expect(saveOutcome({ ok: true }, 'Cambios guardados.')).toEqual({
      notice: 'Cambios guardados.',
      failure: null,
      conflict: false,
    });
  });

  it('el aviso del conflicto lleva el botón «Recargar datos» y el éxito se borra al empezar', () => {
    const source = readFileSync('src/features/panel/product-detail-client.tsx', 'utf8');
    expect(source).toMatch(/\{conflict \? \(\s*<button[\s\S]*?Recargar datos/);
    // Al empezar cualquier guardado se borra el aviso anterior; al fallar, también.
    expect(source).toMatch(/function begin\(\)[\s\S]*?setNotice\(null\)/);
    expect(source).toMatch(/saveOutcome\(result, ''\)[\s\S]*?setNotice\(null\)/);
  });

  /*
   * «Recargar datos» llama a `router.refresh()`. Sin `key` con la versión, React conservaría el
   * formulario en la versión vieja y el siguiente guardado volvería a dar 409 indefinidamente.
   */
  it('recargar monta la ficha sobre la versión nueva', () => {
    const page = readFileSync('src/app/panel/productos/[productId]/page.tsx', 'utf8');
    expect(page).toMatch(
      /<ProductDetailClient\s+key=\{`\$\{product\.id\}:\$\{product\.version\}`\}/,
    );
  });
});

describe('compatibilidad con el contrato', () => {
  it('un cuerpo sin los campos nuevos —el del panel anterior— no los envía', () => {
    const body = parseUpdateProduct({
      expectedVersion: 4,
      name: 'Tocador',
      priceCop: 1000,
      shortDescription: '',
      description: '',
    });
    expect(body).toEqual({
      expectedVersion: 4,
      name: 'Tocador',
      priceCop: 1000,
      shortDescription: '',
      description: '',
    });
    for (const field of ['compareAtPriceCop', 'newUntil', 'newLabel', 'promotionLabel']) {
      expect(body).not.toHaveProperty(field);
    }
  });

  it('la versión esperada viaja siempre: sin ella no hay guardado', () => {
    expect(parseUpdateProduct({ name: 'Tocador', compareAtPriceCop: null })).toBeNull();
  });
});
