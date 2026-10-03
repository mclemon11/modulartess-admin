'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';

import catalog from '@/features/panel/catalog.module.css';
import type { ShippingZone } from '@/lib/api/shipping';

import { FailureNotice } from './failure-notice';
import { duplicateZone, newIdempotencyKey, transitionZone } from './shipping-client';
import { keepsKey } from './shipping-errors';
import styles from './shipping.module.css';
import { useExclusive } from './use-exclusive';

type Failure = { readonly code: string; readonly reference?: string | undefined } | null;

/** Página de una operación de copia, reconstruida siempre desde el backend. */
export function copyOperationHref(copyOperationId: string): string {
  return `/panel/envios/copias/${encodeURIComponent(copyOperationId)}`;
}

export function ZoneRowActions({
  zone,
  canManage,
}: {
  readonly zone: ShippingZone;
  readonly canManage: boolean;
}) {
  const usable = zone.copy.state === 'ready';

  return (
    <span className={styles.rowActions}>
      {usable ? (
        <Link className={catalog.rowAction} href={`/panel/envios/${encodeURIComponent(zone.id)}`}>
          {canManage && zone.status !== 'archived' ? 'Editar' : 'Ver'}
        </Link>
      ) : null}
      {!usable && zone.copy.operationId !== null ? (
        <Link className={catalog.rowAction} href={copyOperationHref(zone.copy.operationId)}>
          Ver operación de copia
        </Link>
      ) : null}
      {canManage && usable && zone.status === 'archived' ? <RestoreButton zone={zone} /> : null}
      {canManage && usable ? <DuplicateButton zone={zone} /> : null}
      {canManage && usable && zone.status !== 'archived' ? <ArchiveButton zone={zone} /> : null}
    </span>
  );
}

/**
 * «Duplicar» / «Duplicar como borrador».
 *
 * La clave de idempotencia se genera al abrir el diálogo y solo sirve para **esta** petición: si el
 * desenlace es incierto —red, 5xx—, «Reintentar» la repite y el backend no crea una segunda copia.
 * No se guarda en ningún almacenamiento ni se muestra. La respuesta es el recurso tipado de la
 * operación (`201`, `202` o `200`), y su `copyOperationId` abre la página de la operación.
 */
