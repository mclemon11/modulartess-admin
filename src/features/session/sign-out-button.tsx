'use client';

import { useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { acquire, createOperationLock, release } from '@/features/auth/operation-lock';

import { endAdminSession } from './exchange-session';
import { runLogout } from './logout-flow';
import styles from './panel.module.css';

/**
 * Cierra la sesión administrativa.
 *
 * Pide al BFF que borre la cookie `__Host-` —el navegador no puede hacerlo: es `HttpOnly`— y
 * navega a `/iniciar-sesion` **solo** después de un `204` confirmado.
 *
 * Si el cierre falla, la persona se queda en `/panel`: se libera el candado, el botón vuelve a
 * estar disponible y el error se anuncia en una región `role="alert"`. Navegar al login con la
 * cookie todavía viva sería peor que no navegar, porque el siguiente acceso a `/panel` volvería a
 * entrar y el cierre habría sido aparente.
 */
export function SignOutButton() {
  const router = useRouter();
  const lock = useRef(createOperationLock());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    // Candado síncrono, antes del primer `await`.
    if (!acquire(lock.current)) {
      return;
    }

    setBusy(true);
    setError(null);

    const result = await runLogout({
      end: endAdminSession,
      navigate: () => router.push('/iniciar-sesion'),
    });

    if (result.ok) {
      // Salida terminal: el candado no se libera, la navegación ya está en curso.
      return;
    }

    // Reintento explícito: candado liberado y botón reactivado.
    release(lock.current);
    setError(result.message);
    setBusy(false);
  }

  return (
    <div className={styles.actions}>
      <button
        className={styles.signOut}
        disabled={busy}
        onClick={() => void handleClick()}
        type="button"
      >
        {busy ? 'Cerrando sesión…' : 'Cerrar sesión'}
      </button>
      <div aria-live="assertive" className={styles.alertRegion}>
        {error === null ? null : (
          <p className={styles.warning} role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
