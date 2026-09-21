import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { isPrimaryIn, runCoverFlow, type CoverDeps } from './cover-flow';
import {
  addToQueue,
  coverCandidate,
  galleryEntries,
  markUploaded,
  moveInQueue,
  pendingUploads,
  removeFromQueue,
  replaceFile,
  resolvePrimary,
  setCoverIntent,
  type QueuedImage,
} from './image-queue';

import type { AdminProduct, AdminProductImage } from '@/lib/api/catalog';

/**
 * «Cambiar portada» significa que, al terminar, esa imagen tiene `isPrimary: true`.
 *
 * El fallo que esto cierra era concreto: el archivo elegido en el bloque Portada se encolaba igual
 * que uno de galería, se subía con el lote y ahí acababa la cosa. Nadie mandaba el `PATCH`, la
 * imagen quedaba como una más, y la pantalla decía que la portada había cambiado.
 */

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const executable = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function image(id: string, isPrimary: boolean): AdminProductImage {
  return {
    id,
    isPrimary,
    position: 0,
    status: 'active',
    altText: `alt ${id}`,
    publicUrl: `https://cdn.example/${id}.jpg`,
  } as unknown as AdminProductImage;
}

function product(version: number, images: readonly AdminProductImage[]): AdminProduct {
  return { id: 'prd_1', version, images, variants: [] } as unknown as AdminProduct;
}

function file(name: string): File {
  return { name, size: 1024, type: 'image/jpeg' } as File;
}

function entry(id: string, overrides: Partial<QueuedImage> = {}): QueuedImage {
  return {
    entryId: id,
    file: file(`${id}.jpg`),
    previewUrl: `blob:${id}`,
    altText: `alt ${id}`,
    idempotencyKey: `key-${id}`,
    intent: 'gallery',
    uploadedImageId: null,
    ...overrides,
  };
}

/** Un backend de mentira que se comporta como el de verdad con `isPrimary`. */
function backend(initial: AdminProduct) {
  let current = initial;
  const calls: string[] = [];

  return {
    calls,
    get product() {
      return current;
    },
    deps: {
      upload: ({ expectedVersion }) => {
        calls.push(`upload@v${expectedVersion}`);

        const id = `img_${current.images.length + 1}`;
        // El backend marca principal la primera imagen del producto, y solo esa.
        const isPrimary = current.images.length === 0;

        current = product(current.version + 1, [...current.images, image(id, isPrimary)]);

        return Promise.resolve({
          ok: true as const,
          data: { product: current, image: { id } },
        });
      },
      promote: ({ imageId, expectedVersion }) => {
        calls.push(`promote:${imageId}@v${expectedVersion}`);

        current = product(
          current.version + 1,
          current.images.map((item) => ({ ...item, isPrimary: item.id === imageId })),
        );

        return Promise.resolve({ ok: true as const, data: { product: current } });
      },
    } satisfies CoverDeps,
  };
}

