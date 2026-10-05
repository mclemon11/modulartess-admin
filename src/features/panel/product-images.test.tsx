import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ImageQueueEditor } from './image-queue-editor';
import { addToQueue, type QueuedImage } from './image-queue';
import { IMAGE_ANCHORS } from './product-anchors';
import { ProductImages } from './product-images';

import type { AdminProduct, AdminProductImage, AdminProductVideo } from '@/lib/api/catalog';

/**
 * Portada y Galería: dos bloques, no una rejilla con una estrellita.
 *
 * Lo que se protege aquí es la afirmación que la pantalla hace al enseñar una imagen como portada:
 * que es la primera que verá quien entre en la ficha. Y la que hace al no enseñarla: que todavía no
 * hay ninguna, y que elegir archivos en «Galería» no la decidirá a escondidas.
 */

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const executable = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function image(id: string, position: number, isPrimary: boolean): AdminProductImage {
  return {
    id,
    position,
    isPrimary,
    status: 'active',
    altText: `Descripción de ${id}`,
    publicUrl: `https://cdn.example/${id}.jpg`,
  } as unknown as AdminProductImage;
}

function product(
  images: readonly AdminProductImage[],
  videos: readonly AdminProductVideo[] = [],
): AdminProduct {
  return { id: 'prd_1', version: 3, images, videos, variants: [] } as unknown as AdminProduct;
}

function queued(n: number, altText = `Foto ${n}`): QueuedImage {
  return {
    entryId: `e${n}`,
    file: { name: `foto-${n}.jpg`, size: 2 * 1024 * 1024, type: 'image/jpeg' } as File,
    previewUrl: `blob:${n}`,
    altText,
    idempotencyKey: `key-${n}`,
    intent: 'gallery',
    uploadedImageId: null,
  };
}

const noop = () => undefined;

function editHtml(images: readonly AdminProductImage[]): string {
  return renderToStaticMarkup(
    <ProductImages canArchive canEdit onProduct={noop} product={product(images)} />,
  );
}

function video(id = 'vid_1'): AdminProductVideo {
  return { id, status: 'active', title: 'Video del producto' } as unknown as AdminProductVideo;
}

describe('25. Portada y Galería están separadas', () => {
  const html = editHtml([image('img_1', 0, true), image('img_2', 1, false)]);

  it('cada bloque tiene su ancla y su título', () => {
    expect(html).toContain(`id="${IMAGE_ANCHORS.portada}"`);
    expect(html).toContain(`id="${IMAGE_ANCHORS.galeria}"`);
    expect(html).toContain('Portada');
    expect(html).toContain('Galería');
  });

  it('la portada explica qué es', () => {
    expect(html).toContain('Es la primera imagen que aparece en la tienda y en la ficha');
  });

  it('la portada va antes que la galería, también en móvil', () => {
    expect(html.indexOf(IMAGE_ANCHORS.portada)).toBeLessThan(html.indexOf(IMAGE_ANCHORS.galeria));
    // El orden es el del marcado: ninguna regla lo invierte con `order` ni `flex-direction`.
    expect(read('src/features/panel/catalog.module.css')).not.toMatch(
      /\.imageSections[^}]*flex-direction:\s*column-reverse/,
    );
  });

  it('el alta también los separa', () => {
    const create = renderToStaticMarkup(
      <ImageQueueEditor
        canAdd
        disabled={false}
        lockedIds={[]}
        onAdd={noop}
        onAlt={noop}
        onMove={noop}
        onPrimary={noop}
        onRemove={noop}
        onReplace={noop}
        queue={[]}
      />,
    );

    expect(create).toContain(`id="${IMAGE_ANCHORS.portada}"`);
    expect(create).toContain(`id="${IMAGE_ANCHORS.galeria}"`);
  });
});

describe('26. la galería admite varios archivos y la portada uno solo', () => {
  const html = editHtml([image('img_1', 0, true)]);

  it('hay un selector múltiple', () => {
    expect(html).toContain('multiple=""');
    expect(html).toContain('Agregar imágenes a la galería');
  });

  it('el de la portada no lo es', () => {
    const cover = html.slice(0, html.indexOf(IMAGE_ANCHORS.galeria));

    expect(cover).not.toContain('multiple=""');
  });

  it('se puede soltar arrastrando, por la misma puerta', () => {
    const source = executable(read('src/features/panel/image-queue-editor.tsx'));

    expect(source).toContain('onDrop');
    // El drop llama a `onFiles`, exactamente lo mismo que el `input`: no hay un segundo camino.
    expect(source).toContain('dataTransfer');
    expect(source).toContain('onFiles(files)');
  });
});

