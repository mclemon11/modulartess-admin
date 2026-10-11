'use client';

import { useId, useState } from 'react';

import { AddiOutcomeBadge } from './addi-outcome-badge';
import {
  addiAttemptFacts,
  addiCancellationBody,
  ADDI_CANCELLATION_NOTE_MAX,
  ADDI_CANCELLATION_REFERENCE_MAX,
  cancellationLockText,
  cancellationSummary,
  type AdminAddiAttempt,
  type AdminAddiPayment,
} from './addi-payment';
import catalog from './catalog.module.css';
import { formatDateTime } from './format';
import { describeEditFailure } from './order-edit';
import { OrderStatusBadge } from './order-status-badge';
import { previewOrderEdit, saveOrderEdit } from './orders-client';
import styles from './orders.module.css';
import { PaymentStatusBadge } from './payment-status-badge';
import { SectionHeading } from './section-icon';

import { can } from '@/features/session/permissions';
import type { AdminOrder } from '@/lib/api/orders';

/**
 * «Pago con Addi»: la sección de un pedido de **Addi Online** (ADR 0030 del backend).
 *
 * Arriba, las tres lecturas por separado —estado del pedido, estado local del pago y lo que informó
 * Addi—, porque pueden diferir sin contradicción: un pedido sigue «Pendiente de pago» con un
 * intento «Abandonado por el cliente». Debajo, **todos** los intentos, del más reciente al más
 * antiguo, cada uno con su línea de tiempo; el que Addi aprobó se marca, y ninguno se oculta.
 *
 * «Cancelado en Addi» solo aparece con una cancelación registrada. Addi no la informa: el panel lo
 * dice y ofrece registrarla, con el permiso de pagos manuales y una vista previa antes de guardar.
 */
export function OrderAddiPaymentCard({
  order,
  role,
  onUpdated,
}: {
  readonly order: AdminOrder;
  readonly role: string;
  readonly onUpdated: (order: AdminOrder) => void;
}) {
  // Ausente con un backend anterior (por ejemplo, tras un rollback): no hay sección.
  const addi = order.addiPayment as AdminAddiPayment | null | undefined;

  if (addi === null || addi === undefined) return null;

  return (
    <section className={`${catalog.card} ${catalog.cardPad}`} aria-label="Pago con Addi">
      <SectionHeading icon="pago" title="Pago con Addi" />

      <div className={styles.addiStates}>
        <div className={styles.addiState}>
          <span className={styles.addiStateLabel}>Método</span>
          <span className={styles.addiChannel}>{addi.channel.label}</span>
        </div>
        <div className={styles.addiState}>
          <span className={styles.addiStateLabel}>Resultado en Addi</span>
          <AddiOutcomeBadge outcome={addi.current} />
        </div>
        <div className={styles.addiState}>
          <span className={styles.addiStateLabel}>Pago (estado local)</span>
          <PaymentStatusBadge label={order.payment.statusLabel} status={order.payment.status} />
        </div>
        <div className={styles.addiState}>
          <span className={styles.addiStateLabel}>Pedido</span>
          <OrderStatusBadge label={order.statusLabel} status={order.status} />
        </div>
      </div>

      {order.status === 'pending_payment' && addi.approvedAttemptNumber === null ? (
        <p className={catalog.hint}>
          El pedido sigue pendiente de pago: un intento abandonado, rechazado o vencido no cancela
          el pedido y el cliente puede volver a intentarlo.
        </p>
      ) : null}
      {order.status === 'cancelled' ? (
        <p className={catalog.hint}>
          Pedido cancelado. Cancelar el pedido no cancela un crédito en Addi.
        </p>
      ) : null}

      <ol className={styles.addiAttempts} aria-label="Intentos con Addi, del más reciente">
        {addi.attempts.map((attempt) => (
          <AddiAttemptItem attempt={attempt} key={attempt.reference} />
        ))}
      </ol>

      <p className={styles.addiNotice}>{addi.cancellationNotice}</p>

      <AddiCancellationControl addi={addi} onUpdated={onUpdated} order={order} role={role} />
    </section>
  );
}

function AddiAttemptItem({ attempt }: { readonly attempt: AdminAddiAttempt }) {
  return (
    <li className={`${styles.addiAttempt} ${attempt.approved ? styles.addiAttemptApproved : ''}`}>
      <p className={styles.addiAttemptHead}>
        <span>Intento {attempt.attemptNumber}</span>
        <AddiOutcomeBadge outcome={attempt.result} />
        {attempt.approved ? (
          <span className={styles.addiApprovedMark}>✓ Este intento terminó aprobado</span>
        ) : null}
      </p>
      <dl className={styles.facts}>
        {addiAttemptFacts(attempt).map((fact) => (
          <div className={styles.fact} key={fact.label}>
            <dt className={styles.factLabel}>{fact.label}</dt>
            <dd className={styles.factValue}>{fact.value}</dd>
          </div>
        ))}
      </dl>
      {attempt.cancellation === null ? null : (
        <p className={catalog.hint}>
          <strong>{cancellationSummary(attempt.cancellation)}</strong>. Nota:{' '}
          {attempt.cancellation.note}
        </p>
      )}
      <ol
        className={styles.addiEvents}
        aria-label={`Historial del intento ${attempt.attemptNumber}`}
      >
        {attempt.events.map((event, index) => (
          <li key={`${event.kind}-${index}`}>
            <span className={styles.addiEventTime}>{formatDateTime(event.at)}</span> · {event.label}
            {event.detail === null ? null : ` (${event.detail})`}
          </li>
        ))}
      </ol>
    </li>
  );
}

