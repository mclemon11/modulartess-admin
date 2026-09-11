import { describe, expect, it } from 'vitest';

import { IMAGE_ALT_MAX_LENGTH } from '@/lib/api/image-limits';

import { parseUpdateProductImage } from './product-input';

describe('edición de imagen', () => {
  it('acepta cambiar solo el texto alternativo', () => {
    expect(
      parseUpdateProductImage({ expectedVersion: 2, altText: '  Tocador de frente  ' }),
    ).toEqual({ expectedVersion: 2, altText: 'Tocador de frente' });
  });

  it('acepta reposicionar', () => {
    expect(parseUpdateProductImage({ expectedVersion: 1, position: 0 })).toEqual({
      expectedVersion: 1,
      position: 0,
    });
  });

  it('acepta designar como principal', () => {
    expect(parseUpdateProductImage({ expectedVersion: 3, isPrimary: true })).toEqual({
      expectedVersion: 3,
      isPrimary: true,
    });
  });

  it('rechaza isPrimary false: el contrato solo admite designar otra', () => {
    expect(parseUpdateProductImage({ expectedVersion: 1, isPrimary: false })).toBeNull();
  });

  it('rechaza un PATCH que no cambiaría nada', () => {
    expect(parseUpdateProductImage({ expectedVersion: 1 })).toBeNull();
  });

  it.each([
    ['sin versión', { altText: 'x' }],
    ['versión cero', { expectedVersion: 0, altText: 'x' }],
    ['alt vacío', { expectedVersion: 1, altText: '   ' }],
    ['alt demasiado largo', { expectedVersion: 1, altText: 'a'.repeat(IMAGE_ALT_MAX_LENGTH + 1) }],
    ['posición negativa', { expectedVersion: 1, position: -1 }],
    ['posición no entera', { expectedVersion: 1, position: 1.5 }],
    ['no es objeto', 'texto'],
  ])('rechaza %s', (_label, raw) => {
    expect(parseUpdateProductImage(raw)).toBeNull();
  });
});
