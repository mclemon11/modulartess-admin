'use client';

import { useTransition } from 'react';

import { useRouter } from 'next/navigation';

import catalog from '@/features/panel/catalog.module.css';

import { describeShippingFailure, offersReload } from './shipping-errors';

/**
 * Aviso de fallo con su salida.
 *
 * Ante un conflicto de versión **no** se dice «guardado»: se explica que otro administrador cambió
 * la zona y se ofrece recargar. Recargar pide la versión actual al servidor; la página monta el
 * formulario con una `key` que incluye la versión, así que el formulario vuelve a nacer con los
 * datos nuevos en lugar de conservar los viejos y chocar otra vez.
 */
export function FailureNotice({
  code,
  reference,
}: {
  readonly code: string;
  readonly reference?: string | undefined;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className={catalog.error} role="alert">
      <p>{describeShippingFailure(code, reference)}</p>
      {offersReload(code) ? (
        <button
          className={catalog.buttonSecondary}
          disabled={pending}
          onClick={() => startTransition(() => router.refresh())}
          type="button"
        >
          {pending ? 'Recargando…' : 'Recargar la versión actual'}
        </button>
      ) : null}
    </div>
  );
}
