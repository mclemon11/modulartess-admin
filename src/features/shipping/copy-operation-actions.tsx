'use client';

import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';

import catalog from '@/features/panel/catalog.module.css';
import type { CopyAction, ShippingCopyOperation, ShippingCopyState } from '@/lib/api/shipping';

import { copyActions, describeCopyActionFailure } from './copy-operation-model';
import { FailureNotice } from './failure-notice';
import { actOnCopyOperation } from './shipping-client';
import { useExclusive } from './use-exclusive';

type Failure = {
  readonly action: CopyAction;
  readonly code: string;
  readonly reference?: string | undefined;
} | null;

/**
 * Reanudar o descartar una copia por su `copyOperationId`.
 *
 * Funciona aunque el navegador que la lanzó ya no exista: no hace falta ninguna clave guardada. Tras
 * cada acción la página se vuelve a leer del backend.
 */
export function CopyOperationActions({
  copyOperationId,
  state,
  canManage,
}: {
  readonly copyOperationId: string;
  readonly state: ShippingCopyState;
  readonly canManage: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const dialog = useRef<HTMLDialogElement | null>(null);
  const { busy, run } = useExclusive();
  const [failure, setFailure] = useState<Failure>(null);
  const [done, setDone] = useState<ShippingCopyOperation | null>(null);
  const actions = copyActions(state);

  if (!canManage) {
    return <p className={catalog.hint}>Tu rol consulta envíos en modo de solo lectura.</p>;
  }

  if (actions.length === 0) {
    return (
      <p className={catalog.hint}>
        {state === 'ready'
          ? 'La copia terminó: su zona es un borrador normal.'
          : 'La copia se descartó y quedó archivada como rastro.'}
      </p>
    );
  }

  async function act(action: CopyAction) {
    setFailure(null);

    const result = await run(() => actOnCopyOperation(copyOperationId, action));

    if (result === null) return;
    if (!result.ok) {
      setFailure({ action, code: result.code, reference: result.reference });

      return;
    }

    setDone(result.data.operation);
    dialog.current?.close();
    router.refresh();
  }

  const failureText =
    failure === null ? null : describeCopyActionFailure(failure.action, failure.code);

  return (
    <section aria-label="Acciones de la copia" className={`${catalog.card} ${catalog.cardPad}`}>
      <p className={catalog.pageLead}>
        {state === 'failed'
          ? 'Reanudarla continúa desde el progreso guardado sin duplicar nada; descartarla borra lo copiado y deja la copia archivada como rastro.'
          : 'Si no avanza, puedes reanudarla desde su cursor o descartarla.'}
      </p>
      <div aria-live="polite">
        {done === null ? null : (
          <p className={catalog.success} role="status">
            {done.state === 'ready'
              ? `Copia terminada${done.zone === null ? '' : `: «${done.zone.name}» es un borrador, versión ${done.zone.version}`}.`
              : done.state === 'discarded'
                ? 'Copia descartada.'
                : done.state === 'failed'
                  ? 'La copia volvió a detenerse. Puedes reanudarla otra vez o descartarla.'
                  : 'La copia sigue en curso.'}
          </p>
        )}
      </div>
      {failure === null ? null : failureText === null ? (
        <FailureNotice code={failure.code} reference={failure.reference} />
      ) : (
        <p className={catalog.error} role="alert">
          {failureText}
        </p>
      )}
      <div className={catalog.actions}>
        <button
          className={catalog.buttonPrimary}
          disabled={busy}
          onClick={() => void act('resume')}
          type="button"
        >
          {busy ? 'Trabajando…' : 'Reanudar la copia'}
        </button>
        <button
          className={catalog.buttonDanger}
          disabled={busy}
          onClick={() => {
            setFailure(null);
            dialog.current?.showModal();
          }}
          type="button"
        >
          Descartar la copia
        </button>
      </div>
      <dialog
        aria-describedby={`${id}-text`}
        aria-labelledby={`${id}-title`}
        className={catalog.previewDialog}
        ref={dialog}
      >
        <div className={catalog.previewDialogBody}>
          <h2 className={catalog.sectionTitle} id={`${id}-title`}>
            ¿Descartar esta copia?
          </h2>
          <p className={catalog.pageLead} id={`${id}-text`}>
            Se borra lo copiado hasta ahora —cobertura, reglas y asignaciones— y la copia queda
            archivada como rastro. La zona original no cambia.
          </p>
          <div className={catalog.actions}>
            <button
              className={catalog.buttonDanger}
              disabled={busy}
              onClick={() => void act('discard')}
              type="button"
            >
              {busy ? 'Descartando…' : 'Descartar la copia'}
            </button>
            <button
              autoFocus
              className={catalog.buttonSecondary}
              disabled={busy}
              onClick={() => dialog.current?.close()}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
