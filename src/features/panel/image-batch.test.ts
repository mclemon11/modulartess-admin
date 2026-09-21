import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { uploadQueueSequentially, type UploadInput } from './create-product-flow';

import type { AdminProduct } from '@/lib/api/catalog';
import type { MutationResult } from './catalog-client';
import type { QueuedImage } from './image-queue';

/**
 * El lote secuencial de subida, que comparten el alta y la edición.
 *
 * Lo que se protege es la regla que el contrato impone sin decirlo: cada subida devuelve el
 * producto con una versión nueva y la siguiente necesita **esa** versión. En cuanto hay dos
 * archivos, el paralelismo deja de ser una optimización y pasa a ser un `409` garantizado.
 */

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

/**
 * El código sin comentarios.
 *
 * Los propios módulos explican **por qué** no se usa `Promise.all`, así que buscar la cadena en el
 * archivo entero encontraría la explicación. Lo que se busca es que no se llame, no que no se
 * mencione.
 */
const executable = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function product(version: number): AdminProduct {
  return { id: 'prd_1', version, images: [], variants: [] } as unknown as AdminProduct;
}

function entry(n: number): QueuedImage {
  return {
    entryId: `e${n}`,
    file: { name: `foto-${n}.jpg`, size: 1024, type: 'image/jpeg' } as File,
    previewUrl: `blob:${n}`,
    altText: `Foto ${n}`,
    idempotencyKey: `key-${n}`,
    intent: 'gallery',
    uploadedImageId: null,
  };
}

const QUEUE = [entry(1), entry(2), entry(3), entry(4), entry(5)];

describe('28 y 29. cinco imágenes suben en serie, cada una con la versión anterior', () => {
  it('las versiones encadenan y el orden es el de la cola', async () => {
    const versions: number[] = [];
    let version = 4;

    const result = await uploadQueueSequentially(product(version), QUEUE, (input: UploadInput) => {
      versions.push(input.expectedVersion);
      version += 1;

      return Promise.resolve({
        ok: true as const,
        data: { product: product(version), image: { id: `img-${input.entry.entryId}` } },
      });
    });

    expect(versions).toEqual([4, 5, 6, 7, 8]);
    expect(result.product.version).toBe(9);
    expect(result.uploaded.map((done) => done.entryId)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5']);
    expect(result.failure).toBeNull();
  });

  it('nunca hay dos subidas a la vez', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    let version = 1;

    await uploadQueueSequentially(product(version), QUEUE, async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      version += 1;

      return { ok: true as const, data: { product: product(version), image: { id: 'img' } } };
    });

    expect(maxInFlight).toBe(1);
  });
});

describe('30 y 31. cada archivo lleva su clave y la conserva al reintentar', () => {
  it('cada entrada manda la suya', async () => {
    const keys: string[] = [];
    let version = 1;

    await uploadQueueSequentially(product(version), QUEUE, (input) => {
      keys.push(input.entry.idempotencyKey);
      version += 1;

      return Promise.resolve({
        ok: true as const,
        data: { product: product(version), image: { id: 'img' } },
      });
    });

    expect(keys).toEqual(['key-1', 'key-2', 'key-3', 'key-4', 'key-5']);
    expect(new Set(keys).size).toBe(keys.length);
  });

  /*
   * El reintento del archivo que falló manda **la misma** clave. Es lo que hace que un fallo de
   * red posterior a que el objeto ya se creara devuelva `replayed` en vez de duplicar la imagen.
   */
  it('el archivo fallido conserva su clave en el reintento', async () => {
    const seen: string[] = [];
    let failNext = true;
    let version = 1;

    const upload = (
      input: UploadInput,
    ): Promise<MutationResult<{ product: AdminProduct; image: { id: string } }>> => {
      seen.push(input.entry.idempotencyKey);

      if (input.entry.entryId === 'e3' && failNext) {
        failNext = false;

        return Promise.resolve({ ok: false as const, code: 'service_unavailable' });
      }

      version += 1;

      return Promise.resolve({
        ok: true as const,
        data: { product: product(version), image: { id: 'img' } },
      });
    };

    const first = await uploadQueueSequentially(product(1), QUEUE, upload);

    expect(first.failure).toEqual({ entryId: 'e3', code: 'service_unavailable' });

    const pending = QUEUE.filter(
      (candidate) => !first.uploaded.some((done) => done.entryId === candidate.entryId),
    );
    const second = await uploadQueueSequentially(first.product, pending, upload);

    expect(second.failure).toBeNull();
    // `key-3` aparece dos veces: la misma clave en el intento fallido y en el que salió bien.
    expect(seen.filter((key) => key === 'key-3')).toEqual(['key-3', 'key-3']);
  });
});

