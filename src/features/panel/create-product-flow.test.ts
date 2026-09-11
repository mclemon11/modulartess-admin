import { describe, expect, it, vi } from 'vitest';

import type { AdminProduct } from '@/lib/api/catalog';

import {
  describeProgress,
  isComplete,
  runCreateFlow,
  type CreateFlowDeps,
} from './create-product-flow';
import type { QueuedImage } from './image-queue';

function entry(entryId: string): QueuedImage {
  return {
    entryId,
    file: new File(['x'], `${entryId}.jpg`, { type: 'image/jpeg' }),
    previewUrl: `blob:${entryId}`,
    altText: `alt ${entryId}`,
    idempotencyKey: `key-${entryId}`,
  };
}

/** Producto con la versión y las imágenes que el backend devolvería tras cada paso. */
function product(version: number, images: { id: string; isPrimary: boolean }[] = []): AdminProduct {
  return {
    id: 'prd_1',
    version,
    images: images.map((image) => ({ ...image, status: 'active' })),
  } as unknown as AdminProduct;
}

/** Dobles que imitan al backend: cada subida incrementa la versión y añade su imagen. */
function backendDouble(overrides: Partial<CreateFlowDeps> = {}): CreateFlowDeps {
  const images: { id: string; isPrimary: boolean }[] = [];
  let version = 1;

  return {
    createProduct: vi.fn(async () => ({ ok: true as const, data: product(version, []) })),
    uploadImage: vi.fn(async ({ entry: queued }) => {
      version += 1;

      const image = { id: `img-${queued.entryId}`, isPrimary: images.length === 0 };

      images.push(image);

      return { ok: true as const, data: { product: product(version, images), image } };
    }),
    setPrimary: vi.fn(async ({ imageId }) => {
      version += 1;

      for (const image of images) {
        image.isPrimary = image.id === imageId;
      }

      return { ok: true as const, data: { product: product(version, images) } };
    }),
    ...overrides,
  };
}

describe('creación seguida de subidas secuenciales', () => {
  it('crea el producto una sola vez y sube en orden', async () => {
    const deps = backendDouble();
    const queue = [entry('a'), entry('b'), entry('c')];

    const progress = await runCreateFlow({}, queue, 'a', deps);

    expect(deps.createProduct).toHaveBeenCalledTimes(1);
    expect(deps.uploadImage).toHaveBeenCalledTimes(3);
    expect(progress.uploaded.map((done) => done.entryId)).toEqual(['a', 'b', 'c']);
    expect(progress.failure).toBeNull();
    expect(isComplete(progress)).toBe(true);
  });

  it('cada subida usa la versión que devolvió la anterior, no la de la creación', async () => {
    const deps = backendDouble();

    await runCreateFlow({}, [entry('a'), entry('b'), entry('c')], 'a', deps);

    const versions = vi.mocked(deps.uploadImage).mock.calls.map(([input]) => input.expectedVersion);

    // 1 al crear; 2 y 3 tras la primera y la segunda subida.
    expect(versions).toEqual([1, 2, 3]);
  });

  it('no sube nada en paralelo: cada llamada termina antes de la siguiente', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const base = backendDouble();

    const deps = backendDouble({
      uploadImage: vi.fn(async (input) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        const result = await base.uploadImage(input);

        inFlight -= 1;

        return result;
      }),
    });

    await runCreateFlow({}, [entry('a'), entry('b'), entry('c')], 'a', deps);

    expect(maxInFlight).toBe(1);
  });
});

describe('imagen principal', () => {
  it('no llama a setPrimary si la elegida ya es la que fijó el backend', async () => {
    const deps = backendDouble();

    // El backend marca principal a la primera que recibe, y aquí la elegida es esa.
    const progress = await runCreateFlow({}, [entry('a'), entry('b')], 'a', deps);

    expect(deps.setPrimary).not.toHaveBeenCalled();
    expect(progress.primaryApplied).toBe(true);
  });

  it('aplica la principal elegida cuando no coincide, con la última versión', async () => {
    const deps = backendDouble();

    const progress = await runCreateFlow({}, [entry('a'), entry('b')], 'b', deps);

    expect(deps.setPrimary).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deps.setPrimary).mock.calls[0]?.[0]).toMatchObject({
      imageId: 'img-b',
      expectedVersion: 3,
    });
    expect(progress.primaryApplied).toBe(true);
  });

  it('sin imágenes no hay principal que aplicar', async () => {
    const deps = backendDouble();

    const progress = await runCreateFlow({}, [], null, deps);

    expect(deps.uploadImage).not.toHaveBeenCalled();
    expect(deps.setPrimary).not.toHaveBeenCalled();
    expect(isComplete(progress)).toBe(true);
  });
});

