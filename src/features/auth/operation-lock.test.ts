import { describe, expect, it } from 'vitest';

import { acquire, createOperationLock, release, seal } from './operation-lock';

describe('createOperationLock', () => {
  it('empieza libre y sin sellar', () => {
    expect(createOperationLock()).toEqual({ busy: false, sealed: false });
  });
});

describe('exclusión antes del siguiente render', () => {
  it('rechaza el segundo intento consecutivo, sin ningún render entre medias', () => {
    const lock = createOperationLock();

    expect(acquire(lock)).toBe(true);
    expect(acquire(lock)).toBe(false);
  });

  it('rechaza una ráfaga completa de intentos simultáneos', () => {
    const lock = createOperationLock();
    const granted = [1, 2, 3, 4, 5].filter(() => acquire(lock));

    expect(granted).toHaveLength(1);
  });

  it('no se ve afectado por el estado visual: solo depende del propio candado', () => {
    const lock = createOperationLock();

    // Equivalente a dos submits en el mismo tick, cuando `busy` todavía valdría false.
    const first = acquire(lock);
    const second = acquire(lock);

    expect([first, second]).toEqual([true, false]);
    expect(lock.busy).toBe(true);
  });
});

describe('release', () => {
  it('permite un reintento explícito tras un fallo', () => {
    const lock = createOperationLock();

    acquire(lock);
    release(lock);

    expect(acquire(lock)).toBe(true);
  });

  it('no reabre un candado sellado', () => {
    const lock = createOperationLock();

    acquire(lock);
    seal(lock);
    release(lock);

    expect(acquire(lock)).toBe(false);
    expect(lock.sealed).toBe(true);
  });
});

describe('seal', () => {
  it('impide cualquier operación posterior', () => {
    const lock = createOperationLock();

    acquire(lock);
    seal(lock);

    expect(acquire(lock)).toBe(false);
  });

  it('sobrevive a un fallo posterior que intente liberar el candado varias veces', () => {
    const lock = createOperationLock();

    acquire(lock);
    seal(lock);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      release(lock);
      expect(acquire(lock)).toBe(false);
    }
  });
});