describe('32. un fallo parcial no reenvía lo ya subido', () => {
  it('se detiene, conserva lo hecho y no repite ninguna entrada', async () => {
    const attempted: string[] = [];
    let version = 1;

    const upload = (
      input: UploadInput,
    ): Promise<MutationResult<{ product: AdminProduct; image: { id: string } }>> => {
      attempted.push(input.entry.entryId);

      if (input.entry.entryId === 'e3') {
        return Promise.resolve({ ok: false as const, code: 'version_conflict' });
      }

      version += 1;

      return Promise.resolve({
        ok: true as const,
        data: { product: product(version), image: { id: 'img' } },
      });
    };

    const first = await uploadQueueSequentially(product(1), QUEUE, upload);

    // Se detuvo en la tercera: la cuarta y la quinta ni se intentaron.
    expect(attempted).toEqual(['e1', 'e2', 'e3']);
    expect(first.uploaded.map((done) => done.entryId)).toEqual(['e1', 'e2']);

    attempted.length = 0;

    // Reanudar con el progreso alcanzado no vuelve a mandar las dos primeras.
    await uploadQueueSequentially(first.product, QUEUE, upload, first.uploaded);

    expect(attempted).toEqual(['e3']);
  });

  it('el conflicto se distingue de cualquier otro fallo', async () => {
    const result = await uploadQueueSequentially(product(1), [entry(1)], () =>
      Promise.resolve({ ok: false as const, code: 'version_conflict' }),
    );

    expect(result.failure).toEqual({ entryId: 'e1', code: 'version_conflict' });
  });
});

describe('33. no se usa Promise.all', () => {
  /*
   * Sensibilidad en su forma más directa: el lote es un `for` con `await` dentro. Si alguien lo
   * «optimizara» a `Promise.all`, la prueba de arriba sobre versiones encadenadas dejaría de
   * pasar, y esta lo dice en voz alta por si el cambio llegara envuelto en otra cosa.
   */
  it('ni el lote ni las pantallas que lo usan lo mencionan', () => {
    for (const file of [
      'src/features/panel/create-product-flow.ts',
      'src/features/panel/product-images.tsx',
      'src/features/panel/create-product-form.tsx',
    ]) {
      const source = executable(read(file));

      expect(source, file).not.toContain('Promise.all');
      expect(source, file).not.toContain('Promise.allSettled');
    }
  });

  it('el progreso se informa subida a subida', async () => {
    const reported: number[] = [];
    let version = 1;

    await uploadQueueSequentially(
      product(version),
      QUEUE,
      () => {
        version += 1;

        return Promise.resolve({
          ok: true as const,
          data: { product: product(version), image: { id: 'img' } },
        });
      },
      [],
      (_next, done) => reported.push(done),
    );

    expect(reported).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('sensibilidad de la guarda de versión', () => {
  /*
   * Si el lote dejara de encadenar versiones —si mandara siempre la del producto inicial— un
   * backend con concurrencia optimista rechazaría todo salvo la primera. Se simula aquí.
   */
  it('un backend con expectedVersion estricto acepta las cinco solo porque encadenan', async () => {
    let stored = 4;
    const spy = vi.fn((input: UploadInput) => {
      if (input.expectedVersion !== stored) {
        return Promise.resolve({ ok: false as const, code: 'version_conflict' });
      }

      stored += 1;

      return Promise.resolve({
        ok: true as const,
        data: { product: product(stored), image: { id: 'img' } },
      });
    });

    const result = await uploadQueueSequentially(product(4), QUEUE, spy);

    expect(result.failure).toBeNull();
    expect(spy).toHaveBeenCalledTimes(5);
  });
});