describe('cambiar portada termina con la imagen nueva como principal', () => {
  it('sube, marca y lo comprueba en la respuesta', async () => {
    const server = backend(product(4, [image('img_1', true)]));
    const outcome = await runCoverFlow(server.product, null, server.deps);

    expect(outcome.ok).toBe(true);
    expect(server.calls).toEqual(['upload@v4', 'promote:img_2@v5']);

    if (!outcome.ok) throw new Error('debería haber salido bien');

    expect(outcome.imageId).toBe('img_2');
    expect(outcome.alreadyPrimary).toBe(false);
    expect(isPrimaryIn(outcome.product, 'img_2')).toBe(true);
  });

  it('la portada anterior sigue activa y pasa a la galería', async () => {
    const server = backend(product(4, [image('img_1', true)]));
    const outcome = await runCoverFlow(server.product, null, server.deps);

    if (!outcome.ok) throw new Error('debería haber salido bien');

    const previous = outcome.product.images.find((item) => item.id === 'img_1');

    expect(previous?.status).toBe('active');
    expect(previous?.isPrimary).toBe(false);
    // Nunca se archiva: no hay ninguna llamada de archivado en el flujo.
    expect(server.calls.some((call) => call.includes('archive'))).toBe(false);
  });

  it('la primera imagen de un producto vacío no gasta un PATCH', async () => {
    const server = backend(product(4, []));
    const outcome = await runCoverFlow(server.product, null, server.deps);

    expect(server.calls).toEqual(['upload@v4']);

    if (!outcome.ok) throw new Error('debería haber salido bien');

    // Se **comprueba** que el backend la devolvió como principal, no se da por hecho.
    expect(outcome.alreadyPrimary).toBe(true);
    expect(isPrimaryIn(outcome.product, 'img_1')).toBe(true);
  });

  /*
   * Sensibilidad del paso de comprobación: si el backend acepta el `PATCH` pero no devuelve la
   * imagen como principal, eso **no** es un éxito. Antes se anunciaba «Portada actualizada» sin
   * mirar la respuesta.
   */
  it('un 200 que no deja la imagen principal se trata como fallo', async () => {
    const outcome = await runCoverFlow(product(4, [image('img_1', true)]), null, {
      upload: ({ expectedVersion }) =>
        Promise.resolve({
          ok: true as const,
          data: {
            product: product(expectedVersion + 1, [image('img_1', true), image('img_2', false)]),
            image: { id: 'img_2' },
          },
        }),
      // Contesta que sí, pero devuelve el producto sin cambiar.
      promote: ({ expectedVersion }) =>
        Promise.resolve({
          ok: true as const,
          data: {
            product: product(expectedVersion + 1, [image('img_1', true), image('img_2', false)]),
          },
        }),
    });

    expect(outcome.ok).toBe(false);

    if (outcome.ok) throw new Error('no debería haber salido bien');

    expect(outcome.code).toBe('cover_not_applied');
    expect(outcome.step).toBe('promote');
    expect(outcome.imageId).toBe('img_2');
  });
});