export function DuplicateButton({ zone }: { readonly zone: ShippingZone }) {
  const router = useRouter();
  const id = useId();
  const dialog = useRef<HTMLDialogElement | null>(null);
  const key = useRef<string | null>(null);
  const { busy, run } = useExclusive();
  const [name, setName] = useState('');
  const [failure, setFailure] = useState<Failure>(null);
  const [retryable, setRetryable] = useState(false);

  async function confirm() {
    const trimmed = name.trim();

    key.current ??= newIdempotencyKey();

    const idempotencyKey = key.current;
    const result = await run(() =>
      duplicateZone(zone.id, {
        idempotencyKey,
        expectedVersion: zone.version,
        ...(trimmed === '' ? {} : { name: trimmed }),
      }),
    );

    if (result === null) return;

    // La operación existe —lista, copiando, fallida o descartada—: se sigue desde su página, que
    // se reconstruye leyendo el backend solo con su `copyOperationId`.
    if (result.ok) {
      key.current = null;
      dialog.current?.close();
      router.push(copyOperationHref(result.data.operation.copyOperationId));

      return;
    }

    // Fallo anterior a la operación (validación, versión, idempotencia, permisos): error normal.
    if (!keepsKey(result.code)) key.current = null;
    setRetryable(keepsKey(result.code));
    setFailure({ code: result.code, reference: result.reference });
  }

  return (
    <>
      <button
        className={catalog.rowAction}
        onClick={() => {
          setFailure(null);
          setRetryable(false);
          key.current = null;
          dialog.current?.showModal();
        }}
        type="button"
      >
        {zone.status === 'archived' ? 'Duplicar como borrador' : 'Duplicar'}
      </button>
      <dialog
        aria-describedby={`${id}-text`}
        aria-labelledby={`${id}-title`}
        className={catalog.previewDialog}
        ref={dialog}
      >
        <div className={catalog.previewDialogBody}>
          <h2 className={catalog.sectionTitle} id={`${id}-title`}>
            Duplicar «{zone.name}»
          </h2>
          <p className={catalog.pageLead} id={`${id}-text`}>
            Se crea un borrador <strong>nuevo</strong> con la misma cobertura, las reglas activas y
            sus asignaciones. La copia se hace por lotes y se sigue desde su operación: si se
            detiene, se puede reanudar o descartar aunque cierres el navegador. La zona original no
            cambia.
          </p>
          <div className={catalog.field}>
            <label className={catalog.label} htmlFor={`${id}-name`}>
              Nombre de la copia (opcional)
            </label>
            <input
              className={catalog.input}
              disabled={busy}
              id={`${id}-name`}
              maxLength={80}
              onChange={(event) => {
                // Otro nombre es otra operación: la clave anterior ya no sirve.
                key.current = null;
                setRetryable(false);
                setName(event.target.value);
              }}
              placeholder={`${zone.name} (copia)`}
              value={name}
            />
            <p className={catalog.hint}>Si lo dejas vacío, el backend usa «{zone.name} (copia)».</p>
          </div>
          {failure === null ? null : (
            <FailureNotice code={failure.code} reference={failure.reference} />
          )}
          <div className={catalog.actions}>
            <button
              className={catalog.buttonPrimary}
              disabled={busy}
              onClick={() => void confirm()}
              type="button"
            >
              {busy ? 'Copiando…' : retryable ? 'Reintentar' : 'Duplicar'}
            </button>
            <button
              autoFocus
              className={catalog.buttonSecondary}
              disabled={busy}
              onClick={() => dialog.current?.close()}
              type="button"
            >
              Cerrar
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

/**
 * «Restaurar como borrador».
 *
 * Una zona archivada vuelve **siempre** a borrador, nunca directamente a activa: para cotizar otra
 * vez hay que activarla, y eso repite el análisis de solapamientos y todas las comprobaciones. Es
 * una acción distinta de «Duplicar como borrador», que crea otra zona.
 */
export function RestoreButton({
  zone,
  variant = 'row',
}: {
  readonly zone: ShippingZone;
  readonly variant?: 'row' | 'primary';
}) {
  const router = useRouter();
  const id = useId();
  const dialog = useRef<HTMLDialogElement | null>(null);
  const { busy, run } = useExclusive();
  const [failure, setFailure] = useState<Failure>(null);
  const [restored, setRestored] = useState<ShippingZone | null>(null);

  if (zone.copy.state === 'discarded') return null;

  async function confirm() {
    const result = await run(() => transitionZone(zone.id, 'restore', zone.version));

    if (result === null) return;
    if (!result.ok) {
      setFailure({ code: result.code, reference: result.reference });

      return;
    }

    setFailure(null);
    // Se refresca al cerrar el diálogo: refrescar ahora sacaría la fila de «Archivadas» y, con ella,
    // el diálogo que tiene que enseñar la versión nueva.
    setRestored(result.data);
  }

  return (
    <>
      <button
        className={variant === 'primary' ? catalog.buttonPrimary : catalog.rowAction}
        onClick={() => {
          setFailure(null);
          setRestored(null);
          dialog.current?.showModal();
        }}
        type="button"
      >
        Restaurar como borrador
      </button>
      <dialog
        aria-describedby={`${id}-text`}
        aria-labelledby={`${id}-title`}
        className={catalog.previewDialog}
        onClose={() => {
          if (restored !== null) router.refresh();
        }}
        ref={dialog}
      >
        <div className={catalog.previewDialogBody}>
          <h2 className={catalog.sectionTitle} id={`${id}-title`}>
            ¿Restaurar «{zone.name}» como borrador?
          </h2>
          <p className={catalog.pageLead} id={`${id}-text`}>
            La zona vuelve a borrador con su cobertura y sus reglas.{' '}
            <strong>No se activa sola</strong>: no cotiza hasta que la actives, y activarla repite
            el análisis de solapamientos y todas las comprobaciones. Los pedidos anteriores
            conservan su propia instantánea.
          </p>
          <div aria-live="polite">
            {restored === null ? null : (
              <p className={catalog.success} role="status">
                Restaurada como borrador. Ahora va por la versión {restored.version}.
              </p>
            )}
          </div>
          {failure === null ? null : (
            <FailureNotice code={failure.code} reference={failure.reference} />
          )}
          <div className={catalog.actions}>
            {restored === null ? (
              <button
                className={catalog.buttonPrimary}
                disabled={busy}
                onClick={() => void confirm()}
                type="button"
              >
                {busy ? 'Restaurando…' : 'Restaurar como borrador'}
              </button>
            ) : (
              <Link
                className={catalog.buttonPrimary}
                href={`/panel/envios/${encodeURIComponent(restored.id)}?paso=revision`}
              >
                Abrir el borrador
              </Link>
            )}
            <button
              autoFocus
              className={catalog.buttonSecondary}
              disabled={busy}
              onClick={() => dialog.current?.close()}
              type="button"
            >
              Cerrar
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

function ArchiveButton({ zone }: { readonly zone: ShippingZone }) {
  const router = useRouter();
  const id = useId();
  const dialog = useRef<HTMLDialogElement | null>(null);
  const { busy, run } = useExclusive();
  const [failure, setFailure] = useState<Failure>(null);

  async function confirm() {
    const result = await run(() => transitionZone(zone.id, 'archive', zone.version));

    if (result === null) return;
    if (!result.ok) {
      setFailure({ code: result.code, reference: result.reference });

      return;
    }

    dialog.current?.close();
    router.refresh();
  }

  return (
    <>
      <button
        className={catalog.rowAction}
        onClick={() => {
          setFailure(null);
          dialog.current?.showModal();
        }}
        type="button"
      >
        Archivar
      </button>
      <dialog
        aria-describedby={`${id}-text`}
        aria-labelledby={`${id}-title`}
        className={catalog.previewDialog}
        ref={dialog}
      >
        <div className={catalog.previewDialogBody}>
          <h2 className={catalog.sectionTitle} id={`${id}-title`}>
            ¿Archivar «{zone.name}»?
          </h2>
          <p className={catalog.pageLead} id={`${id}-text`}>
            La zona deja de cotizar y pasa a «Archivadas». Desde ahí se puede restaurar como
            borrador o duplicar. Los pedidos ya hechos conservan su propia instantánea del envío.
          </p>
          {zone.status === 'active' ? (
            <p className={catalog.notice}>
              Está activa: los destinos que solo cubre esta zona quedarán sin cobertura —cotización
              manual o no disponible, nunca gratis— hasta que otra zona los cubra.
            </p>
          ) : null}
          {failure === null ? null : (
            <FailureNotice code={failure.code} reference={failure.reference} />
          )}
          <div className={catalog.actions}>
            <button
              className={catalog.buttonDanger}
              disabled={busy}
              onClick={() => void confirm()}
              type="button"
            >
              {busy ? 'Archivando…' : 'Archivar zona'}
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
    </>
  );
}
