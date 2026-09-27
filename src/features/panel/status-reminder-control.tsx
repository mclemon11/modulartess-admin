'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import catalog from './catalog.module.css';
import { describeNotificationStatus, notificationNote } from './notification-labels';
import { describeOrderFailure, offersReload } from './order-errors';
import { fetchOrder, sendStatusReminder } from './orders-client';
import styles from './orders.module.css';
import {
  canSendStatusReminder,
  createReminderRunner,
  REMINDER_ALREADY_QUEUED_MESSAGE,
  REMINDER_QUEUED_MESSAGE,
  trackReminder,
  type ReminderOutcome,
  type ReminderTracking,
} from './status-reminder-flow';

import type { AdminOrder } from '@/lib/api/orders';

/** El texto que la persona tiene que leer antes de enviar. Literal. */
export const STATUS_REMINDER_WARNING =
  'Se enviará un correo real al correo registrado del cliente con el estado actual del pedido.';

/**
 * «Enviar recordatorio al cliente», dentro de la tarjeta de notificaciones.
 *
 * Solo pide: el destinatario, el asunto, el cuerpo y el enlace los compone el backend desde el
 * pedido, y aquí no hay ningún campo para cambiarlos. Pide una confirmación explícita, manda
 * `expectedVersion` y, cuando el backend lo acepta, **sigue el aviso** releyendo la ficha hasta que
 * llega a un estado terminal —o hasta agotar un límite—. Lo que enseña es ese estado real, nunca
 * una promesa: «programado» no es «enviado», y «aceptado por el proveedor» no es «entregado».
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
  const [tracking, setTracking] = useState<ReminderTracking | null>(null);
  const runner = useRef<ReturnType<typeof createReminderRunner> | null>(null);
  const unmounted = useRef(false);

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
    };
  }, []);

  if (!canSendStatusReminder(role)) {
    return null;
  }

  async function send(): Promise<void> {
    runner.current ??= createReminderRunner({ send: sendStatusReminder });
    setBusy(true);
    setTracking(null);
    const result = await runner.current(order);

    if (result === null) {
      setBusy(false);
      return;
    }

    setOutcome(result);
    setConfirming(false);

    if (result.kind !== 'failure') {
      // Se sigue también un `already_queued`: el aviso existe y su estado es lo que importa.
      await trackReminder(order.id, result.notificationId, {
        reload: fetchOrder,
        onUpdated,
        onProgress: (next) => {
          if (!unmounted.current) {
            setTracking(next);
          }
        },
        wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        cancelled: () => unmounted.current,
      });
    }

    if (!unmounted.current) {
      setBusy(false);
    }
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
        setTracking(null);
        setConfirming(true);
      }}
      order={order}
      outcome={outcome}
      tracking={tracking}
    />
  );
}

/** Frase del seguimiento, a partir del estado real del aviso. */
export function trackingMessage(tracking: ReminderTracking | null): string | null {
  if (tracking === null) {
    return null;
  }
  if (tracking.kind === 'unknown') {
    return 'Consultando el estado del recordatorio…';
  }
  if (tracking.kind === 'timeout') {
    return tracking.lastStatus === null
      ? 'Todavía no vemos el recordatorio en la ficha. Vuelve a consultarla en unos minutos.'
      : `Estado del recordatorio: ${describeNotificationStatus(tracking.lastStatus)} Sigue sin terminar; el trabajador de correo lo procesará en su próxima pasada.`;
  }
  return `Estado del recordatorio: ${describeNotificationStatus(tracking.status)}`;
}

/**
 * La parte que se ve, sin estado propio. Se prueba sobre el HTML que produce.
 *
 * Ni un campo de texto: el recordatorio no lleva nada escrito por la persona del panel. Tampoco
 * enseña el identificador del aviso, el destinatario ni nada de la respuesta del proveedor.
 */
export function StatusReminderView({
  order,
  confirming,
  busy,
  outcome,
  tracking = null,
  onStart,
  onConfirm,
  onCancel,
  onReload,
}: {
  readonly order: AdminOrder;
  readonly confirming: boolean;
  readonly busy: boolean;
  readonly outcome: ReminderOutcome | null;
  readonly tracking?: ReminderTracking | null;
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

  const progress = trackingMessage(tracking);
  const tracked =
    outcome !== null && outcome.kind !== 'failure'
      ? order.notifications.find((entry) => entry.id === outcome.notificationId)
      : undefined;
  const note =
    tracking?.kind === 'status' && tracking.terminal && tracked !== undefined
      ? notificationNote(tracked.status, tracked.lastErrorCode)
      : null;

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
        <p className={catalog.notice} role="status">
          {REMINDER_QUEUED_MESSAGE}
        </p>
      ) : null}
      {outcome?.kind === 'already_queued' ? (
        <p className={catalog.notice} role="status">
          {REMINDER_ALREADY_QUEUED_MESSAGE}
        </p>
      ) : null}
      {progress === null ? null : (
        <p aria-live="polite" className={catalog.hint}>
          {progress}
          {note === null ? null : ` ${note}`}
        </p>
      )}
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
