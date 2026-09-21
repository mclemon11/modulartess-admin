'use client';

import { useTransition } from 'react';

import { useRouter } from 'next/navigation';

import styles from './catalog.module.css';
import { Icon } from './section-icon';

/**
 * «Actualizar»: vuelve a pedir la pantalla al servidor.
 *
 * Recarga de verdad. Las pantallas del panel son `force-dynamic` y sus lecturas van con
 * `no-store`, así que `router.refresh()` vuelve a ejecutar el Server Component y con él la llamada
 * al backend. No es un botón decorativo copiado de la referencia: si no recargara, no estaría.
 *
 * `useTransition` da el estado de «en curso» sin inventar un `setTimeout`: React lo mantiene
 * activo hasta que llega el árbol nuevo. Mientras tanto el botón queda deshabilitado de verdad, no
 * solo apagado visualmente, así que un segundo clic no encola otra petición.
 */
export function RefreshButton({ label = 'Actualizar' }: { readonly label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      className={styles.buttonSecondary}
      disabled={pending}
      onClick={() => {
        startTransition(() => {
          router.refresh();
        });
      }}
      type="button"
    >
      <Icon className={styles.buttonIcon} name="actualizar" />
      {pending ? 'Actualizando…' : label}
      {/* El resultado se anuncia una vez, sin robar el foco ni interrumpir la lectura. */}
      <span aria-live="polite" className="sr-only">
        {pending ? 'Actualizando la pantalla' : ''}
      </span>
    </button>
  );
}
