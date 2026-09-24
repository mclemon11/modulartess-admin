import { describe, expect, it, vi } from 'vitest';

import type { AdminProduct } from '@/lib/api/catalog';

import {
  describeFailedStep,
  describeProgress,
  EMPTY_PROGRESS,
  isComplete,
  runCreateFlow,
  withRereadProduct,
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
    intent: 'gallery',
    uploadedImageId: null,
  };
}

function draft(draftId: string): VariantDraft {
  return {
    draftId,
    sku: `SKU-${draftId.toUpperCase()}`,
    priceCop: '1490000',
    inventory: { mode: 'tracked', quantity: '2', lowStockThreshold: '0', status: 'in_stock' },
    attributes: [{ key: 'finish', value: draftId, label: draftId }],
  };
}

/**
 * Producto con la versión, las imágenes y la preparación que el backend devolvería tras cada paso.
 *
 * `publicationReadiness` viene del backend en **cada** respuesta: el flujo la lee de ahí y nunca la
 * calcula. Las imágenes no intervienen: el contrato ya no publica `primary_image` ni `gallery`, así
 * que `ready` no depende de cuántas haya.
 */
function product(
  version: number,
  images: { id: string; isPrimary: boolean }[] = [],
  ready = false,
): AdminProduct {
  return {
    id: 'prd_1',
    version,
    images: images.map((image) => ({ ...image, status: 'active' })),
    publicationReadiness: {
      ready,
      missing: ready ? [] : ['description', 'materials'],
    },
  } as unknown as AdminProduct;
}

function input(overrides: Partial<CreateFlowInput> = {}): CreateFlowInput {
  return {
    intent: 'draft',
    fields: {},
    enrichment: null,
    queue: [],
    primaryEntryId: null,
    variants: [],
    ...overrides,
  };
}

/**
 * Dobles que imitan al backend: cada operación incrementa la versión del producto.
 *
 * `ready` fija lo que el backend responderá en `publicationReadiness`, que es lo único que decide
 * si el flujo llega a publicar.
 */