describe('27. seleccionar no sube', () => {
  /*
   * La pantalla de edición **no** sube al elegir: encola. La única llamada de subida sale del
   * lote, y el lote solo arranca desde el botón.
   */
  it('elegir archivos solo encola', () => {
    const source = executable(read('src/features/panel/product-images.tsx'));
    const enqueue = source.slice(
      source.indexOf('function enqueue('),
      source.indexOf('async function handleCover('),
    );

    expect(enqueue).toContain('addToQueue');
    expect(enqueue).not.toContain('uploadProductImage');
    expect(enqueue).not.toContain('uploadQueueSequentially');
  });

  it('la subida sale del botón del lote', () => {
    const source = executable(read('src/features/panel/product-images.tsx'));

    expect(source).toContain('uploadQueueSequentially');
    expect(source).toContain('handleBatch()');
  });

  it('el botón dice cuántas se van a subir', () => {
    const html = renderToStaticMarkup(
      <ImageQueueEditor
        canAdd
        disabled={false}
        lockedIds={[]}
        onAdd={noop}
        onAlt={noop}
        onMove={noop}
        onPrimary={noop}
        onRemove={noop}
        onReplace={noop}
        queue={[queued(1), queued(2)]}
      />,
    );

    // En el alta no hay botón de lote —se sube al crear— pero sí las entradas pendientes.
    expect(html).toContain('foto-1.jpg');
    expect(html).toContain('foto-2.jpg');
    expect(html).toContain('Pendiente');
  });
});

describe('34. el límite cuenta portada y galería', () => {
  it('el contador incluye la portada', () => {
    const html = editHtml([image('img_1', 0, true), image('img_2', 1, false)]);

    expect(html).toContain('2 de 10 imágenes activas, contando la portada');
  });

  it('con diez activas ya no se puede añadir', () => {
    const images = Array.from({ length: 10 }, (_, index) =>
      image(`img_${index}`, index, index === 0),
    );
    const html = editHtml(images);

    expect(html).toContain('10 de 10 imágenes activas');
    expect(html).toContain('has llegado al límite de 10');
    expect(html).toContain('quita una para liberar espacio');
    expect(html).toContain('Quitar imagen');
    // «Cambiar portada» también suma una imagen: con el tope alcanzado lo dice y explica la salida.
    expect(html).toContain(
      'Has llegado al límite de 10: quita una imagen para poder agregar otra.',
    );
    expect(html).toMatch(/<input[^>]*disabled=""[^>]*>/);
  });

  it('con nueve activas se vuelve a poder agregar', () => {
    const images = Array.from({ length: 9 }, (_, index) =>
      image(`img_${index}`, index, index === 0),
    );
    const html = editHtml(images);

    expect(html).toContain('9 de 10 imágenes activas');
    expect(html).not.toContain('límite de 10');
    expect(html).not.toMatch(/<input[^>]*type="file"[^>]*disabled=""/);
    expect(html).not.toMatch(/<input[^>]*disabled=""[^>]*type="file"/);
  });

  /*
   * Sensibilidad: la cola local también respeta el tope. Si dejara de hacerlo, se podrían encolar
   * once y el backend rechazaría la última tras haber subido diez.
   */
  it('la cola local rechaza la undécima', () => {
    let queue: readonly QueuedImage[] = Array.from({ length: 10 }, (_, index) => queued(index));
    const change = addToQueue(queue, {
      file: queued(99).file,
      previewUrl: 'blob:99',
      entryId: 'e99',
      idempotencyKey: 'key-99',
    });

    queue = change.queue;

    expect(change.rejected).toContain('No puedes añadir más de 10');
    expect(queue).toHaveLength(10);
  });
});

