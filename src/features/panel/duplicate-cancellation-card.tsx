'use client';

import { useId, useState } from 'react';

import catalog from './catalog.module.css';
import {
  DUPLICATE_CANCELLATION_NOTE_MAX,
  duplicateCancellationBody,
  duplicateFailureText,
  duplicateLockText,
  duplicateNoteFor,
  duplicateSummary,
  isPublicOrderId,
  type AdminDuplicateCancellation,
  type AdminDuplicateCancellationEditing,
} from './duplicate-cancellation';
import { formatDateTime } from './format';
import { describeEditFailure } from './order-edit';
import { previewOrderEdit, saveOrderEdit } from './orders-client';
import styles from './orders.module.css';
import { SectionHeading } from './section-icon';

import { can } from '@/features/session/permissions';
import type { AdminOrder } from '@/lib/api/orders';

/**
 * «Pedido duplicado»: la marca de un pedido cancelado como duplicado del canónico, y la acción para
 * hacerlo. La acción solo aparece con `orders.cancel` y `payments.manage_manual`, cuando el backend
 * la permite; siempre pasa por una vista previa que enseña que no se envía ningún correo.
 */
export function OrderDuplicateCancellationCard({
  order,
  role,
  onUpdated,
}: {
  readonly order: AdminOrder;
  readonly role: string;
  readonly onUpdated: (order: AdminOrder) => void;
}) {
  // Ausentes con un backend anterior (por ejemplo, tras un rollback): no hay sección.
  const duplicateOf = order.duplicateOf as AdminDuplicateCancellation | null | undefined;
  const editing = order.duplicateCancellationEditing as
    AdminDuplicateCancellationEditing | undefined;
  const allowedRole = can(role, 'orders.cancel') && can(role, 'payments.manage_manual');

  if (duplicateOf !== null && duplicateOf !== undefined) {
    return (
      <section
        className={`${catalog.card} ${catalog.cardPad}`}
        aria-label="Cancelado como pedido duplicado"
      >
        <SectionHeading icon="estado" title="Pedido duplicado" />
        <p className={styles.duplicateSummary}>
          <strong>{duplicateSummary(duplicateOf, formatDateTime(duplicateOf.at))}</strong>
        </p>
        <p className={catalog.hint}>Nota: {duplicateOf.note}</p>
        <p className={catalog.hint}>
          Se canceló sin enviar correos. Los intentos de pago, callbacks y referencias se conservan.
        </p>
      </section>
    );
  }

  if (editing === undefined || !allowedRole) return null;
  if (order.status !== 'pending_payment') return null;

  return (
    <section
      className={`${catalog.card} ${catalog.cardPad}`}
      aria-label="Cancelar como pedido duplicado"
    >
      <SectionHeading icon="estado" title="Pedido duplicado" />
      {editing.allowed ? (
        <DuplicateCancellationForm onUpdated={onUpdated} order={order} />
      ) : (
        <p className={catalog.hint}>{duplicateLockText(editing.lock)}</p>
      )}
    </section>
  );
}

type Phase =
  | { readonly kind: 'closed' }
  | { readonly kind: 'editing'; readonly error: string | null }
  | {
      readonly kind: 'previewed';
      readonly customerEmails: readonly string[];
    }
  | { readonly kind: 'busy' };

