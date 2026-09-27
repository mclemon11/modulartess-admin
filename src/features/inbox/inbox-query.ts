/**
 * Filtros de la bandeja, entre la URL y el contrato.
 *
 * La URL es la fuente del filtro —así un enlace o un «atrás» conservan la vista— y se estrecha aquí
 * a los valores que el contrato publica. Lo desconocido se ignora en lugar de mandarse al backend.
 *
 * Módulo puro.
 */

import type {
  ConversationChannel,
  ConversationQuery,
  ConversationStatus,
} from '@/lib/api/communications';

import { STATUSES, WORK_CHANNELS } from './inbox-labels';

export type InboxFilters = {
  readonly channel: ConversationChannel | null;
  readonly status: ConversationStatus | null;
  readonly assigned: 'me' | 'none' | null;
  readonly unread: boolean;
  readonly pageToken: string | null;
};

type Params = Readonly<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseInboxFilters(params: Params, canReview: boolean): InboxFilters {
  const channel = first(params.cola);
  const status = first(params.estado);
  const assigned = first(params.asignada);
  const pageToken = first(params.pageToken);

  return {
    channel:
      channel !== undefined && (WORK_CHANNELS as readonly string[]).includes(channel)
        ? (channel as ConversationChannel)
        : channel === 'unclassified' && canReview
          ? 'unclassified'
          : null,
    status:
      status !== undefined && (STATUSES as readonly string[]).includes(status)
        ? (status as ConversationStatus)
        : null,
    assigned: assigned === 'me' || assigned === 'none' ? assigned : null,
    unread: first(params.noLeidas) === '1',
    pageToken:
      pageToken !== undefined && /^[A-Za-z0-9_-]{1,2048}$/.test(pageToken) ? pageToken : null,
  };
}

export function toConversationQuery(filters: InboxFilters): ConversationQuery {
  const query: ConversationQuery = {};

  if (filters.channel !== null) query.channel = filters.channel;
  if (filters.status !== null) query.status = filters.status;
  if (filters.assigned !== null) query.assigned = filters.assigned;
  if (filters.unread) query.unread = 'true';
  if (filters.pageToken !== null) query.pageToken = filters.pageToken;

  return query;
}

/** Enlace a la bandeja con estos filtros. Cambiar de filtro vuelve siempre a la primera página. */
export function inboxHref(filters: Omit<InboxFilters, 'pageToken'>, pageToken?: string): string {
  const params = new URLSearchParams();

  if (filters.channel !== null) params.set('cola', filters.channel);
  if (filters.status !== null) params.set('estado', filters.status);
  if (filters.assigned !== null) params.set('asignada', filters.assigned);
  if (filters.unread) params.set('noLeidas', '1');
  if (pageToken !== undefined) params.set('pageToken', pageToken);

  const search = params.toString();

  return search === '' ? '/panel/bandeja' : `/panel/bandeja?${search}`;
}