describe('40. retirar imágenes es un flujo completo y comprensible', () => {
  it('la portada se puede quitar y avisa qué ocurrirá con la siguiente', () => {
    const html = editHtml([image('img_1', 0, true), image('img_2', 1, false)]);

    expect(html).toContain('Quitar portada');
    expect(html).toContain('La siguiente imagen activa pasará a ser la portada automáticamente');
    expect(html).toContain('libera uno de los 10 espacios de la galería');
    expect(html).toContain('no se pueden restaurar desde el panel');
  });

  it('cada foto secundaria tiene una acción llamada Quitar imagen', () => {
    const html = editHtml([image('img_1', 0, true), image('img_2', 1, false)]);

    expect(html).toContain('Quitar imagen');
    expect(html).not.toContain('>Archivar<');
  });

  it('la única imagen explica que el producto quedará sin fotos', () => {
    const html = editHtml([image('img_1', 0, true)]);

    expect(html).toContain('El producto quedará sin imágenes hasta que agregues una nueva portada');
  });

  it('la última imagen no se puede retirar mientras un video activo dependa de ella', () => {
    const html = renderToStaticMarkup(
      <ProductImages
        canArchive
        canEdit
        onProduct={noop}
        product={product([image('img_1', 0, true)], [video()])}
      />,
    );

    expect(html).toContain('No puedes quitar la única imagen mientras haya videos activos');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Quitar portada<\/button>/);
  });

  it('la confirmación usa un diálogo accesible: nombre, descripción y Cancelar', () => {
    const html = editHtml([image('img_1', 0, true)]);
    const dialog = /<dialog[^>]*>[\s\S]*?<\/dialog>/.exec(html)?.[0] ?? '';
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(dialog)?.[1];
    const describedBy = /aria-describedby="([^"]+)"/.exec(dialog)?.[1];

    // Nombre y descripción apuntan a elementos que existen dentro del propio diálogo.
    expect(labelledBy).toBeDefined();
    expect(describedBy).toBeDefined();
    expect(dialog).toContain(`id="${labelledBy}"`);
    expect(dialog).toContain(`id="${describedBy}"`);
    expect(dialog).toMatch(/<h2[^>]*>¿Quitar portada\?<\/h2>/);
    expect(dialog).toContain('La foto saldrá del producto y de la tienda de inmediato.');
    expect(dialog).toMatch(/<button[^>]*>Cancelar<\/button>/);
  });

  it('el diálogo solo se cierra con éxito y muestra el fallo dentro, sin cerrarse con Escape', () => {
    const source = executable(read('src/features/panel/product-images.tsx'));
    const confirm = /async function confirm\(\) \{[\s\S]*?\n {2}\}/.exec(source)?.[0] ?? '';

    // El único `close()` del flujo de confirmación está detrás de `outcome.ok`.
    expect(confirm).toMatch(
      /if \(outcome\.ok\) \{\s*dialog\.current\?\.close\(\);\s*\} else \{\s*setError\(outcome\.message\);/,
    );
    expect(confirm.match(/close\(\)/g)).toHaveLength(1);
    expect(source).toContain('if (removing) event.preventDefault();');
    expect(source).toMatch(
      /\{error === null \? null : \(\s*<p className=\{styles\.error\} role="alert">/,
    );
  });

  it('un fallo de la retirada nunca se presenta como éxito', () => {
    const source = executable(read('src/features/panel/product-images.tsx'));
    const handler = /async function handleArchive\([\s\S]*?\n {2}\}/.exec(source)?.[0] ?? '';

    // El éxito depende de la respuesta del backend; cualquier otra rama devuelve `ok: false`.
    expect(handler).toContain('if (removed || result.ok) return { ok: true };');
    expect(handler.match(/ok: true/g)).toHaveLength(1);
    expect(handler).toContain('return { ok: false, message };');
  });
});

describe('35 y 36. cambiar la portada no archiva la anterior', () => {
  const html = editHtml([image('img_1', 0, true), image('img_2', 1, false)]);

  it('se dice explícitamente', () => {
    expect(html).toContain('la anterior no se quita: pasa a la galería');
    expect(html).not.toMatch(/archiv(?!o)/i);
  });

  it('una imagen existente puede pasar a ser portada', () => {
    expect(html).toContain('Hacer portada');
  });

  it('«Hacer portada» solo marca isPrimary: no archiva nada', () => {
    const source = executable(read('src/features/panel/product-images.tsx'));
    // La última aparición es el botón; la primera es la ayuda que lo menciona.
    const start = source.lastIndexOf('Hacer portada');
    const around = source.slice(Math.max(0, start - 800), start);

    expect(around).toContain('isPrimary: true');
    expect(around).not.toContain('archiveProductImage');
  });
});

describe('37. una operación de «Galería» no crea una portada en silencio', () => {
  it('sin portada, la galería no admite archivos y lo explica', () => {
    const html = editHtml([]);
    const gallery = html.slice(html.indexOf(IMAGE_ANCHORS.galeria));

    expect(gallery).toContain('Agrega primero la portada');
    expect(gallery).not.toContain('Agregar imágenes a la galería');
  });

  it('con portada, la galería vuelve a admitirlos', () => {
    const html = editHtml([image('img_1', 0, true)]);
    const gallery = html.slice(html.indexOf(IMAGE_ANCHORS.galeria));

    expect(gallery).toContain('Agregar imágenes a la galería');
    expect(gallery).not.toContain('Agrega primero la portada');
  });

  it('en el alta ocurre lo mismo', () => {
    const html = renderToStaticMarkup(
      <ImageQueueEditor
        canAdd
        disabled={false}
        lockedIds={[]}
        onAdd={noop}
        onAlt={noop}
        onMove={noop}
        onPrimary={noop}
        onRemove={noop}
        onReplace={noop}
        queue={[]}
      />,
    );

    expect(html).toContain('Agrega primero la portada');
    expect(html).toContain('Agregar portada');
  });

  it('las imágenes siguen siendo opcionales para publicar', () => {
    expect(editHtml([])).toContain('Las imágenes son opcionales para publicar');
  });
});

describe('38. las object URL se revocan', () => {
  it('al quitar, al reemplazar, al completar el lote y al desmontar', () => {
    const source = executable(read('src/features/panel/product-images.tsx'));

    expect(source).toContain('URL.revokeObjectURL');
    // Al desmontar: la limpieza del efecto recorre las vivas.
    expect(source).toMatch(/useEffect\(\s*\(\)\s*=>\s*\(\)\s*=>/);
    // Al completarse el lote: las entradas terminadas dejan de necesitar su vista previa.
    expect(source).toContain('revoke(completed.map((entry) => entry.previewUrl))');
  });

  it('la cola devuelve qué URLs quedaron huérfanas en cada operación', () => {
    const queue = [queued(1), queued(2)];
    const change = addToQueue(queue, {
      file: { name: 'roto.txt', size: 10, type: 'text/plain' } as File,
      previewUrl: 'blob:rechazada',
      entryId: 'e9',
      idempotencyKey: 'key-9',
    });

    // Un archivo rechazado devuelve su URL para revocarla: si no, se quedaría viva para siempre.
    expect(change.revoked).toEqual(['blob:rechazada']);
    expect(change.queue).toHaveLength(2);
  });
});

describe('39. los errores identifican el archivo', () => {
  it('el texto alternativo que falta se marca junto a su entrada', () => {
    const html = renderToStaticMarkup(
      <ImageQueueEditor
        canAdd
        disabled={false}
        lockedIds={[]}
        onAdd={noop}
        onAlt={noop}
        onMove={noop}
        onPrimary={noop}
        onRemove={noop}
        onReplace={noop}
        queue={[queued(1), queued(2, '')]}
      />,
    );

    expect(html).toContain('id="alt-error-e2"');
    expect(html).not.toContain('id="alt-error-e1"');
  });

  it('cada entrada lleva su nombre y su tamaño', () => {
    const html = renderToStaticMarkup(
      <ImageQueueEditor
        canAdd
        disabled={false}
        lockedIds={[]}
        onAdd={noop}
        onAlt={noop}
        onMove={noop}
        onPrimary={noop}
        onRemove={noop}
        onReplace={noop}
        queue={[queued(1)]}
      />,
    );

    expect(html).toContain('foto-1.jpg');
    expect(html).toContain('2,0 MB');
  });

  it('el fallo del lote se asocia a la entrada que lo produjo', () => {
    const source = executable(read('src/features/panel/product-images.tsx'));

    expect(source).toContain('setEntryErrors({ [batch.failure.entryId]: message })');
  });
});

describe('10. el texto alternativo', () => {
  const html = renderToStaticMarkup(
    <ImageQueueEditor
      canAdd
      disabled={false}
      lockedIds={[]}
      onAdd={noop}
      onAlt={noop}
      onMove={noop}
      onPrimary={noop}
      onRemove={noop}
      onReplace={noop}
      queue={[queued(1), queued(2, '')]}
    />,
  );

  it('es obligatorio y lo dice', () => {
    expect(html).toContain('Texto alternativo *');
    expect(html).toContain('required=""');
  });

  it('trae el ejemplo comprensible y explica para quién es', () => {
    expect(html).toContain('Clóset Vitria en madera, visto de frente con puertas abiertas');
    expect(html).toContain('para quien no puede verla');
  });

  it('respeta el máximo del contrato', () => {
    expect(html).toContain('maxLength="200"');
  });

  /*
   * Nunca se rellena con el nombre del archivo ni se copia el mismo texto a todas: cada entrada
   * arranca vacía y solo cambia la suya.
   */
  it('no se precarga con el nombre del archivo', () => {
    const change = addToQueue([], {
      file: { name: 'IMG_4821.jpg', size: 1024, type: 'image/jpeg' } as File,
      previewUrl: 'blob:1',
      entryId: 'e1',
      idempotencyKey: 'key-1',
    });

    expect(change.queue[0]?.altText).toBe('');
  });

  it('cambiar el de una entrada no toca el de las demás', () => {
    const source = executable(read('src/features/panel/image-queue.ts'));

    expect(source).toContain('entry.entryId === entryId ? { ...entry, altText } : entry');
  });
});