function DuplicateCancellationForm({
  order,
  onUpdated,
}: {
  readonly order: AdminOrder;
  readonly onUpdated: (order: AdminOrder) => void;
}) {
  const id = useId();
  const [phase, setPhase] = useState<Phase>({ kind: 'closed' });
  const [draft, setDraft] = useState({ canonicalPublicId: '', note: '' });

  if (phase.kind === 'closed') {
    return (
      <>
        <p className={catalog.hint}>
          Si este pedido repite a otro del mismo cliente, cancélalo como duplicado: no se envía
          ningún correo y se conserva todo su historial de pago.
        </p>
        <button
          className={catalog.buttonSecondary}
          onClick={() => setPhase({ kind: 'editing', error: null })}
          type="button"
        >
          Cancelar como pedido duplicado
        </button>
      </>
    );
  }

  const run = async (confirmed: boolean) => {
    if (!isPublicOrderId(draft.canonicalPublicId)) {
      setPhase({
        kind: 'editing',
        error: 'El número del pedido canónico tiene la forma MZ-XXXXXXXX.',
      });
      return;
    }
    setPhase({ kind: 'busy' });
    const body = duplicateCancellationBody(order.version, draft, confirmed);
    const result = confirmed
      ? await saveOrderEdit(order.id, body)
      : await previewOrderEdit(order.id, body);

    if (!result.ok) {
      setPhase({
        kind: 'editing',
        error:
          duplicateFailureText(result.code, result.reference) ??
          describeEditFailure(result.code, result.reference),
      });
      return;
    }
    if (confirmed) {
      onUpdated(result.data.order);
      setPhase({ kind: 'closed' });
      return;
    }
    setPhase({ kind: 'previewed', customerEmails: result.data.customerNotifications });
  };
  const busy = phase.kind === 'busy';
  const editable = phase.kind === 'editing';
  // Nunca se confirma si la vista previa anunciara un correo al cliente.
  const emailsAnnounced = phase.kind === 'previewed' && phase.customerEmails.length > 0;

  return (
    <form
      className={styles.addiForm}
      onSubmit={(event) => {
        event.preventDefault();
        void run(phase.kind === 'previewed');
      }}
    >
      <p className={catalog.hint}>
        Cancela solo este pedido interno. No se envía nada al cliente ni al proveedor de pago, y el
        pedido canónico no cambia.
      </p>
      <div className={catalog.field}>
        <label className={catalog.label} htmlFor={`${id}-canonical`}>
          Pedido canónico (el que se conserva)
        </label>
        <input
          autoComplete="off"
          className={catalog.input}
          disabled={!editable}
          id={`${id}-canonical`}
          maxLength={11}
          onChange={(event) => {
            const canonicalPublicId = event.target.value;
            const suggested = duplicateNoteFor(draft.canonicalPublicId);
            setDraft({
              canonicalPublicId,
              // La nota sigue al canónico mientras nadie la haya cambiado.
              note:
                draft.note === '' || draft.note === suggested
                  ? duplicateNoteFor(canonicalPublicId)
                  : draft.note,
            });
          }}
          placeholder="MZ-XXXXXXXX"
          required
          value={draft.canonicalPublicId}
        />
      </div>
      <div className={catalog.field}>
        <label className={catalog.label} htmlFor={`${id}-note`}>
          Nota (obligatoria, solo interna)
        </label>
        <textarea
          className={catalog.textarea}
          disabled={!editable}
          id={`${id}-note`}
          maxLength={DUPLICATE_CANCELLATION_NOTE_MAX}
          onChange={(event) => setDraft({ ...draft, note: event.target.value })}
          required
          value={draft.note}
        />
      </div>
      {phase.kind === 'editing' && phase.error !== null ? (
        <p className={catalog.error} role="alert">
          {phase.error}
        </p>
      ) : null}
      {phase.kind === 'previewed' ? (
        emailsAnnounced ? (
          <p className={catalog.error} role="alert">
            La vista previa anuncia un correo al cliente. No se puede confirmar desde aquí.
          </p>
        ) : (
          <p className={catalog.hint} role="status">
            Vista previa correcta: el pedido quedará «Cancelado» como duplicado de{' '}
            {draft.canonicalPublicId.trim().toUpperCase()}. Correos al cliente: ninguno. Confirma
            para guardar.
          </p>
        )
      ) : null}
      <div className={styles.headActions}>
        <button
          className={catalog.buttonSecondary}
          disabled={busy}
          onClick={() =>
            phase.kind === 'previewed'
              ? setPhase({ kind: 'editing', error: null })
              : setPhase({ kind: 'closed' })
          }
          type="button"
        >
          {phase.kind === 'previewed' ? 'Volver a editar' : 'Cerrar'}
        </button>
        <button className={catalog.button} disabled={busy || emailsAnnounced} type="submit">
          {phase.kind === 'previewed' ? 'Confirmar cancelación como duplicado' : 'Vista previa'}
        </button>
      </div>
    </form>
  );
}
