import Link from 'next/link';

import { describeInboxFailure } from '@/features/inbox/inbox-errors';
import {
  CHANNEL_HINTS,
  CHANNEL_LABELS,
  STATUS_LABELS,
  STATUSES,
  WORK_CHANNELS,
} from '@/features/inbox/inbox-labels';
import { inboxHref, parseInboxFilters, toConversationQuery } from '@/features/inbox/inbox-query';
import styles from '@/features/inbox/inbox.module.css';
import catalog from '@/features/panel/catalog.module.css';
import { formatDateTime } from '@/features/panel/format';
import { PanelHeader } from '@/features/panel/panel-header';
import { PanelPageHeader } from '@/features/panel/panel-page-header';
import { EmptyState, ErrorState } from '@/features/panel/panel-states';
import { RefreshButton } from '@/features/panel/refresh-button';
import { resolvePanelSession } from '@/features/panel/session-context';
import { sessionErrorFromBackendFailure } from '@/features/session/api-errors';
import { can } from '@/features/session/permissions';
import {
  getCommunicationsSummary,
  listConversations,
  type CommunicationsSummary,
  type ConversationChannel,
  type ConversationPage,
} from '@/lib/api/communications';
import { isBackendFailure } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

type PageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const TRAIL = [{ href: '/panel', label: 'Panel' }, { label: 'Bandeja' }];

/**
 * Bandeja de entrada unificada.
 *
 * Una pestaña por cola —cada una es un alias de `modulartess.com`— y la de revisión solo para
 * `super_admin`. Los filtros viajan en la URL y se aplican en el backend; aquí no se filtra ni se
 * cuenta nada. El permiso se comprueba otra vez aunque la navegación ya oculte la entrada.
 */
export default async function InboxPage({ searchParams }: PageProps) {
  const session = await resolvePanelSession();

  if (session.kind !== 'active') return null;

  const { role, sessionMaterial, uid } = session.session;

  if (!can(role, 'communications.read')) {
    return (
      <>
        <PanelHeader trail={TRAIL} />
        <div className={catalog.page}>
          <PanelPageHeader title="Bandeja" />
          <ErrorState
            message="Tu rol no tiene acceso a la bandeja."
            title="Sin acceso a la bandeja"
          />
        </div>
      </>
    );
  }

  const canReview = can(role, 'communications.review_unclassified');
  const filters = parseInboxFilters(await searchParams, canReview);

  let summary: CommunicationsSummary;
  let page: ConversationPage;

  try {
    [summary, page] = await Promise.all([
      getCommunicationsSummary(sessionMaterial),
      listConversations(sessionMaterial, toConversationQuery(filters)),
    ]);
  } catch (error) {
    const message = isBackendFailure(error)
      ? describeInboxFailure(sessionErrorFromBackendFailure(error.code))
      : 'No pudimos cargar la bandeja.';

    return (
      <>
        <PanelHeader trail={TRAIL} />
        <div className={catalog.page}>
          <PanelPageHeader title="Bandeja" />
          <ErrorState
            action={
              <Link className={catalog.buttonSecondary} href="/panel/bandeja">
                Reintentar
              </Link>
            }
            message={message}
            title="No pudimos cargar la bandeja"
          />
        </div>
      </>
    );
  }

  const tabs: ReadonlyArray<ConversationChannel | null> = [
    null,
    ...WORK_CHANNELS,
    ...(canReview ? (['unclassified'] as const) : []),
  ];
  const unread = summary.unread as Readonly<Partial<Record<ConversationChannel, number>>>;
  const current = {
    channel: filters.channel,
    status: filters.status,
    assigned: filters.assigned,
    unread: filters.unread,
  };

  return (
    <>
      <PanelHeader trail={TRAIL} />
      <div className={catalog.page}>
        <PanelPageHeader
          actions={<RefreshButton />}
          lead={
            filters.channel === null
              ? 'Correos recibidos en los alias de modulartess.com. Los mensajes se muestran como texto; un correo nunca cambia un pedido.'
              : CHANNEL_HINTS[filters.channel]
          }
          title="Bandeja"
        />

        <nav aria-label="Colas" className={styles.tabs}>
          {tabs.map((channel) => {
            const count =
              channel === null
                ? Object.values(unread).reduce<number>((sum, value) => sum + (value ?? 0), 0)
                : (unread[channel] ?? 0);
            const active = filters.channel === channel;

            return (
              <Link
                aria-current={active ? 'page' : undefined}
                className={active ? styles.tabActive : styles.tab}
                href={inboxHref({ ...current, channel })}
                key={channel ?? 'all'}
              >
                {channel === null ? 'Todas' : CHANNEL_LABELS[channel]}
                {count > 0 ? (
                  <span className={styles.count}>
                    <span aria-hidden="true">{count > 99 ? '99+' : count}</span>
                    <span className="sr-only"> ({count} sin leer)</span>
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        {/* Formulario GET: los filtros son la URL, sin estado en el cliente. */}
        <form action="/panel/bandeja" className={styles.filters} method="get">
          {filters.channel === null ? null : (
            <input name="cola" type="hidden" value={filters.channel} />
          )}
          <label className={styles.filterField}>
            Estado
            <select className={styles.select} defaultValue={filters.status ?? ''} name="estado">
              <option value="">Todos</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            Asignación
            <select className={styles.select} defaultValue={filters.assigned ?? ''} name="asignada">
              <option value="">Cualquiera</option>
              <option value="me">Asignadas a mí</option>
              <option value="none">Sin asignar</option>
            </select>
          </label>
          <label className={styles.check}>
            <input defaultChecked={filters.unread} name="noLeidas" type="checkbox" value="1" />
            Solo no leídas
          </label>
          <button className={catalog.buttonSecondary} type="submit">
            Filtrar
          </button>
        </form>

        {page.items.length === 0 ? (
          <EmptyState icon="bandeja" title="No hay conversaciones">
            Nada coincide con esta cola y estos filtros.
          </EmptyState>
        ) : (
          <section className={catalog.card}>
            <ul className={styles.list}>
              {page.items.map((conversation) => (
                <li
                  className={`${styles.row} ${conversation.unreadCount > 0 ? styles.rowUnread : ''}`}
                  key={conversation.id}
                >
                  <Link
                    className={styles.rowLink}
                    href={`/panel/bandeja/${encodeURIComponent(conversation.id)}`}
                  >
                    <span className={styles.rowSubject}>{conversation.subject}</span>
                    <span className={styles.rowDate}>
                      {formatDateTime(conversation.lastMessageAt)}
                    </span>
                    <span className={styles.rowMeta}>
                      <span className={styles.pill}>{CHANNEL_LABELS[conversation.channel]}</span>
                      <span className={styles.pill}>{STATUS_LABELS[conversation.status]}</span>
                      {conversation.counterpart.name ?? conversation.counterpart.email}
                      {conversation.assignedAdminId === null
                        ? ' · Sin asignar'
                        : conversation.assignedAdminId === uid
                          ? ' · Asignada a ti'
                          : ' · Asignada'}
                    </span>
                    <span className={styles.rowDate}>
                      {conversation.unreadCount > 0
                        ? `${conversation.unreadCount} sin leer`
                        : `${conversation.messageCount} mensaje${conversation.messageCount === 1 ? '' : 's'}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className={catalog.pagination}>
          {page.nextPageToken === null ? (
            <p className={catalog.paginationNote}>No hay más conversaciones.</p>
          ) : (
            <Link className={catalog.buttonSecondary} href={inboxHref(current, page.nextPageToken)}>
              Ver más conversaciones
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
