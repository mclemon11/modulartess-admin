import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { describeCatalogFailure } from './catalog-errors';
import {
  createKeyLedger,
  currentOperation,
  inventoryFingerprint,
  inventoryScope,
  keyFor,
  releaseKey,
} from './operation-key';

import type { SetInventoryControl } from '@/lib/api/catalog';

/**
 * La clave de idempotencia del inventario, atada al cuerpo exacto que representa.
 *
 * El hueco que esto cierra era real: la versión anterior guardaba la clave hasta el éxito sin
 * saber **qué** operación representaba. Tras un fallo se podía reabrir el formulario, escribir otra
 * cantidad o cambiar de modo, y ese cuerpo distinto viajaba con la clave del intento anterior. Para
 * el backend eran la misma operación, así que la segunda podía descartarse y devolver el resultado
 * de la primera.
 */

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const executable = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const BASE = { productId: 'prd_1', variantId: null, expectedVersion: 7 } as const;
const TRACKED: SetInventoryControl = { mode: 'tracked', quantity: 15, lowStockThreshold: 2 };

function sequence() {
  let n = 0;

  return () => `key-${(n += 1)}`;
}

/** La clave que pediría la pantalla para ese destino y ese cuerpo. */
function ask(
  ledger: ReturnType<typeof createKeyLedger>,
  next: () => string,
  target: { productId: string; variantId: string | null; expectedVersion: number },
  inventory: SetInventoryControl,
): string {
  return keyFor(ledger, inventoryScope(target), inventoryFingerprint(target, inventory), next);
}

describe('mismo cuerpo tras un fallo reutiliza la clave', () => {
  it('reintentar exactamente lo mismo no la cambia', () => {
    const ledger = createKeyLedger();
    const next = sequence();

    expect(ask(ledger, next, BASE, TRACKED)).toBe('key-1');
    expect(ask(ledger, next, BASE, TRACKED)).toBe('key-1');
    expect(ask(ledger, next, BASE, TRACKED)).toBe('key-1');
  });

  it('un fallo no la libera: eso solo lo hace el éxito', () => {
    const ledger = createKeyLedger();
    const next = sequence();
    const first = ask(ledger, next, BASE, TRACKED);

    expect(currentOperation(ledger, 'base')?.key).toBe(first);

    releaseKey(ledger, inventoryScope(BASE));

    expect(currentOperation(ledger, 'base')).toBeNull();
    expect(ask(ledger, next, BASE, TRACKED)).toBe('key-2');
  });

  /*
   * El umbral ausente significa cero, que es lo que el backend guarda. Son la misma operación, y
   * tratarlas como distintas haría que un reintento estrenara clave sin que nada hubiera cambiado.
   */
  it('umbral ausente y umbral cero son la misma operación', () => {
    const ledger = createKeyLedger();
    const next = sequence();

    expect(ask(ledger, next, BASE, { mode: 'tracked', quantity: 4 })).toBe('key-1');
    expect(ask(ledger, next, BASE, { mode: 'tracked', quantity: 4, lowStockThreshold: 0 })).toBe(
      'key-1',
    );
  });
});

describe('un cuerpo distinto estrena clave', () => {
  it.each([
    ['otra cantidad', { mode: 'tracked', quantity: 16, lowStockThreshold: 2 }],
    ['otro umbral', { mode: 'tracked', quantity: 15, lowStockThreshold: 3 }],
    ['otro modo', { mode: 'availability', status: 'in_stock' }],
  ] as [string, SetInventoryControl][])('%s', (_label, changed) => {
    const ledger = createKeyLedger();
    const next = sequence();

    expect(ask(ledger, next, BASE, TRACKED)).toBe('key-1');
    expect(ask(ledger, next, BASE, changed)).toBe('key-2');
  });

  it('cambiar la disponibilidad dentro del mismo modo también', () => {
    const ledger = createKeyLedger();
    const next = sequence();
    const inStock: SetInventoryControl = { mode: 'availability', status: 'in_stock' };
    const outOfStock: SetInventoryControl = { mode: 'availability', status: 'out_of_stock' };

    expect(ask(ledger, next, BASE, inStock)).toBe('key-1');
    expect(ask(ledger, next, BASE, outOfStock)).toBe('key-2');
    // Y volver a lo primero es, otra vez, una operación nueva: la anterior ya no está viva.
    expect(ask(ledger, next, BASE, inStock)).toBe('key-3');
  });
});

describe('la versión forma parte de la identidad', () => {
  /*
   * Tras un `409` hay que recargar, y recargar trae otra `expectedVersion`. Partir de otro estado
   * es otra operación: reutilizar la clave dejaría que el backend devolviera el resultado de la
   * escritura que se hizo sobre la versión vieja.
   */
  it('otra expectedVersion estrena clave', () => {
    const ledger = createKeyLedger();
    const next = sequence();

    expect(ask(ledger, next, BASE, TRACKED)).toBe('key-1');
    expect(ask(ledger, next, { ...BASE, expectedVersion: 8 }, TRACKED)).toBe('key-2');
  });
});

