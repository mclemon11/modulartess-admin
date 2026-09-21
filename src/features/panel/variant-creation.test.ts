import { describe, expect, it, vi } from 'vitest';

import type { AdminProduct } from '@/lib/api/catalog';

import { createVariantsSequentially } from './variant-creation';
import type { VariantDraft } from './variant-draft';

function product(version: number): AdminProduct {
  return { id: 'prd_1', version } as unknown as AdminProduct;
}

function draft(draftId: string): VariantDraft {
  return {
    draftId,
    sku: `SKU-${draftId.toUpperCase()}`,
    priceCop: '1490000',
    inventory: { mode: 'tracked', quantity: '1', lowStockThreshold: '0', status: 'in_stock' },
    attributes: [{ key: 'finish', value: draftId, label: draftId }],
  };
}

describe('altas en serie sobre un producto existente', () => {
  it('cada alta parte de la versión que devolvió la anterior', async () => {
    let version = 4;
    const send = vi.fn(async (body: { expectedVersion: number }) => {
      version += 1;
      expect(body.expectedVersion).toBe(version - 1);

      return {
        ok: true as const,
        data: { product: product(version), variant: { id: `var-${version}` } },
      };
    });

    const progress = await createVariantsSequentially(
      product(4),
      [draft('a'), draft('b'), draft('c')],
      send,
    );

    expect(send.mock.calls.map(([body]) => body.expectedVersion)).toEqual([4, 5, 6]);
    expect(progress.failure).toBeNull();
    expect(progress.product.version).toBe(7);
    expect(progress.created.map((entry) => entry.draftId)).toEqual(['a', 'b', 'c']);
  });

  it('se detiene en el primer fallo y conserva lo ya creado', async () => {
    const send = vi.fn(async (body: { sku: string }) =>
      body.sku === 'SKU-B'
        ? { ok: false as const, code: 'version_conflict' }
        : {
            ok: true as const,
            data: { product: product(5), variant: { id: 'var-1' } },
          },
    );

    const progress = await createVariantsSequentially(
      product(4),
      [draft('a'), draft('b'), draft('c')],
      send,
    );

    expect(progress.created.map((entry) => entry.draftId)).toEqual(['a']);
    expect(progress.failure).toEqual({ draftId: 'b', code: 'version_conflict' });
    // No se intenta la tercera: seguiría con una versión que el backend ya rechazó.
    expect(send).toHaveBeenCalledTimes(2);
    // El producto que se devuelve es el último autoritativo, no el que se leyó al abrir.
    expect(progress.product.version).toBe(5);
  });
});
