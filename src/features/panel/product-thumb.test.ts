import { describe, expect, it } from 'vitest';

import type { AdminProduct, AdminProductImage } from '@/lib/api/catalog';

import { primaryImage } from './product-thumb';

function image(overrides: Partial<AdminProductImage>): AdminProductImage {
  return {
    id: 'img_1',
    productId: 'prd_1',
    objectName: 'products/prd_1/img_1.jpg',
    publicUrl: 'https://storage.example.invalid/products/prd_1/img_1.jpg',
    altText: 'alt',
    position: 0,
    isPrimary: false,
    status: 'active',
    contentType: 'image/jpeg',
    sizeBytes: 1024,
    createdAt: '2026-09-11T00:00:00.000Z',
    updatedAt: '2026-09-11T00:00:00.000Z',
    archivedAt: null,
    version: 1,
    ...overrides,
  };
}

function product(images: readonly AdminProductImage[]): AdminProduct {
  return { images: [...images] } as AdminProduct;
}

describe('miniatura del producto', () => {
  it('usa la imagen principal activa', () => {
    const chosen = primaryImage(
      product([image({ id: 'a', position: 0 }), image({ id: 'b', position: 1, isPrimary: true })]),
    );

    expect(chosen?.id).toBe('b');
  });

  it('cae a la primera activa si ninguna está marcada como principal', () => {
    expect(primaryImage(product([image({ id: 'a' })]))?.id).toBe('a');
  });

  it('ignora las archivadas, aunque fueran principales', () => {
    const chosen = primaryImage(
      product([image({ id: 'vieja', status: 'archived', isPrimary: true })]),
    );

    expect(chosen).toBeUndefined();
  });

  it('sin imágenes no devuelve ninguna: el listado dirá «Sin imagen»', () => {
    expect(primaryImage(product([]))).toBeUndefined();
  });
});
