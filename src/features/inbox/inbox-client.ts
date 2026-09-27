/**
 * Llamadas del navegador al BFF de la bandeja.
 *
 * Solo rutas locales: el navegador no conoce la URL del backend, no habla con Resend y no puede
 * leer la cookie de sesión. Cada respuesta se reduce a un resultado cerrado con el código estable
 * del BFF, y nada se guarda en `localStorage` ni en `sessionStorage`.
 */

import type { Conversation, ReplyResult } from '@/lib/api/communications';

export type InboxResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly code: string; readonly ambiguous: boolean };

async function post<T>(url: string, body: unknown, okStatus = 200): Promise<InboxResult<T>> {
  let response: Response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    // Salió y no se supo qué pasó con ella.
    return { ok: false, code: 'service_unavailable', ambiguous: true };
  }

  if (response.status === okStatus) {
    try {
      return { ok: true, data: (await response.json()) as T };
    } catch {
      return { ok: false, code: 'internal_error', ambiguous: true };
    }
  }

  try {
    const payload: unknown = await response.json();

    if (typeof payload === 'object' && payload !== null && 'code' in payload) {
      const { code } = payload as { code: unknown };

      if (typeof code === 'string' && code.length > 0) {
        return {
          ok: false,
          code,
          ambiguous: code === 'service_unavailable' || code === 'internal_error',
        };
      }
    }
  } catch {
    // Cuerpo ilegible.
  }

  return { ok: false, code: 'internal_error', ambiguous: true };
}

function base(conversationId: string): string {
  return `/api/admin/communications/conversations/${encodeURIComponent(conversationId)}`;
}

export function markRead(conversationId: string): Promise<InboxResult<Conversation>> {
  return post(`${base(conversationId)}/read`, {});
}

export function assign(
  conversationId: string,
  expectedVersion: number,
  assignee: 'me' | 'none',
): Promise<InboxResult<Conversation>> {
  return post(`${base(conversationId)}/assignment`, { expectedVersion, assignee });
}

export function setStatus(
  conversationId: string,
  expectedVersion: number,
  status: string,
): Promise<InboxResult<Conversation>> {
  return post(`${base(conversationId)}/status`, { expectedVersion, status });
}

export function linkOrder(
  conversationId: string,
  expectedVersion: number,
  orderId: string | null,
): Promise<InboxResult<Conversation>> {
  return post(`${base(conversationId)}/order-link`, { expectedVersion, orderId });
}

export function reclassify(
  conversationId: string,
  expectedVersion: number,
  channel: string,
): Promise<InboxResult<Conversation>> {
  return post(`${base(conversationId)}/reclassification`, { expectedVersion, channel });
}

export function reply(
  conversationId: string,
  idempotencyKey: string,
  expectedVersion: number,
  text: string,
): Promise<InboxResult<ReplyResult>> {
  return post(`${base(conversationId)}/replies`, { idempotencyKey, expectedVersion, text }, 201);
}
