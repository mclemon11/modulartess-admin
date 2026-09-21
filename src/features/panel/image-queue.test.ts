import { describe, expect, it } from 'vitest';

import {
  LOCKED_MESSAGE,
  addToQueue,
  coverCandidate,
  galleryEntries,
  entriesMissingAltText,
  moveInQueue,
  removeFromQueue,
  replaceFile,
  resolvePrimary,
  setAltText,
  type QueuedImage,
} from './image-queue';

function file(name: string, type = 'image/jpeg', size = 1024): File {
  const built = new File(['x'], name, { type });

  Object.defineProperty(built, 'size', { value: size });

  return built;
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

describe('límites del contrato', () => {
  it('rechaza un tipo no admitido y devuelve su URL para revocarla', () => {
    const change = addToQueue([], {
      file: file('doc.gif', 'image/gif'),
      previewUrl: 'blob:gif',
      entryId: 'g',
      idempotencyKey: 'k',
    });

    expect(change.queue).toEqual([]);
    expect(change.revoked).toEqual(['blob:gif']);
    expect(change.rejected).toMatch(/JPG, PNG o WebP/);
  });

  it('rechaza por encima de 10 MB', () => {
    const change = addToQueue([], {
      file: file('grande.jpg', 'image/jpeg', 10_485_761),
      previewUrl: 'blob:grande',
      entryId: 'g',
      idempotencyKey: 'k',
    });

    expect(change.rejected).toMatch(/10 MB/);
  });

  it('no admite más de 10 imágenes', () => {
    const full = Array.from({ length: 10 }, (_, index) => entry(`e${index}`));

    const change = addToQueue(full, {
      file: file('extra.jpg'),
      previewUrl: 'blob:extra',
      entryId: 'x',
      idempotencyKey: 'k',
    });

    expect(change.queue).toHaveLength(10);
    expect(change.rejected).toMatch(/10 imágenes/);
  });
});

describe('object URLs', () => {
  it('quitar una entrada devuelve su URL para revocarla', () => {
    const change = removeFromQueue([entry('a'), entry('b')], 'a');

    expect(change.queue.map((item) => item.entryId)).toEqual(['b']);
    expect(change.revoked).toEqual(['blob:a']);
  });

  it('cambiar el archivo revoca la URL anterior y renueva la clave', () => {
    const change = replaceFile([entry('a')], 'a', file('nuevo.jpg'), 'blob:nuevo', 'key-nueva');

    expect(change.revoked).toEqual(['blob:a']);
    expect(change.queue[0]?.previewUrl).toBe('blob:nuevo');
    // Otro archivo es otra operación: reutilizar la clave haría que el backend la diera por repetida.
    expect(change.queue[0]?.idempotencyKey).toBe('key-nueva');
  });
});

describe('orden y principal', () => {
  it('mueve una entrada una posición', () => {
    const change = moveInQueue([entry('a'), entry('b'), entry('c')], 'c', -1);

    expect(change.queue.map((item) => item.entryId)).toEqual(['a', 'c', 'b']);
  });

  it('no mueve fuera de los extremos', () => {
    const queue = [entry('a'), entry('b')];

    expect(moveInQueue(queue, 'a', -1).queue).toBe(queue);
    expect(moveInQueue(queue, 'b', 1).queue).toBe(queue);
  });

  /*
   * La portada sale de la **intención**, no de la posición.
   *
   * Esta prueba sustituye a «la primera es principal por defecto», que codificaba el fallo: quien
   * ponía una imagen en la galería descubría que se había convertido en la portada del producto
   * solo por haber llegado antes.
   */
  it('la primera de la lista NO es la portada si nadie la eligió', () => {
    expect(resolvePrimary([entry('a'), entry('b')], null)).toBeNull();
  });

  it('la portada es la entrada con intención de portada, esté donde esté', () => {
    const queue = [entry('a'), entry('b', { intent: 'cover' }), entry('c')];

    expect(resolvePrimary(queue, null)).toBe('b');
    expect(coverCandidate(queue)?.entryId).toBe('b');
    expect(galleryEntries(queue).map((item) => item.entryId)).toEqual(['a', 'c']);
  });

  it('quitar la portada no asciende a ninguna de la galería', () => {
    const remaining = removeFromQueue([entry('a', { intent: 'cover' }), entry('b')], 'a').queue;

    expect(resolvePrimary(remaining, 'a')).toBeNull();
    expect(coverCandidate(remaining)).toBeNull();
  });

  it('sin imágenes no hay principal', () => {
    expect(resolvePrimary([], 'a')).toBeNull();
  });
});

describe('texto alternativo', () => {
  it('señala las entradas sin describir', () => {
    const queue = setAltText([entry('a'), entry('b')], 'a', '   ').queue;

    expect(entriesMissingAltText(queue).map((item) => item.entryId)).toEqual(['a']);
  });

  it('no exige describir una entrada ya subida: su texto lo fijó el backend', () => {
    const queue = setAltText([entry('a'), entry('b')], 'a', '   ').queue;

    expect(entriesMissingAltText(queue, ['a'])).toEqual([]);
  });
});

describe('entradas ya subidas', () => {
  const queue = [entry('subida'), entry('pendiente')];
  const locked = ['subida'];

  it.each([
    ['quitar', () => removeFromQueue(queue, 'subida', locked)],
    ['cambiar el texto alternativo', () => setAltText(queue, 'subida', 'otro', locked)],
    ['mover', () => moveInQueue(queue, 'subida', 1, locked)],
    [
      'reemplazar el archivo',
      () => replaceFile(queue, 'subida', file('nuevo.jpg'), 'blob:nuevo', 'key-nueva', locked),
    ],
  ])('no deja %s una entrada subida', (_label, operate) => {
    const change = operate();

    expect(change.queue).toEqual(queue);
    expect(change.rejected).toBe(LOCKED_MESSAGE);
  });

  it('una pendiente sí se puede reemplazar, y renueva su clave', () => {
    const change = replaceFile(
      queue,
      'pendiente',
      file('nuevo.jpg'),
      'blob:nuevo',
      'key-nueva',
      locked,
    );

    expect(change.rejected).toBeNull();
    expect(change.revoked).toEqual(['blob:pendiente']);
    expect(change.queue[1]?.idempotencyKey).toBe('key-nueva');
    // La subida no se toca.
    expect(change.queue[0]).toEqual(queue[0]);
  });

  it('una pendiente no puede saltar por encima de una subida', () => {
    const change = moveInQueue(queue, 'pendiente', -1, locked);

    expect(change.queue).toEqual(queue);
    expect(change.rejected).toBe(LOCKED_MESSAGE);
  });

  it('las pendientes sí se reordenan entre ellas', () => {
    const three = [entry('subida'), entry('p1'), entry('p2')];
    const change = moveInQueue(three, 'p2', -1, locked);

    expect(change.queue.map((item) => item.entryId)).toEqual(['subida', 'p2', 'p1']);
    expect(change.rejected).toBeNull();
  });
});