describe('cada destino lleva la suya', () => {
  it('dos variantes nunca comparten clave', () => {
    const ledger = createKeyLedger();
    const next = sequence();
    const a = { productId: 'prd_1', variantId: 'var_a', expectedVersion: 7 };
    const b = { productId: 'prd_1', variantId: 'var_b', expectedVersion: 7 };

    expect(ask(ledger, next, a, TRACKED)).toBe('key-1');
    expect(ask(ledger, next, b, TRACKED)).toBe('key-2');
    // Y tocar la B no invalida el reintento pendiente de la A.
    expect(ask(ledger, next, a, TRACKED)).toBe('key-1');
  });

  it('la variante no comparte clave con el inventario base', () => {
    const ledger = createKeyLedger();
    const next = sequence();

    expect(ask(ledger, next, BASE, TRACKED)).toBe('key-1');
    expect(
      ask(ledger, next, { productId: 'prd_1', variantId: 'var_a', expectedVersion: 7 }, TRACKED),
    ).toBe('key-2');
  });

  it('otro producto tampoco', () => {
    const ledger = createKeyLedger();
    const next = sequence();

    expect(ask(ledger, next, BASE, TRACKED)).toBe('key-1');
    expect(ask(ledger, next, { ...BASE, productId: 'prd_2' }, TRACKED)).toBe('key-2');
  });

  /*
   * La huella se construye campo a campo con los fragmentos escapados. Sin escapar, un
   * identificador con el separador dentro podría fabricar la huella de otro destino.
   */
  it('un identificador no puede falsificar la huella de otro', () => {
    const tricky = inventoryFingerprint(
      { productId: 'prd_1|-|v=7', variantId: null, expectedVersion: 7 },
      TRACKED,
    );
    const honest = inventoryFingerprint(BASE, TRACKED);

    expect(tricky).not.toBe(honest);
  });
});

describe('la huella se construye, no se serializa', () => {
  it('no se usa JSON.stringify sobre el cuerpo', () => {
    const source = executable(read('src/features/panel/operation-key.ts'));

    expect(source).not.toContain('JSON.stringify');
  });

  it('lleva tipo de operación, destino, versión y cuerpo canónico', () => {
    const fingerprint = inventoryFingerprint(
      { productId: 'prd_1', variantId: 'var_a', expectedVersion: 9 },
      TRACKED,
    );

    expect(fingerprint).toContain('inventory.set');
    expect(fingerprint).toContain('prd_1');
    expect(fingerprint).toContain('var_a');
    expect(fingerprint).toContain('v=9');
    expect(fingerprint).toContain('tracked');
    expect(fingerprint).toContain('quantity=15');
    expect(fingerprint).toContain('threshold=2');
  });

  it('en disponibilidad no aparece ninguna cantidad', () => {
    const fingerprint = inventoryFingerprint(BASE, { mode: 'availability', status: 'in_stock' });

    expect(fingerprint).toContain('status=in_stock');
    expect(fingerprint).not.toContain('quantity');
    expect(fingerprint).not.toContain('threshold');
  });
});

describe('las pantallas atan la clave a la operación', () => {
  it.each([
    [
      'src/features/panel/product-detail-client.tsx',
      'async function handleInventory(',
      'const baseReading',
    ],
    [
      'src/features/panel/product-variants.tsx',
      'async function handleVariantInventory(',
      'return (',
    ],
  ])('%s', (file, from, to) => {
    const source = executable(read(file));
    const handler = source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));

    expect(handler, file).toContain('inventoryFingerprint(target, inventory)');
    expect(handler, file).toContain('keyFor(');
    // Nada de fabricar una clave suelta dentro del manejador.
    expect(handler, file).not.toMatch(/idempotencyKey:\s*crypto\.randomUUID/);
    expect(handler, file).toMatch(/idempotencyKey:\s*key/);
  });

  it('solo la descartan en el camino de éxito', () => {
    for (const file of [
      'src/features/panel/product-detail-client.tsx',
      'src/features/panel/product-variants.tsx',
    ]) {
      const source = executable(read(file));

      expect(source, file).not.toContain('finally');
      expect(source, file).toMatch(/settle\([\s\S]*?releaseKey\(/);
    }
  });

  it('el manejador devuelve si el backend lo confirmó', () => {
    for (const file of [
      'src/features/panel/product-detail-client.tsx',
      'src/features/panel/product-variants.tsx',
    ]) {
      const source = executable(read(file));

      expect(source, file).toContain('return { applied: result.ok };');
      expect(source, file).toContain('return { applied: false };');
    }
  });
});

describe('un 409 se detiene y ofrece recargar', () => {
  it('el conflicto tiene su propio mensaje, distinto de un fallo genérico', () => {
    const conflict = describeCatalogFailure('version_conflict');

    expect(conflict).not.toBe(describeCatalogFailure('internal_error'));
    expect(conflict.toLowerCase()).toContain('modificó este producto');
    expect(conflict.toLowerCase()).toContain('recarga');
  });

  it('el detalle ofrece recargar y no reintenta solo', () => {
    const source = executable(read('src/features/panel/product-detail-client.tsx'));

    expect(source).toContain("result.code === 'version_conflict'");
    expect(source).toContain('Recargar datos');
    expect(source).toContain('router.refresh()');
    expect(source).not.toContain('setTimeout');
  });

  it('no hay actualización optimista: el estado sale de la respuesta', () => {
    const source = executable(read('src/features/panel/product-detail-client.tsx'));
    const handler = source.slice(
      source.indexOf('async function handleInventory('),
      source.indexOf('const baseReading'),
    );

    expect(handler).toContain('applyProduct(applied.product)');
    expect(handler.indexOf('applyProduct')).toBeGreaterThan(handler.indexOf('settle('));
  });
});