type Phase =
  | { readonly kind: 'closed' }
  | { readonly kind: 'editing'; readonly error: string | null }
  | { readonly kind: 'previewed' }
  | { readonly kind: 'busy' };

/**
 * Registrar que Addi confirmó la cancelación de un crédito aprobado. Solo con
 * `payments.manage_manual`, solo cuando el backend lo admite y siempre con vista previa: el
 * backend valida el día, la nota y el estado, y la cancelación nunca toca el pago ni el pedido.
 */
function AddiCancellationControl({
  order,
  addi,
  role,
  onUpdated,
}: {
  readonly order: AdminOrder;
  readonly addi: AdminAddiPayment;
  readonly role: string;
  readonly onUpdated: (order: AdminOrder) => void;
}) {
  const id = useId();
  const [phase, setPhase] = useState<Phase>({ kind: 'closed' });
  const [draft, setDraft] = useState({ confirmedOn: '', externalReference: '', note: '' });

  if (!can(role, 'payments.manage_manual')) return null;
  const locked = cancellationLockText(addi.cancellationEditing.lock);

  if (!addi.cancellationEditing.allowed) {
    return locked === null || addi.approvedAttemptNumber === null ? null : (
      <p className={catalog.hint}>{locked}</p>
    );
  }

  if (phase.kind === 'closed') {
    return (
      <button
        className={catalog.buttonSecondary}
        onClick={() => setPhase({ kind: 'editing', error: null })}
        type="button"
      >
        Registrar cancelación confirmada en Addi
      </button>
    );
  }

  const run = async (confirmed: boolean) => {
    setPhase({ kind: 'busy' });
    const body = addiCancellationBody(order.version, draft, confirmed);
    const result = confirmed
      ? await saveOrderEdit(order.id, body)
      : await previewOrderEdit(order.id, body);

    if (!result.ok) {
      setPhase({ kind: 'editing', error: describeEditFailure(result.code, result.reference) });
      return;
    }
    if (confirmed) {
      onUpdated(result.data.order);
      setPhase({ kind: 'closed' });
      return;
    }
    setPhase({ kind: 'previewed' });
  };
  const busy = phase.kind === 'busy';
  const editable = phase.kind === 'editing';

  return (
    <form
      className={styles.addiForm}
      onSubmit={(event) => {
        event.preventDefault();
        void run(phase.kind === 'previewed');
      }}
    >
      <p className={catalog.hint}>
        Registra solo una cancelación que ya confirmaste en el Portal de Aliados de Addi. No se
        envía nada a Addi y el pago aprobado, su fecha y el estado del pedido no cambian.
      </p>
      <div className={catalog.field}>
        <label className={catalog.label} htmlFor={`${id}-day`}>
          Día en que Addi confirmó la cancelación
        </label>
        <input
          className={catalog.input}
          disabled={!editable}
          id={`${id}-day`}
          onChange={(event) => setDraft({ ...draft, confirmedOn: event.target.value })}
          required
          type="date"
          value={draft.confirmedOn}
        />
      </div>
      <div className={catalog.field}>
        <label className={catalog.label} htmlFor={`${id}-reference`}>
          Referencia de la cancelación en Addi (opcional)
        </label>
        <input
          className={catalog.input}
          disabled={!editable}
          id={`${id}-reference`}
          maxLength={ADDI_CANCELLATION_REFERENCE_MAX}
          onChange={(event) => setDraft({ ...draft, externalReference: event.target.value })}
          value={draft.externalReference}
        />
      </div>
      <div className={catalog.field}>
        <label className={catalog.label} htmlFor={`${id}-note`}>
          Nota (obligatoria)
        </label>
        <textarea
          className={catalog.textarea}
          disabled={!editable}
          id={`${id}-note`}
          maxLength={ADDI_CANCELLATION_NOTE_MAX}
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
        <p className={catalog.hint} role="status">
          Vista previa correcta: el intento {addi.cancellationEditing.attemptNumber} quedará como
          «Cancelado en Addi». Confirma para guardarlo.
        </p>
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
          {phase.kind === 'previewed' ? 'Volver a editar' : 'Cancelar'}
        </button>
        <button className={catalog.button} disabled={busy} type="submit">
          {phase.kind === 'previewed' ? 'Confirmar y guardar' : 'Revisar'}
        </button>
      </div>
    </form>
  );
}
