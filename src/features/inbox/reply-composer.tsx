'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import catalog from '@/features/panel/catalog.module.css';
import type { Conversation } from '@/lib/api/communications';

import { reply } from './inbox-client';
import { describeInboxFailure, offersReload } from './inbox-errors';
import { REPLY_TEXT_MAX } from './inbox-input';
import { DELIVERY_LABELS } from './inbox-labels';
import { keyFor, replyFingerprint, type ReplyKey } from './reply-key';
import styles from './inbox.module.css';

/**
 * Respuesta desde el alias de la cola.
 *
 * El remitente no se elige: sale del alias que recibió el correo. Un doble clic no manda dos
 * correos —candado síncrono antes del primer `await`— y reintentar el mismo texto reutiliza la
 * `Idempotency-Key`, así que un corte de red a la vuelta tampoco. Tras enviar se dice lo que el
 * backend confirmó —en cola o aceptada—, nunca «entregada».
 */
export function ReplyComposer({ conversation }: { readonly conversation: Conversation }) {
  const router = useRouter();
  const running = useRef(false);
  const key = useRef<ReplyKey | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function send(): Promise<void> {
    if (running.current || text.trim() === '') return;
    running.current = true;
    setBusy(true);
    setFailure(null);
    setNotice(null);

    key.current = keyFor(
      key.current,
      replyFingerprint(conversation.id, conversation.version, text),
      () => crypto.randomUUID(),
    );
    const result = await reply(conversation.id, key.current.key, conversation.version, text);

    if (result.ok) {
      key.current = null;
      setText('');
      setNotice(`Respuesta registrada: ${DELIVERY_LABELS[result.data.message.delivery.state]}.`);
      router.refresh();
    } else {
      setFailure(result.code);
    }

    running.current = false;
    setBusy(false);
  }

  return (
    <form
      className={`${catalog.card} ${catalog.cardPad}`}
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <h2 className={catalog.sectionTitle}>Responder</h2>
      <p className={catalog.hint}>
        Sale desde {conversation.inboundAddress} hacia {conversation.counterpart.email}, en el mismo
        hilo.
      </p>
      <label className={catalog.field}>
        <span className="sr-only">Texto de la respuesta</span>
        <textarea
          className={catalog.textarea}
          disabled={busy}
          maxLength={REPLY_TEXT_MAX}
          onChange={(event) => {
            setText(event.target.value);
          }}
          rows={6}
          value={text}
        />
      </label>
      <div className={styles.actions}>
        <button
          className={catalog.buttonPrimary}
          disabled={busy || text.trim() === ''}
          type="submit"
        >
          {busy ? 'Enviando…' : 'Enviar respuesta'}
        </button>
      </div>
      {notice === null ? null : (
        <p className={catalog.hint} role="status">
          {notice}
        </p>
      )}
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
    </form>
  );
}
