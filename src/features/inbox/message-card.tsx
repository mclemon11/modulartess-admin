import { formatDateTime } from '@/features/panel/format';
import type { CommunicationMessage } from '@/lib/api/communications';

import { DELIVERY_LABELS, describeAttachment, formatSize } from './inbox-labels';
import styles from './inbox.module.css';

/**
 * Un mensaje del hilo.
 *
 * El cuerpo es texto plano y React lo escapa: nada del correo se interpreta como HTML. Solo los
 * adjuntos que el backend guardó llevan enlace, y apuntan al BFF, nunca a una URL externa.
 */
export function MessageCard({
  conversationId,
  message,
}: {
  readonly conversationId: string;
  readonly message: CommunicationMessage;
}) {
  const outbound = message.direction === 'outbound';

  return (
    <article className={outbound ? styles.messageOutbound : styles.message}>
      <header className={styles.messageHead}>
        <span className={styles.messageFrom}>
          {outbound ? 'Respuesta desde ' : ''}
          {message.from.name === null
            ? message.from.email
            : `${message.from.name} <${message.from.email}>`}
        </span>
        <span>
          {formatDateTime(message.createdAt)}
          {outbound ? ` · ${DELIVERY_LABELS[message.delivery.state]}` : ''}
        </span>
      </header>
      <pre className={styles.body}>{message.plainText}</pre>
      {message.attachments.length === 0 ? null : (
        <ul className={styles.attachments}>
          {message.attachments.map((attachment) => (
            <li key={attachment.id}>
              {attachment.status === 'stored' ? (
                <a
                  download
                  href={`/api/admin/communications/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(message.id)}/attachments/${encodeURIComponent(attachment.id)}`}
                  rel="noopener"
                >
                  {attachment.filename}
                </a>
              ) : (
                <span>{attachment.filename}</span>
              )}{' '}
              · {formatSize(attachment.size)} · {describeAttachment(attachment)}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
