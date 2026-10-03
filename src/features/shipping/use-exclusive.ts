'use client';

import { useRef, useState } from 'react';

import { acquire, createOperationLock, release } from '@/features/auth/operation-lock';

/**
 * Exclusión de operaciones con un candado **síncrono**.
 *
 * El candado se toma antes del primer `await`, así que un doble clic no manda dos peticiones. El
 * estado `busy` es solo para pintar: no decide nada.
 */
export function useExclusive(): {
  readonly busy: boolean;
  readonly run: <T>(operation: () => Promise<T>) => Promise<T | null>;
} {
  const lock = useRef(createOperationLock());
  const [busy, setBusy] = useState(false);

  async function run<T>(operation: () => Promise<T>): Promise<T | null> {
    if (!acquire(lock.current)) return null;

    setBusy(true);

    try {
      return await operation();
    } finally {
      release(lock.current);
      setBusy(false);
    }
  }

  return { busy, run };
}
