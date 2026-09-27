'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import catalog from './catalog.module.css';
import { describeOrderFailure, offersReload } from './order-errors';
import { fetchOrder, sendStatusReminder } from './orders-client';
import styles from './orders.module.css';
import {
  canSendStatusReminder,
  createReminderRunner,
  type ReminderOutcome,
} from './status-reminder-flow';

import type { AdminOrder } from '@/lib/api/orders';

/** El texto que la persona tiene que leer antes de enviar. Literal. */
export const STATUS_REMINDER_WARNING =
  'Se enviará un correo real al correo registrado del cliente con el estado actual del pedido.';

export const STATUS_REMINDER_ALREADY_QUEUED = 'Ya se envió un recordatorio para este estado.';

export const STATUS_REMINDER_QUEUED =
  'Recordatorio en cola. El trabajador de correo lo enviará en los próximos minutos.';

/**
 * «Enviar recordatorio al cliente», dentro de la tarjeta de notificaciones.
 *
 * Solo pide: el destinatario, el asunto, el cuerpo y el enlace los compone el backend desde el
 * pedido, y aquí no hay ningún campo para cambiarlos. Enseña el estado que se va a recordar tal
 * como lo publica el backend, pide una confirmación explícita y manda `expectedVersion`: si el
 * pedido cambió mientras se confirmaba, el backend lo rechaza y se ofrece recargar.
 *
 * Sin `notifications.send_reminder` no se pinta. Ocultarlo es usabilidad: el backend vuelve a
 * comprobar el permiso.
 */
export function StatusReminderControl({
  order,
  role,
  onUpdated,
}: {
  readonly order: AdminOrder;
  readonly role: string;
  readonly onUpdated: (order: AdminOrder) => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ReminderOutcome | null>(null);
  const runner = useRef<ReturnType<typeof createReminderRunner> | null>(null);

  if (!canSendStatusReminder(role)) {
    return null;
  }

  async function send(): Promise<void> {
    runner.current ??= createReminderRunner({
      send: sendStatusReminder,
      reload: fetchOrder,
      onUpdated,
      refresh: () => {
        router.refresh();
      },
    });
    setBusy(true);
    const result = await runner.current(order);

    if (result !== null) {
      setOutcome(result);
      setConfirming(false);
    }

    setBusy(false);
  }

  return (
    <StatusReminderView
      busy={busy}
      confirming={confirming}
      onCancel={() => {
        setConfirming(false);
      }}
      onConfirm={() => void send()}
      onReload={() => {
        router.refresh();
      }}
      onStart={() => {
        setOutcome(null);
        setConfirming(true);
      }}
      order={order}
      outcome={outcome}
    />
  );
}

/**
 * La parte que se ve, sin estado propio. Se prueba sobre el HTML que produce.
 *
 * Ni un campo de texto: el recordatorio no lleva nada escrito por la persona del panel.
 */
export function StatusReminderView({
  order,
  confirming,
  busy,
  outcome,
  onStart,
  onConfirm,
  onCancel,
  onReload,
}: {
  readonly order: AdminOrder;
  readonly confirming: boolean;
  readonly busy: boolean;
  readonly outcome: ReminderOutcome | null;
  readonly onStart: () => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly onReload: () => void;
}) {
  if (order.status === 'cancelled') {
    return (
      <p className={catalog.hint}>
        Un pedido cancelado no admite un recordatorio de estado: ya recibió su aviso de cancelación.
      </p>
    );
  }

  return (
    <div className={styles.reminderControl}>
      <p className={catalog.hint}>
        Estado que se enviará: <strong>{order.statusLabel}</strong> · Pago:{' '}
        <strong>{order.payment.statusLabel}</strong>
      </p>

      {confirming ? (
        <div className={styles.confirmation} role="group">
          <h3 className={styles.confirmationTitle}>
            Recordatorio al cliente del pedido {order.publicId}
          </h3>
          <p className={styles.confirmationText}>{STATUS_REMINDER_WARNING}</p>
          <div className={styles.detailActions}>
            <button
              className={catalog.buttonPrimary}
              disabled={busy}
              onClick={onConfirm}
              type="button"
            >
              Confirmar envío
            </button>
            <button
              className={catalog.buttonSecondary}
              disabled={busy}
              onClick={onCancel}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.detailActions}>
          <button
            className={catalog.buttonSecondary}
            disabled={busy}
            onClick={onStart}
            type="button"
          >
            Enviar recordatorio al cliente
          </button>
        </div>
      )}

      {outcome?.kind === 'queued' ? (
        <p className={catalog.success} role="status">
          {STATUS_REMINDER_QUEUED}
        </p>
      ) : null}
      {outcome?.kind === 'already_queued' ? (
        <p className={catalog.notice} role="status">
          {STATUS_REMINDER_ALREADY_QUEUED}
        </p>
      ) : null}
      {outcome?.kind === 'failure' ? (
        <p className={catalog.error} role="alert">
          {describeOrderFailure(outcome.code)}
          {offersReload(outcome.code) ? (
            <span className={styles.conflictActions}>
              <button className={catalog.buttonSecondary} onClick={onReload} type="button">
                Recargar pedido
              </button>
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