describe('fallo parcial y reintento', () => {
  it('conserva el producto y lo ya subido, y señala qué falló', async () => {
    const base = backendDouble();
    let attempts = 0;

    const deps = backendDouble({
      createProduct: base.createProduct,
      uploadImage: vi.fn(async (input) => {
        attempts += 1;

        if (attempts === 2) {
          return { ok: false as const, code: 'service_unavailable' };
        }

        return base.uploadImage(input);
      }),
    });

    const queue = [entry('a'), entry('b'), entry('c')];
    const progress = await runCreateFlow({}, queue, 'a', deps);

    expect(progress.product).not.toBeNull();
    expect(progress.uploaded.map((done) => done.entryId)).toEqual(['a']);
    expect(progress.failure).toEqual({ entryId: 'b', code: 'service_unavailable' });

    const summary = describeProgress(progress, queue);

    expect(summary).toMatchObject({ uploaded: 1, total: 3 });
    expect(summary.pending.map((pending) => pending.entryId)).toEqual(['b', 'c']);
  });

  it('el resumen nunca cuenta más subidas que las imágenes visibles', () => {
    const progress = {
      product: null,
      uploaded: [
        { entryId: 'a', imageId: 'img-a' },
        { entryId: 'fantasma', imageId: 'img-x' },
      ],
      failure: null,
      primaryApplied: false,
    };

    const summary = describeProgress(progress, [entry('a')]);

    expect(summary.uploaded).toBe(1);
    expect(summary.total).toBe(1);
    expect(summary.uploaded).toBeLessThanOrEqual(summary.total);
  });

  it('el reintento NO vuelve a crear el producto ni resube lo ya subido', async () => {
    const base = backendDouble();
    let failNext = true;

    const deps = backendDouble({
      createProduct: base.createProduct,
      uploadImage: vi.fn(async (input) => {
        if (failNext && input.entry.entryId === 'b') {
          failNext = false;

          return { ok: false as const, code: 'service_unavailable' };
        }

        return base.uploadImage(input);
      }),
    });

    const queue = [entry('a'), entry('b'), entry('c')];
    const first = await runCreateFlow({}, queue, 'a', deps);

    expect(first.failure?.entryId).toBe('b');

    const second = await runCreateFlow({}, queue, 'a', deps, first);

    expect(deps.createProduct).toHaveBeenCalledTimes(1);
    expect(second.failure).toBeNull();
    expect(second.uploaded.map((done) => done.entryId)).toEqual(['a', 'b', 'c']);

    // 'a' se subió una sola vez en total, pese al reintento.
    const uploadedA = vi
      .mocked(deps.uploadImage)
      .mock.calls.filter(([input]) => input.entry.entryId === 'a');

    expect(uploadedA).toHaveLength(1);
  });

  it('el reintento continúa con la última versión autoritativa recibida', async () => {
    const base = backendDouble();
    let failNext = true;

    const deps = backendDouble({
      createProduct: base.createProduct,
      uploadImage: vi.fn(async (input) => {
        if (failNext && input.entry.entryId === 'b') {
          failNext = false;

          return { ok: false as const, code: 'service_unavailable' };
        }

        return base.uploadImage(input);
      }),
    });

    const queue = [entry('a'), entry('b')];
    const first = await runCreateFlow({}, queue, 'a', deps);

    await runCreateFlow({}, queue, 'a', deps, first);

    const retryCall = vi
      .mocked(deps.uploadImage)
      .mock.calls.filter(([input]) => input.entry.entryId === 'b')
      .at(-1);

    // Tras subir 'a' la versión pasó a 2: el reintento parte de ahí, no de la 1 inicial.
    expect(retryCall?.[0].expectedVersion).toBe(2);
  });

  it('si falla la creación no se sube nada y no queda producto', async () => {
    const deps = backendDouble({
      createProduct: vi.fn(async () => ({ ok: false as const, code: 'invalid_request' })),
    });

    const progress = await runCreateFlow({}, [entry('a')], 'a', deps);

    expect(progress).toEqual({
      product: null,
      uploaded: [],
      failure: { entryId: null, code: 'invalid_request' },
      primaryApplied: false,
    });
    expect(deps.uploadImage).not.toHaveBeenCalled();
  });
});

describe('claves de idempotencia', () => {
  it('cada imagen usa la suya y la conserva en el reintento', async () => {
    const base = backendDouble();
    let failNext = true;

    const deps = backendDouble({
      createProduct: base.createProduct,
      uploadImage: vi.fn(async (input) => {
        if (failNext && input.entry.entryId === 'b') {
          failNext = false;

          return { ok: false as const, code: 'service_unavailable' };
        }

        return base.uploadImage(input);
      }),
    });

    const queue = [entry('a'), entry('b')];
    const first = await runCreateFlow({}, queue, 'a', deps);

    await runCreateFlow({}, queue, 'a', deps, first);

    const keysByEntry = vi
      .mocked(deps.uploadImage)
      .mock.calls.map(([input]) => [input.entry.entryId, input.entry.idempotencyKey] as const);

    // Distinta por imagen…
    expect(new Set(keysByEntry.map(([, key]) => key)).size).toBe(2);
    // …y estable entre el intento fallido y el reintento de esa misma imagen.
    expect(keysByEntry.filter(([id]) => id === 'b').map(([, key]) => key)).toEqual([
      'key-b',
      'key-b',
    ]);
  });
});
