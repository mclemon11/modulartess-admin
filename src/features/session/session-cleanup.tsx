'use client';

import { useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { acquire, createOperationLock, release } from '@/features/auth/operation-lock';

import { endAdminSession } from './exchange-session';
import { runLogout } from './logout-flow';
import styles from './panel.module.css';

/**
 * Frontera cliente que limpia una sesión que el backend ya rechazó.
 *
 * Existe porque el borrado de la cookie es una **mutación**, y una mutación no puede salir de un
 * `GET` ni de un Server Component: ni uno ni otro son el sitio donde escribir estado. Cuando la
 * comprobación autoritativa de `/panel` devuelve `401` o `403`, la página renderiza este
 * componente en lugar de redirigir, y el borrado ocurre por el `DELETE` del BFF.
 *
 * La limpieza se intenta **una sola vez** de forma automática. El `useRef` lo garantiza incluso
 * con el doble montaje del modo estricto de React: sin él, un fallo repetido produciría un bucle
 * de peticiones y, con navegación optimista, un bucle de redirecciones.
 *
 * Si falla, la persona ve un estado controlado y decide reintentar.
 */
export function SessionCleanup() {
  const router = useRouter();
  const lock = useRef(createOperationLock());
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  async function clearSession() {
    if (!acquire(lock.current)) {
      return;
    }

    setBusy(true);
    setError(null);

    const result = await runLogout({
      end: endAdminSession,
      navigate: () => router.replace('/iniciar-sesion'),
    });

    if (result.ok) {
      // Terminal: navegación en curso, el candado se queda tomado.
      return;
    }

    release(lock.current);
    setError(result.message);
    setBusy(false);
  }

  useEffect(() => {
    // Un único intento automático. Los siguientes los pide la persona.
    if (started.current) {
      return;
    }

    started.current = true;
    void clearSession();
    // El efecto se ejecuta una vez: no depende de nada que cambie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <div className={styles.brand}>
          <span aria-hidden="true" className={styles.brandMark} />
          <p className={styles.brandName}>
            Modulartess <span>Admin</span>
          </p>
        </div>
        <h1 className={styles.title}>La sesión ya no es válida</h1>
        <p className={styles.lead}>
          El backend rechazó la sesión administrativa. Estamos retirándola de este navegador antes
          de volver al inicio de sesión.
        </p>
        <div aria-live="assertive" className={styles.alertRegion}>
          {error === null ? null : (
            <p className={styles.warning} role="alert">
              {error}
            </p>
          )}
        </div>
        <div className={styles.actions}>
          <button
            className={styles.signOut}
            disabled={busy}
            onClick={() => void clearSession()}
            type="button"
          >
            {busy ? 'Retirando la sesión…' : 'Reintentar'}
          </button>
        </div>
      </section>
    </main>
  );
}