function backendDouble(overrides: Partial<CreateFlowDeps> = {}, ready = false): CreateFlowDeps {
  const images: { id: string; isPrimary: boolean }[] = [];
  let version = 1;

  return {
    createProduct: vi.fn(async () => ({ ok: true as const, data: product(version, [], ready) })),
    enrichProduct: vi.fn(async () => {
      version += 1;

      return { ok: true as const, data: product(version, images, ready) };
    }),
    uploadImage: vi.fn(async ({ entry: queued }) => {
      version += 1;

      const image = { id: `img-${queued.entryId}`, isPrimary: images.length === 0 };

      images.push(image);

      return { ok: true as const, data: { product: product(version, images, ready), image } };
    }),
    setPrimary: vi.fn(async ({ imageId }) => {
      version += 1;

      for (const image of images) {
        image.isPrimary = image.id === imageId;
      }

      return { ok: true as const, data: { product: product(version, images, ready) } };
    }),
    createVariant: vi.fn(async ({ draft: pending }) => {
      version += 1;

      return {
        ok: true as const,
        data: {
          product: product(version, images, ready),
          variant: { id: `var-${pending.draftId}` },
        },
      };
    }),
    publishProduct: vi.fn(async () => {
      version += 1;

      return { ok: true as const, data: product(version, images, ready) };
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
        published: false,
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
      published: false,
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

describe('intención de publicar', () => {
  it('guardar borrador nunca publica, aunque el producto esté listo', async () => {
    const deps = backendDouble({}, true);

    const progress = await runCreateFlow(input({ intent: 'draft' }), deps);

    expect(deps.publishProduct).not.toHaveBeenCalled();
    expect(progress.published).toBe(false);
  });

  it('publicar guarda primero y publica con la última versión cuando ready=true', async () => {
    const deps = backendDouble({}, true);

    const progress = await runCreateFlow(
      input({
        intent: 'publish',
        enrichment: { featured: true },
        queue: [entry('a')],
        primaryEntryId: 'a',
        variants: [draft('roble')],
      }),
      deps,
    );

    expect(deps.publishProduct).toHaveBeenCalledTimes(1);
    // 1 crear, 2 enriquecer, 3 imagen, 4 variante: publica con la versión 4, la última devuelta.
    expect(vi.mocked(deps.publishProduct).mock.calls[0]?.[0]).toMatchObject({
      productId: 'prd_1',
      expectedVersion: 4,
    });
    expect(progress.published).toBe(true);
    expect(progress.failure).toBeNull();
  });

  it('publica sin ninguna imagen: las imágenes no son un requisito', async () => {
    const deps = backendDouble({}, true);

    const progress = await runCreateFlow(input({ intent: 'publish' }), deps);

    expect(deps.uploadImage).not.toHaveBeenCalled();
    expect(deps.setPrimary).not.toHaveBeenCalled();
    expect(deps.publishProduct).toHaveBeenCalledTimes(1);
    // Publica con la versión de la creación: no hubo ningún paso intermedio.
    expect(vi.mocked(deps.publishProduct).mock.calls[0]?.[0]).toMatchObject({
      productId: 'prd_1',
      expectedVersion: 1,
    });
    expect(progress.published).toBe(true);
    expect(progress.failure).toBeNull();
  });

  it('con ready=false conserva el borrador y NO llama a publish', async () => {
    const deps = backendDouble({}, false);

    const progress = await runCreateFlow(
      input({ intent: 'publish', queue: [entry('a')], primaryEntryId: 'a' }),
      deps,
    );

    expect(deps.publishProduct).not.toHaveBeenCalled();
    expect(progress.published).toBe(false);
    // Todo lo demás sí se guardó: el borrador queda completo y con sus imágenes.
    expect(progress.product).not.toBeNull();
    expect(progress.uploaded.map((done) => done.entryId)).toEqual(['a']);
    expect(progress.failure).toBeNull();
    expect(progress.product?.publicationReadiness.ready).toBe(false);
  });

  it('la preparación sale de la última respuesta, no de la primera', async () => {
    // El backend puede pasar de «no listo» a «listo» al enriquecer: lo que decide es la respuesta
    // más reciente.
    let version = 1;
    const deps = backendDouble({
      createProduct: vi.fn(async () => ({ ok: true as const, data: product(version, [], false) })),
      enrichProduct: vi.fn(async () => {
        version = 2;

        return { ok: true as const, data: product(version, [], true) };
      }),
    });

    const progress = await runCreateFlow(
      input({ intent: 'publish', enrichment: { featured: true } }),
      deps,
    );

    expect(deps.publishProduct).toHaveBeenCalledTimes(1);
    expect(progress.published).toBe(true);
  });

  it('un fallo al publicar conserva todo lo guardado y no lo repite al reintentar', async () => {
    const base = backendDouble({}, true);
    let failNext = true;
    const deps = backendDouble(
      {
        createProduct: base.createProduct,
        publishProduct: vi.fn(async (args) => {
          if (failNext) {
            failNext = false;

            return { ok: false as const, code: 'version_conflict' };
          }

          return base.publishProduct(args);
        }),
      },
      true,
    );

    const payload = input({ intent: 'publish', queue: [entry('a')], primaryEntryId: 'a' });
    const first = await runCreateFlow(payload, deps);

    expect(first.failure).toEqual({ step: 'publish', entryId: null, code: 'version_conflict' });
    expect(first.product).not.toBeNull();
    expect(first.published).toBe(false);

    const second = await runCreateFlow(payload, deps, first);

    expect(second.published).toBe(true);
    expect(deps.createProduct).toHaveBeenCalledTimes(1);
    // La imagen no se volvió a subir: ya estaba confirmada en el primer intento.
    expect(deps.uploadImage).toHaveBeenCalledTimes(1);
  });
});

describe('recuperación del alta por etapas', () => {
  /*
   * El `POST` salió bien y falló un paso posterior: el producto **existe**. Reintentar tiene que
   * reutilizar su id y su versión, y nunca volver a crearlo.
   */
  it.each(['enrich', 'image', 'primary', 'variant', 'publish'] as const)(
    'si falla «%s», el reintento no repite el POST',
    async (step) => {
      let failOnce = true;
      const deps = backendDouble({}, true);
      const failing = (name: typeof step) => {
        const original = {
          enrich: deps.enrichProduct,
          image: deps.uploadImage,
          primary: deps.setPrimary,
          variant: deps.createVariant,
          publish: deps.publishProduct,
        }[name] as (...args: never[]) => Promise<unknown>;

        return vi.fn(async (...args: never[]) => {
          if (failOnce) {
            failOnce = false;

            return { ok: false as const, code: 'service_unavailable' };
          }

          return original(...args);
        });
      };
      const flaky: CreateFlowDeps = {
        ...deps,
        ...(step === 'enrich' ? { enrichProduct: failing('enrich') as never } : {}),
        ...(step === 'image' ? { uploadImage: failing('image') as never } : {}),
        ...(step === 'primary' ? { setPrimary: failing('primary') as never } : {}),
        ...(step === 'variant' ? { createVariant: failing('variant') as never } : {}),
        ...(step === 'publish' ? { publishProduct: failing('publish') as never } : {}),
      };
      const request = input({
        intent: 'publish',
        enrichment: { featured: true },
        queue: [entry('a'), entry('b')],
        primaryEntryId: 'b',
        variants: [draft('x')],
      });

      const first = await runCreateFlow(request, flaky);

      expect(first.product?.id).toBe('prd_1');
      expect(first.failure?.step).toBe(step);

      const second = await runCreateFlow(request, flaky, first);

      expect(second.failure).toBeNull();
      expect(deps.createProduct).toHaveBeenCalledTimes(1);
    },
  );

  it('si falla el propio POST no hay producto, y no hay nada que recuperar', async () => {
    const deps = backendDouble({
      createProduct: vi.fn(async () => ({ ok: false as const, code: 'sku_conflict' })),
    });

    const result = await runCreateFlow(input(), deps);

    expect(result.product).toBeNull();
    expect(result.failure).toMatchObject({ step: 'create', code: 'sku_conflict' });
    expect(deps.enrichProduct).not.toHaveBeenCalled();
  });

  it('reintentar lo pendiente parte de la última versión devuelta, no de la del alta', async () => {
    let calls = 0;
    const deps = backendDouble();
    const seen: number[] = [];
    const flaky = backendDouble({
      uploadImage: vi.fn(async (args) => {
        seen.push(args.expectedVersion);
        calls += 1;

        return calls === 2
          ? { ok: false as const, code: 'service_unavailable' }
          : deps.uploadImage(args);
      }),
    });

    const first = await runCreateFlow(input({ queue: [entry('a'), entry('b')] }), flaky);

    expect(first.failure?.step).toBe('image');

    await runCreateFlow(input({ queue: [entry('a'), entry('b')] }), flaky, first);

    // La segunda subida se reintenta con la versión que dejó la primera, no con la del POST.
    expect(seen.at(-1)).toBe(first.product?.version);
  });

  it('dice exactamente qué paso falló', () => {
    const queue = [entry('a')];
    const variants = [draft('x')];
    const failure = (
      step: 'enrich' | 'image' | 'primary' | 'variant' | 'publish' | 'create',
      entryId: string | null,
    ) => describeFailedStep({ step, entryId, code: 'service_unavailable' }, { queue, variants });

    expect(failure('image', 'a')).toBe('Subir la imagen «a.jpg».');
    expect(failure('variant', 'x')).toBe('Crear la variante «SKU-X».');
    expect(failure('enrich', null)).toContain('categoría');
    expect(failure('primary', 'a')).toBe('Fijar la imagen de portada.');
    expect(failure('publish', null)).toBe('Publicar el producto.');
  });

  it('el fallo conserva la referencia de un conflicto que el panel no reconoce', async () => {
    const deps = backendDouble({
      enrichProduct: vi.fn(async () => ({
        ok: false as const,
        code: 'conflict_unrecognized',
        reference: 'product_new_rule',
      })),
    });

    const result = await runCreateFlow(input({ enrichment: { featured: true } }), deps);

    expect(result.failure).toMatchObject({
      step: 'enrich',
      code: 'conflict_unrecognized',
      reference: 'product_new_rule',
    });
  });

  /*
   * Tras un conflicto de versión se relee el producto: el reintento parte de lo que de verdad hay.
   * El fallo **se conserva**: releer no es reintentar, y el cambio ajeno tiene que verse antes.
   */
  it('releer tras un conflicto sustituye el producto y conserva el progreso y el fallo', async () => {
    const deps = backendDouble({
      createVariant: vi.fn(async () => ({ ok: false as const, code: 'version_conflict' })),
    });
    const stopped = await runCreateFlow(
      input({ queue: [entry('a')], primaryEntryId: 'a', variants: [draft('x')] }),
      deps,
    );
    const reread = product(40);
    const next = withRereadProduct(stopped, reread);

    expect(next.product?.version).toBe(40);
    expect(next.uploaded).toEqual(stopped.uploaded);
    expect(next.failure).toEqual(stopped.failure);
  });

  it('releer otro producto, o sin producto, no cambia nada', () => {
    const other = { ...product(9), id: 'prd_otro' } as AdminProduct;

    expect(withRereadProduct(EMPTY_PROGRESS, product(9))).toBe(EMPTY_PROGRESS);
    expect(withRereadProduct({ ...EMPTY_PROGRESS, product: product(2) }, other).product?.id).toBe(
      'prd_1',
    );
  });
});
