import { describe, expect, it, vi } from 'vitest';

import type { AdminProduct } from '@/lib/api/catalog';

import {
  describeProgress,
  isComplete,
  runCreateFlow,
  type CreateFlowDeps,
  type CreateFlowInput,
} from './create-product-flow';
import type { QueuedImage } from './image-queue';
import type { VariantDraft } from './variant-draft';

function entry(entryId: string): QueuedImage {
  return {
    entryId,
    file: new File(['x'], `${entryId}.jpg`, { type: 'image/jpeg' }),
    previewUrl: `blob:${entryId}`,
    altText: `alt ${entryId}`,
    idempotencyKey: `key-${entryId}`,
  };
}

function draft(draftId: string): VariantDraft {
  return {
    draftId,
    sku: `SKU-${draftId.toUpperCase()}`,
    priceCop: '1490000',
    stockQuantity: '2',
    attributes: [{ key: 'finish', value: draftId, label: draftId }],
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

function input(overrides: Partial<CreateFlowInput> = {}): CreateFlowInput {
  return {
    fields: {},
    enrichment: null,
    queue: [],
    primaryEntryId: null,
    variants: [],
    ...overrides,
  };
}

/** Dobles que imitan al backend: cada operación incrementa la versión del producto. */
function backendDouble(overrides: Partial<CreateFlowDeps> = {}): CreateFlowDeps {
  const images: { id: string; isPrimary: boolean }[] = [];
  let version = 1;

  return {
    createProduct: vi.fn(async () => ({ ok: true as const, data: product(version, []) })),
    enrichProduct: vi.fn(async () => {
      version += 1;

      return { ok: true as const, data: product(version, images) };
    }),
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
    createVariant: vi.fn(async ({ draft: pending }) => {
      version += 1;

      return {
        ok: true as const,
        data: { product: product(version, images), variant: { id: `var-${pending.draftId}` } },
      };
    }),
    ...overrides,
  };
}

describe('secuencia producto → contenido → imágenes → variantes', () => {
  it('crea el producto una sola vez y recorre los pasos en orden', async () => {
    const deps = backendDouble();
    const order: string[] = [];
    const traced = backendDouble({
      createProduct: vi.fn(async (fields) => {
        order.push('create');

        return deps.createProduct(fields);
      }),
      enrichProduct: vi.fn(async (args) => {
        order.push('enrich');

        return deps.enrichProduct(args);
      }),
      uploadImage: vi.fn(async (args) => {
        order.push(`image:${args.entry.entryId}`);

        return deps.uploadImage(args);
      }),
      createVariant: vi.fn(async (args) => {
        order.push(`variant:${args.draft.draftId}`);

        return deps.createVariant(args);
      }),
    });

    const progress = await runCreateFlow(
      input({
        enrichment: { featured: true },
        queue: [entry('a'), entry('b')],
        primaryEntryId: 'a',
        variants: [draft('roble'), draft('nogal')],
      }),
      traced,
    );

    expect(order).toEqual([
      'create',
      'enrich',
      'image:a',
      'image:b',
      'variant:roble',
      'variant:nogal',
    ]);
    expect(traced.createProduct).toHaveBeenCalledTimes(1);
    expect(progress.failure).toBeNull();
    expect(progress.variants.map((done) => done.draftId)).toEqual(['roble', 'nogal']);
    expect(isComplete(progress)).toBe(true);
  });

  it('los ejes se declaran antes de crear ninguna variante', async () => {
    // El backend exige que cada variante lleve exactamente los ejes declarados: crear variantes
    // antes del PATCH que los declara las haría rechazar.
    const calls: string[] = [];
    const base = backendDouble();
    const deps = backendDouble({
      enrichProduct: vi.fn(async (args) => {
        calls.push('enrich');

        return base.enrichProduct(args);
      }),
      createVariant: vi.fn(async (args) => {
        calls.push('variant');

        return base.createVariant(args);
      }),
    });

    await runCreateFlow(
      input({
        enrichment: { attributes: [{ key: 'finish', label: 'Acabado' }] },
        variants: [draft('roble')],
      }),
      deps,
    );

    expect(calls).toEqual(['enrich', 'variant']);
  });

  it('no gasta un PATCH cuando no hay nada que enriquecer', async () => {
    const deps = backendDouble();

    await runCreateFlow(input(), deps);

    expect(deps.enrichProduct).not.toHaveBeenCalled();
  });

  it('cada paso usa la versión que devolvió el anterior, no la de la creación', async () => {
    const deps = backendDouble();

    await runCreateFlow(
      input({
        enrichment: { featured: true },
        queue: [entry('a'), entry('b')],
        primaryEntryId: 'a',
        variants: [draft('roble'), draft('nogal')],
      }),
      deps,
    );

    const enrichVersions = vi
      .mocked(deps.enrichProduct)
      .mock.calls.map(([args]) => args.expectedVersion);
    const imageVersions = vi
      .mocked(deps.uploadImage)
      .mock.calls.map(([args]) => args.expectedVersion);
    const variantVersions = vi
      .mocked(deps.createVariant)
      .mock.calls.map(([args]) => args.expectedVersion);

    // 1 al crear; 2 tras el PATCH; 3 tras la primera imagen; 4 y 5 tras la segunda y la primera
    // variante.
    expect(enrichVersions).toEqual([1]);
    expect(imageVersions).toEqual([2, 3]);
    expect(variantVersions).toEqual([4, 5]);
  });

  it('no crea nada en paralelo: cada llamada termina antes de la siguiente', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const base = backendDouble();

    function serialised<T extends (...args: never[]) => Promise<unknown>>(operation: T): T {
      return (async (...args: Parameters<T>) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        const result = await operation(...args);

        inFlight -= 1;

        return result;
      }) as unknown as T;
    }

    const deps = backendDouble({
      uploadImage: vi.fn(serialised(base.uploadImage)),
      createVariant: vi.fn(serialised(base.createVariant)),
    });

    await runCreateFlow(
      input({
        queue: [entry('a'), entry('b'), entry('c')],
        primaryEntryId: 'a',
        variants: [draft('roble'), draft('nogal')],
      }),
      deps,
    );

    expect(maxInFlight).toBe(1);
  });
});

