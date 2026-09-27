import Link from 'next/link';

import { ConversationControls } from '@/features/inbox/conversation-controls';
import { MessageCard } from '@/features/inbox/message-card';
import { describeInboxFailure } from '@/features/inbox/inbox-errors';
import { isResourceId } from '@/features/inbox/inbox-input';
import { CHANNEL_LABELS } from '@/features/inbox/inbox-labels';
import styles from '@/features/inbox/inbox.module.css';
import { ReplyComposer } from '@/features/inbox/reply-composer';
import catalog from '@/features/panel/catalog.module.css';
import { PanelHeader } from '@/features/panel/panel-header';
import { PanelPageHeader } from '@/features/panel/panel-page-header';
import { ErrorState } from '@/features/panel/panel-states';
import { resolvePanelSession } from '@/features/panel/session-context';
import { sessionErrorFromBackendFailure } from '@/features/session/api-errors';
import { can } from '@/features/session/permissions';
import {
  getConversation,
  listMessages,
  type CommunicationMessagePage,
  type Conversation,
} from '@/lib/api/communications';
import { isBackendFailure } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

type PageProps = {
  readonly params: Promise<{ readonly conversationId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Una conversación: el hilo, la gestión y la respuesta.
 *
 * Los mensajes son **texto plano**: React lo escapa y la hoja de estilos respeta los saltos de
 * línea. No se pinta HTML del correo en ningún caso, ni se cargan imágenes remotas. Los adjuntos se
 * descargan por el BFF y solo los que el backend guardó.
 */
export default async function ConversationPage({ params, searchParams }: PageProps) {
  const session = await resolvePanelSession();

  if (session.kind !== 'active') return null;

  const { role, sessionMaterial, uid } = session.session;
  const { conversationId } = await params;
  const trail = [
    { href: '/panel', label: 'Panel' },
    { href: '/panel/bandeja', label: 'Bandeja' },
    { label: 'Conversación' },
  ];

  if (!can(role, 'communications.read')) {
    return (
      <>
        <PanelHeader trail={trail} />
        <div className={catalog.page}>
          <ErrorState
            message="Tu rol no tiene acceso a la bandeja."
            title="Sin acceso a la bandeja"
          />
        </div>
      </>
    );
  }

  const pageToken = first((await searchParams).pageToken);
  let conversation: Conversation;
  let messages: CommunicationMessagePage;

  try {
    if (!isResourceId(conversationId)) throw new Error('not_found');
    [conversation, messages] = await Promise.all([
      getConversation(sessionMaterial, conversationId),
      listMessages(sessionMaterial, conversationId, pageToken),
    ]);
  } catch (error) {
    return (
      <>
        <PanelHeader trail={trail} />
        <div className={catalog.page}>
          <ErrorState
            action={
              <Link className={catalog.buttonSecondary} href="/panel/bandeja">
                Volver a la bandeja
              </Link>
            }
            message={
              isBackendFailure(error)
                ? describeInboxFailure(sessionErrorFromBackendFailure(error.code))
                : describeInboxFailure('not_found')
            }
            title="No pudimos abrir la conversación"
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PanelHeader trail={trail} />
      <div className={catalog.page}>
        <PanelPageHeader
          lead={`${CHANNEL_LABELS[conversation.channel]} · ${conversation.counterpart.name ?? conversation.counterpart.email} <${conversation.counterpart.email}>`}
          title={conversation.subject}
        />

        <div className={styles.layout}>
          <div className={styles.thread}>
            {messages.items.map((message) => (
              <MessageCard conversationId={conversation.id} key={message.id} message={message} />
            ))}
            {messages.nextPageToken === null ? null : (
              <Link
                className={catalog.buttonSecondary}
                href={`/panel/bandeja/${encodeURIComponent(conversation.id)}?pageToken=${encodeURIComponent(messages.nextPageToken)}`}
              >
                Ver más mensajes
              </Link>
            )}
            {can(role, 'communications.reply') && conversation.channel !== 'unclassified' ? (
              <ReplyComposer conversation={conversation} />
            ) : null}
          </div>

          <aside className={styles.side}>
            <ConversationControls
              assignedToViewer={conversation.assignedAdminId === uid}
              can={{
                assign: can(role, 'communications.assign'),
                manage: can(role, 'communications.manage'),
                review: can(role, 'communications.review_unclassified'),
              }}
              conversation={conversation}
            />
          </aside>
        </div>
      </div>
    </>
  );
}