describe('fallo parcial: subida correcta, PATCH fallido', () => {
  it('no se da por terminado y conserva el imageId', async () => {
    const upload = vi.fn(({ expectedVersion }: { expectedVersion: number }) =>
      Promise.resolve({
        ok: true as const,
        data: {
          product: product(expectedVersion + 1, [image('img_1', true), image('img_2', false)]),
          image: { id: 'img_2' },
        },
      }),
    );
    const outcome = await runCoverFlow(product(4, [image('img_1', true)]), null, {
      upload,
      promote: () => Promise.resolve({ ok: false as const, code: 'service_unavailable' }),
    });

    expect(outcome.ok).toBe(false);

    if (outcome.ok) throw new Error('no debería haber salido bien');

    expect(outcome.step).toBe('promote');
    expect(outcome.imageId).toBe('img_2');
    // La versión autoritativa que hace falta para el reintento es la que devolvió la subida.
    expect(outcome.product.version).toBe(5);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('el reintento continúa en el PATCH y NO reenvía el archivo', async () => {
    const upload = vi.fn(() => {
      throw new Error('el archivo no debe volver a subirse');
    });
    const promote = vi.fn(
      ({ imageId, expectedVersion }: { imageId: string; expectedVersion: number }) =>
        Promise.resolve({
          ok: true as const,
          data: {
            product: product(expectedVersion + 1, [image('img_1', false), image(imageId, true)]),
          },
        }),
    );

    // Se reanuda con el `imageId` que quedó guardado en la entrada.
    const outcome = await runCoverFlow(
      product(5, [image('img_1', true), image('img_2', false)]),
      'img_2',
      {
        upload: upload as unknown as CoverDeps['upload'],
        promote,
      },
    );

    expect(upload).not.toHaveBeenCalled();
    expect(promote).toHaveBeenCalledWith({ imageId: 'img_2', expectedVersion: 5 });
    expect(outcome.ok).toBe(true);
  });

  it('un fallo en la subida no inventa ningún imageId', async () => {
    const outcome = await runCoverFlow(product(4, []), null, {
      upload: () => Promise.resolve({ ok: false as const, code: 'service_unavailable' }),
      promote: () => {
        throw new Error('no debería llegar aquí');
      },
    });

    expect(outcome.ok).toBe(false);

    if (outcome.ok) throw new Error('no debería haber salido bien');

    expect(outcome.step).toBe('upload');
    expect(outcome.imageId).toBeNull();
    // El producto que se devuelve es el de entrada: nada cambió.
    expect(outcome.product.version).toBe(4);
  });

  it('un 409 se distingue y detiene el flujo', async () => {
    const outcome = await runCoverFlow(product(4, [image('img_1', true)]), null, {
      upload: () => Promise.resolve({ ok: false as const, code: 'version_conflict' }),
      promote: () => {
        throw new Error('no debería llegar aquí');
      },
    });

    expect(outcome.ok).toBe(false);

    if (outcome.ok) throw new Error('no debería haber salido bien');

    expect(outcome.code).toBe('version_conflict');
  });
});

describe('la intención se conserva en la cola', () => {
  it('un archivo elegido en Portada es candidata, no una imagen de galería', () => {
    const change = addToQueue([], {
      file: file('portada.jpg'),
      previewUrl: 'blob:p',
      entryId: 'p',
      idempotencyKey: 'key-p',
      intent: 'cover',
    });

    expect(coverCandidate(change.queue)?.entryId).toBe('p');
    expect(galleryEntries(change.queue)).toEqual([]);
  });

  /*
   * La garantía central: una selección hecha desde Galería **nunca** se trata como portada, ni
   * siquiera cuando es la única imagen de la cola.
   */
  it('una selección de Galería no se convierte en portada', () => {
    const change = addToQueue([], {
      file: file('galeria.jpg'),
      previewUrl: 'blob:g',
      entryId: 'g',
      idempotencyKey: 'key-g',
      intent: 'gallery',
    });

    expect(coverCandidate(change.queue)).toBeNull();
    expect(resolvePrimary(change.queue, null)).toBeNull();
  });

  it('encolar sin decir la intención es galería, nunca portada', () => {
    const change = addToQueue([], {
      file: file('x.jpg'),
      previewUrl: 'blob:x',
      entryId: 'x',
      idempotencyKey: 'key-x',
    });

    expect(change.queue[0]?.intent).toBe('gallery');
  });

  it('solo puede haber una candidata: la nueva sustituye a la anterior', () => {
    const first = addToQueue([], {
      file: file('a.jpg'),
      previewUrl: 'blob:a',
      entryId: 'a',
      idempotencyKey: 'key-a',
      intent: 'cover',
    }).queue;
    const second = addToQueue(first, {
      file: file('b.jpg'),
      previewUrl: 'blob:b',
      entryId: 'b',
      idempotencyKey: 'key-b',
      intent: 'cover',
    });

    expect(second.queue).toHaveLength(1);
    expect(coverCandidate(second.queue)?.entryId).toBe('b');
    // La vista previa de la descartada se devuelve para revocarla: nunca se subió.
    expect(second.revoked).toEqual(['blob:a']);
  });

  it('no se sustituye en silencio una candidata que ya se subió', () => {
    const queue = [entry('a', { intent: 'cover', uploadedImageId: 'img_9' })];
    const change = addToQueue(queue, {
      file: file('b.jpg'),
      previewUrl: 'blob:b',
      entryId: 'b',
      idempotencyKey: 'key-b',
      intent: 'cover',
    });

    expect(change.queue).toBe(queue);
    expect(change.rejected).toContain('ya se subió');
    expect(change.revoked).toEqual(['blob:b']);
  });

  it('«Convertir en portada» mueve la intención y devuelve la anterior a galería', () => {
    const queue = [entry('a', { intent: 'cover' }), entry('b')];
    const change = setCoverIntent(queue, 'b');

    expect(coverCandidate(change.queue)?.entryId).toBe('b');
    expect(galleryEntries(change.queue).map((item) => item.entryId)).toEqual(['a']);
  });

  it('mover no cruza la frontera entre portada y galería', () => {
    const queue = [entry('a', { intent: 'cover' }), entry('b'), entry('c')];

    // «Subir» desde la primera de galería la pondría encima de la portada: no se permite.
    expect(moveInQueue(queue, 'b', -1).queue).toBe(queue);
    // Dentro de la galería sí se mueve.
    expect(moveInQueue(queue, 'b', 1).queue.map((item) => item.entryId)).toEqual(['a', 'c', 'b']);
  });
});

describe('quitar y reemplazar la candidata', () => {
  it('quitarla revoca su vista previa y limpia la intención', () => {
    const queue = [entry('a', { intent: 'cover' }), entry('b')];
    const change = removeFromQueue(queue, 'a');

    expect(change.revoked).toEqual(['blob:a']);
    expect(coverCandidate(change.queue)).toBeNull();
    // Y la de galería **no** asciende por descarte.
    expect(resolvePrimary(change.queue, 'a')).toBeNull();
  });

  it('reemplazar el archivo estrena clave y olvida lo ya subido', () => {
    const queue = [entry('a', { intent: 'cover', uploadedImageId: 'img_9' })];
    const change = replaceFile(queue, 'a', file('nueva.jpg'), 'blob:nueva', 'key-nueva');
    const replaced = change.queue[0];

    expect(change.revoked).toEqual(['blob:a']);
    expect(replaced?.idempotencyKey).toBe('key-nueva');
    // El id de antes era de otro archivo: darlo por bueno marcaría como portada la imagen vieja.
    expect(replaced?.uploadedImageId).toBeNull();
    expect(replaced?.intent).toBe('cover');
  });

  it('marcar lo subido conserva el resto de la entrada', () => {
    const queue = [entry('a', { intent: 'cover' })];
    const marked = markUploaded(queue, 'a', 'img_7');

    expect(marked[0]?.uploadedImageId).toBe('img_7');
    expect(marked[0]?.idempotencyKey).toBe('key-a');
    expect(marked[0]?.intent).toBe('cover');
  });
});

describe('la pantalla mantiene las dos operaciones separadas', () => {
  const SOURCE = executable(read('src/features/panel/product-images.tsx'));

  it('la portada tiene su propio flujo, no el lote de la galería', () => {
    const cover = SOURCE.slice(
      SOURCE.indexOf('async function handleCover('),
      SOURCE.indexOf('async function handleBatch('),
    );

    expect(cover).toContain('runCoverFlow');
    expect(cover).not.toContain('uploadQueueSequentially');
  });

  /*
   * La prueba que falla si «Cambiar portada» vuelve a usar la cola sin conservar la intención: el
   * lote de galería solo recorre `galleryEntries`, nunca la cola entera.
   */
  it('el lote de galería no toca la candidata a portada', () => {
    const batch = SOURCE.slice(
      SOURCE.indexOf('async function handleBatch('),
      SOURCE.indexOf('async function patchImage('),
    );

    expect(batch).toContain('galleryEntries(queue)');
    // El lote recorre `pending`, que son solo las de galería; nunca `queue` entera.
    expect(batch).toMatch(/uploadQueueSequentially\(\s*product,\s*pending,/);
    expect(batch).not.toMatch(/uploadQueueSequentially\(\s*product,\s*queue,/);
    // Y no manda ningún `isPrimary`: eso solo lo hace el flujo de portada.
    expect(batch).not.toContain('isPrimary');
  });

  it('el archivo elegido en Portada se encola con intención de portada', () => {
    expect(SOURCE).toContain("enqueue(files, 'cover')");
    expect(SOURCE).toContain("enqueue(files, 'gallery')");
  });

  it('no se anuncia el cambio antes de confirmarlo', () => {
    const cover = SOURCE.slice(
      SOURCE.indexOf('async function handleCover('),
      SOURCE.indexOf('async function handleBatch('),
    );
    const success = cover.slice(cover.indexOf('if (outcome.ok)'));

    expect(success).toContain('Portada actualizada');
    // El anuncio vive dentro de la rama de éxito, y el éxito lo decide `runCoverFlow`
    // comprobando `isPrimary` en la respuesta.
    expect(cover.indexOf('Portada actualizada')).toBeGreaterThan(cover.indexOf('if (outcome.ok)'));
  });

  it('las subidas siguen siendo estrictamente secuenciales', () => {
    expect(SOURCE).not.toContain('Promise.all');
    expect(SOURCE).not.toContain('Promise.allSettled');
    expect(executable(read('src/features/panel/cover-flow.ts'))).not.toContain('Promise.all');
  });
});

describe('el conteo durante un fallo parcial de la portada', () => {
  const IMAGE_MAX_ACTIVE = 10;

  /** Lo que hace la pantalla: activas del producto más lo que falta por subir. */
  const planned = (activeCount: number, queue: readonly QueuedImage[]) =>
    activeCount + pendingUploads(queue).length;

  /*
   * El escenario exacto: la candidata se subió y el `PATCH` falló. El backend ya la devolvió entre
   * las activas, pero sigue en la cola esperando a que la marquen como portada.
   */
  const awaiting = [entry('c', { intent: 'cover', uploadedImageId: 'img_2' })];

  it('una entrada ya subida no cuenta como pendiente', () => {
    expect(pendingUploads(awaiting)).toEqual([]);
    expect(pendingUploads([...awaiting, entry('g')]).map((item) => item.entryId)).toEqual(['g']);
  });

  it('el contador no la suma dos veces', () => {
    // El producto tenía una imagen; la subida añadió la segunda. Hay dos, no tres.
    expect(planned(2, awaiting)).toBe(2);
  });

  it('el límite no se activa en falso', () => {
    // Diez activas contando la ya subida: el hueco que ocupa es suyo, no uno extra.
    const active = 10;

    expect(planned(active, awaiting)).toBe(IMAGE_MAX_ACTIVE);

    // Con nueve activas y la subida entre ellas todavía cabe una más.
    expect(planned(9, awaiting)).toBe(9);
    expect(planned(9, awaiting) >= IMAGE_MAX_ACTIVE).toBe(false);
  });

  it('lo que sí falta por subir sigue contando', () => {
    const mixed = [...awaiting, entry('g1'), entry('g2')];

    expect(planned(2, mixed)).toBe(4);
  });

  it('la candidata se conserva en la cola para reanudar el PATCH', () => {
    expect(coverCandidate(awaiting)?.uploadedImageId).toBe('img_2');
    expect(awaiting).toHaveLength(1);
  });

  it('el reintento sigue marcando la portada sin reenviar el archivo', async () => {
    const upload = vi.fn(() => {
      throw new Error('el archivo no debe volver a subirse');
    });
    const candidate = coverCandidate(awaiting);

    expect(candidate?.uploadedImageId).not.toBeNull();

    const outcome = await runCoverFlow(
      product(5, [image('img_1', true), image('img_2', false)]),
      candidate?.uploadedImageId ?? null,
      {
        upload: upload as unknown as CoverDeps['upload'],
        promote: ({ imageId, expectedVersion }) =>
          Promise.resolve({
            ok: true as const,
            data: {
              product: product(expectedVersion + 1, [image('img_1', false), image(imageId, true)]),
            },
          }),
      },
    );

    expect(upload).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(true);

    if (!outcome.ok) throw new Error('debería haber salido bien');

    expect(isPrimaryIn(outcome.product, 'img_2')).toBe(true);
  });

  it('la pantalla cuenta con `pendingUploads`, no con la cola entera', () => {
    const source = executable(read('src/features/panel/product-images.tsx'));

    expect(source).toContain('const pending = pendingUploads(queue);');
    expect(source).toContain('const plannedActive = active.length + pending.length;');
    // Y la guarda de encolado usa la misma cuenta.
    expect(source).toContain('pendingUploads(current).length + active.length');
    expect(source).not.toContain('active.length + queue.length');
  });
});