describe('imagen principal', () => {
  it('no llama a setPrimary si la elegida ya es la que fijó el backend', async () => {
    const deps = backendDouble();

    // El backend marca principal a la primera que recibe, y aquí la elegida es esa.
    const progress = await runCreateFlow(
      input({ queue: [entry('a'), entry('b')], primaryEntryId: 'a' }),
      deps,
    );

    expect(deps.setPrimary).not.toHaveBeenCalled();
    expect(progress.primaryApplied).toBe(true);
  });

  it('aplica la principal elegida cuando no coincide, con la última versión', async () => {
    const deps = backendDouble();

    const progress = await runCreateFlow(
      input({ queue: [entry('a'), entry('b')], primaryEntryId: 'b' }),
      deps,
    );

    expect(deps.setPrimary).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deps.setPrimary).mock.calls[0]?.[0]).toMatchObject({
      imageId: 'img-b',
      expectedVersion: 3,
    });
    expect(progress.primaryApplied).toBe(true);
  });

  it('sin imágenes no hay principal que aplicar', async () => {
    const deps = backendDouble();

    const progress = await runCreateFlow(input(), deps);

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
      uploadImage: vi.fn(async (args) => {
        attempts += 1;

        if (attempts === 2) {
          return { ok: false as const, code: 'service_unavailable' };
        }

        return base.uploadImage(args);
      }),
    });

    const queue = [entry('a'), entry('b'), entry('c')];
    const progress = await runCreateFlow(input({ queue, primaryEntryId: 'a' }), deps);

    expect(progress.product).not.toBeNull();
    expect(progress.uploaded.map((done) => done.entryId)).toEqual(['a']);
    expect(progress.failure).toEqual({
      step: 'image',
      entryId: 'b',
      code: 'service_unavailable',
    });

    const summary = describeProgress(progress, { queue, variants: [] });

    expect(summary).toMatchObject({ uploaded: 1, totalImages: 3 });
    expect(summary.pendingImages.map((pending) => pending.entryId)).toEqual(['b', 'c']);
  });

  it('el resumen nunca cuenta más pasos que los que siguen visibles', () => {
    const summary = describeProgress(
      {
        product: null,
        enriched: true,
        uploaded: [
          { entryId: 'a', imageId: 'img-a' },
          { entryId: 'fantasma', imageId: 'img-x' },
        ],
        primaryApplied: false,
        variants: [{ draftId: 'fantasma', variantId: 'var-x' }],
        failure: null,
      },
      { queue: [entry('a')], variants: [] },
    );

    expect(summary.uploaded).toBe(1);
    expect(summary.totalImages).toBe(1);
    expect(summary.createdVariants).toBe(0);
    expect(summary.uploaded).toBeLessThanOrEqual(summary.totalImages);
  });

  it('el reintento NO vuelve a crear el producto ni resube lo ya subido', async () => {
    const base = backendDouble();
    let failNext = true;

    const deps = backendDouble({
      createProduct: base.createProduct,
      enrichProduct: base.enrichProduct,
      uploadImage: vi.fn(async (args) => {
        if (failNext && args.entry.entryId === 'b') {
          failNext = false;

          return { ok: false as const, code: 'service_unavailable' };
        }

        return base.uploadImage(args);
      }),
    });

    const payload = input({
      enrichment: { featured: true },
      queue: [entry('a'), entry('b'), entry('c')],
      primaryEntryId: 'a',
    });
    const first = await runCreateFlow(payload, deps);

    expect(first.failure?.entryId).toBe('b');

    const second = await runCreateFlow(payload, deps, first);

    expect(deps.createProduct).toHaveBeenCalledTimes(1);
    // El PATCH de contenido tampoco se repite: ya se aplicó en el primer intento.
    expect(deps.enrichProduct).toHaveBeenCalledTimes(1);
    expect(second.failure).toBeNull();
    expect(second.uploaded.map((done) => done.entryId)).toEqual(['a', 'b', 'c']);

    // 'a' se subió una sola vez en total, pese al reintento.
    const uploadedA = vi
      .mocked(deps.uploadImage)
      .mock.calls.filter(([args]) => args.entry.entryId === 'a');

    expect(uploadedA).toHaveLength(1);
  });

  it('el reintento no recrea las variantes que ya existen', async () => {
    const base = backendDouble();
    let failNext = true;

    const deps = backendDouble({
      createProduct: base.createProduct,
      createVariant: vi.fn(async (args) => {
        if (failNext && args.draft.draftId === 'nogal') {
          failNext = false;

          return { ok: false as const, code: 'service_unavailable' };
        }

        return base.createVariant(args);
      }),
    });

    const payload = input({ variants: [draft('roble'), draft('nogal'), draft('wengue')] });
    const first = await runCreateFlow(payload, deps);

    expect(first.failure).toEqual({
      step: 'variant',
      entryId: 'nogal',
      code: 'service_unavailable',
    });
    expect(first.variants.map((done) => done.draftId)).toEqual(['roble']);

    const second = await runCreateFlow(payload, deps, first);

    expect(second.failure).toBeNull();
    expect(second.variants.map((done) => done.draftId)).toEqual(['roble', 'nogal', 'wengue']);

    // 'roble' se creó una sola vez: su SKU ya está reservado y repetirlo sería un conflicto.
    const roble = vi
      .mocked(deps.createVariant)
      .mock.calls.filter(([args]) => args.draft.draftId === 'roble');

    expect(roble).toHaveLength(1);
  });

  it('el reintento continúa con la última versión autoritativa recibida', async () => {
    const base = backendDouble();
    let failNext = true;

    const deps = backendDouble({
      createProduct: base.createProduct,
      createVariant: vi.fn(async (args) => {
        if (failNext && args.draft.draftId === 'nogal') {
          failNext = false;

          return { ok: false as const, code: 'service_unavailable' };
        }

        return base.createVariant(args);
      }),
    });

    const payload = input({ variants: [draft('roble'), draft('nogal')] });
    const first = await runCreateFlow(payload, deps);

    await runCreateFlow(payload, deps, first);

    const retry = vi
      .mocked(deps.createVariant)
      .mock.calls.filter(([args]) => args.draft.draftId === 'nogal')
      .at(-1);

    // Tras crear 'roble' la versión pasó a 2: el reintento parte de ahí, no de la 1 inicial.
    expect(retry?.[0].expectedVersion).toBe(2);
  });

  it('si falla la creación no se toca nada más y no queda producto', async () => {
    const deps = backendDouble({
      createProduct: vi.fn(async () => ({ ok: false as const, code: 'invalid_request' })),
    });

    const progress = await runCreateFlow(
      input({ queue: [entry('a')], primaryEntryId: 'a', variants: [draft('roble')] }),
      deps,
    );

    expect(progress).toEqual({
      product: null,
      enriched: false,
      uploaded: [],
      primaryApplied: false,
      variants: [],
      failure: { step: 'create', entryId: null, code: 'invalid_request' },
    });
    expect(deps.enrichProduct).not.toHaveBeenCalled();
    expect(deps.uploadImage).not.toHaveBeenCalled();
    expect(deps.createVariant).not.toHaveBeenCalled();
  });

  it('un fallo al enriquecer conserva el producto creado y no sube imágenes', async () => {
    const base = backendDouble();
    const deps = backendDouble({
      createProduct: base.createProduct,
      enrichProduct: vi.fn(async () => ({ ok: false as const, code: 'version_conflict' })),
    });

    const progress = await runCreateFlow(
      input({ enrichment: { featured: true }, queue: [entry('a')], primaryEntryId: 'a' }),
      deps,
    );

    expect(progress.product).not.toBeNull();
    expect(progress.enriched).toBe(false);
    expect(progress.failure).toEqual({ step: 'enrich', entryId: null, code: 'version_conflict' });
    expect(deps.uploadImage).not.toHaveBeenCalled();
  });
});

describe('claves de idempotencia', () => {
  it('cada imagen usa la suya y la conserva en el reintento', async () => {
    const base = backendDouble();
    let failNext = true;

    const deps = backendDouble({
      createProduct: base.createProduct,
      uploadImage: vi.fn(async (args) => {
        if (failNext && args.entry.entryId === 'b') {
          failNext = false;

          return { ok: false as const, code: 'service_unavailable' };
        }

        return base.uploadImage(args);
      }),
    });

    const payload = input({ queue: [entry('a'), entry('b')], primaryEntryId: 'a' });
    const first = await runCreateFlow(payload, deps);

    await runCreateFlow(payload, deps, first);

    const keysByEntry = vi
      .mocked(deps.uploadImage)
      .mock.calls.map(([args]) => [args.entry.entryId, args.entry.idempotencyKey] as const);

    // Distinta por imagen…
    expect(new Set(keysByEntry.map(([, key]) => key)).size).toBe(2);
    // …y estable entre el intento fallido y el reintento de esa misma imagen.
    expect(keysByEntry.filter(([id]) => id === 'b').map(([, key]) => key)).toEqual([
      'key-b',
      'key-b',
    ]);
  });
});
