'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import catalog from '@/features/panel/catalog.module.css';
import type { Conversation } from '@/lib/api/communications';

import {
  assign,
  linkOrder,
  markRead,
  reclassify,
  setStatus,
  type InboxResult,
} from './inbox-client';
import { describeInboxFailure, offersReload } from './inbox-errors';
import { CHANNEL_LABELS, STATUS_LABELS, STATUSES, WORK_CHANNELS } from './inbox-labels';
import styles from './inbox.module.css';

/**
 * Estado, asignación, enlace a pedido y reclasificación de una conversación.
 *
 * Cada botón existe solo con su permiso, pero eso es usabilidad: el backend rechaza igual una
 * petición fabricada. Todas las mutaciones llevan `expectedVersion`, pasan por un candado síncrono
 * tomado antes del primer `await` y, al terminar, se recarga la pantalla con lo que dice el
 * backend.
 *
 * Ninguna toca un pedido: el enlace es informativo.
 */
export function ConversationControls({
  conversation,
  assignedToViewer,
  can,
}: {
  readonly conversation: Conversation;
  /** Decidido en el servidor con el UID verificado, que no sale de allí. */
  readonly assignedToViewer: boolean;
  readonly can: {
    readonly assign: boolean;
    readonly manage: boolean;
    readonly review: boolean;
  };
}) {
  const router = useRouter();
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [orderId, setOrderId] = useState(conversation.relatedOrderId ?? '');
  const [target, setTarget] = useState<string>(WORK_CHANNELS[0] ?? 'support');
  const readSent = useRef(false);

  // Abrirla la marca como leída, una sola vez por visita.
  useEffect(() => {
    if (readSent.current || conversation.unreadCount === 0) return;
    readSent.current = true;
    void markRead(conversation.id).then((result) => {
      if (result.ok) router.refresh();
    });
  }, [conversation.id, conversation.unreadCount, router]);

  async function run(action: () => Promise<InboxResult<Conversation>>): Promise<void> {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setFailure(null);

    const result = await action();

    if (result.ok) {
      router.refresh();
    } else {
      setFailure(result.code);
    }

    running.current = false;
    setBusy(false);
  }

  const { id, version } = conversation;
  const unclassified = conversation.channel === 'unclassified';

  return (
    <section className={`${catalog.card} ${catalog.cardPad}`}>
      <h2 className={catalog.sectionTitle}>Gestión</h2>

      <dl className={styles.delivery}>
        <dt>Cola</dt>
        <dd>{CHANNEL_LABELS[conversation.channel]}</dd>
        <dt>Estado</dt>
        <dd>{STATUS_LABELS[conversation.status]}</dd>
        <dt>Asignación</dt>
        <dd>
          {conversation.assignedAdminId === null
            ? 'Sin asignar'
            : assignedToViewer
              ? 'Asignada a ti'
              : 'Asignada a otra cuenta'}
        </dd>
        <dt>Pedido</dt>
        <dd>
          {conversation.relatedOrderId === null ? (
            'Sin pedido enlazado'
          ) : (
            <Link href={`/panel/pedidos/${encodeURIComponent(conversation.relatedOrderId)}`}>
              Ver pedido
            </Link>
          )}
        </dd>
      </dl>

      {can.manage && !unclassified ? (
        <div className={catalog.field}>
          <span className={catalog.label}>Cambiar estado</span>
          <div className={styles.actions}>
            {STATUSES.filter((status) => status !== conversation.status).map((status) => (
              <button
                className={catalog.buttonSecondary}
                disabled={busy}
                key={status}
                onClick={() => void run(() => setStatus(id, version, status))}
                type="button"
              >
                {STATUS_LABELS[status]}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {can.assign && !unclassified ? (
        <div className={styles.actions}>
          {assignedToViewer ? null : (
            <button
              className={catalog.buttonSecondary}
              disabled={busy}
              onClick={() => void run(() => assign(id, version, 'me'))}
              type="button"
            >
              Asignarme
            </button>
          )}
          {conversation.assignedAdminId === null ? null : (
            <button
              className={catalog.buttonSecondary}
              disabled={busy}
              onClick={() => void run(() => assign(id, version, 'none'))}
              type="button"
            >
              Quitar asignación
            </button>
          )}
        </div>
      ) : null}

      {can.manage && !unclassified ? (
        <form
          className={catalog.field}
          onSubmit={(event) => {
            event.preventDefault();
            const value = orderId.trim();
            void run(() => linkOrder(id, version, value === '' ? null : value));
          }}
        >
          <label className={catalog.label} htmlFor="conversation-order">
            Identificador del pedido
          </label>
          <input
            autoComplete="off"
            className={catalog.input}
            disabled={busy}
            id="conversation-order"
            maxLength={128}
            onChange={(event) => {
              setOrderId(event.target.value);
            }}
            value={orderId}
          />
          <span className={catalog.hint}>
            Solo enlaza: el pedido no cambia. Déjalo vacío para quitar el enlace.
          </span>
          <div className={styles.actions}>
            <button className={catalog.buttonSecondary} disabled={busy} type="submit">
              Guardar enlace
            </button>
          </div>
        </form>
      ) : null}

      {can.review && unclassified ? (
        <form
          className={catalog.field}
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => reclassify(id, version, target));
          }}
        >
          <label className={catalog.label} htmlFor="conversation-target">
            Mover a la cola
          </label>
          <select
            className={styles.select}
            disabled={busy}
            id="conversation-target"
            onChange={(event) => {
              setTarget(event.target.value);
            }}
            value={target}
          >
            {WORK_CHANNELS.map((channel) => (
              <option key={channel} value={channel}>
                {CHANNEL_LABELS[channel]}
              </option>
            ))}
          </select>
          <span className={catalog.hint}>
            Al reclasificarla se revisan y guardan sus adjuntos retenidos.
          </span>
          <div className={styles.actions}>
            <button className={catalog.buttonPrimary} disabled={busy} type="submit">
              Reclasificar
            </button>
          </div>
        </form>
      ) : null}

      {failure === null ? null : (
        <p className={catalog.error} role="alert">
          {describeInboxFailure(failure)}
          {offersReload(failure) ? (
            <button
              className={catalog.buttonSecondary}
              onClick={() => {
                router.refresh();
              }}
              type="button"
            >
              Recargar
            </button>
          ) : null}
        </p>
      )}
    </section>
  );
}
