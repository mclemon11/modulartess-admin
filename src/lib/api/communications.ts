import 'server-only';

/**
 * Bandeja de entrada contra el backend. **Solo servidor.**
 *
 * La autoridad es el backend (ADR 0020 del backend): decide permisos, colas, hilos, qué adjunto se
 * puede descargar y cuándo sale una respuesta. Este módulo solo transporta la sesión, la
 * `Idempotency-Key` de las respuestas y los cuerpos cerrados que publica el contrato.
 *
 * El navegador no llama nunca a Resend ni al backend: todo pasa por aquí.
 */

import { backendClient } from './backend-client';
import { BackendFailure, communicationsFailure } from './errors';
import type { components, paths } from './generated/schema';
import { ADMIN_SESSION_HEADER } from './session-material';

export type Conversation = components['schemas']['ConversationDto'];
export type ConversationPage = components['schemas']['ConversationPageDto'];
export type CommunicationMessage = components['schemas']['CommunicationMessageDto'];
export type CommunicationMessagePage = components['schemas']['CommunicationMessagePageDto'];
export type CommunicationAttachment = components['schemas']['CommunicationAttachmentDto'];
export type CommunicationsSummary = components['schemas']['CommunicationsSummaryDto'];
export type ReplyResult = components['schemas']['ReplyConversationResultDto'];
export type ConversationChannel = Conversation['channel'];
export type ConversationStatus = Conversation['status'];
export type ReclassifyChannel =
  components['schemas']['ReclassifyConversationRequestDto']['channel'];
export type DeliveryState = components['schemas']['CommunicationDeliveryDto']['state'];

export type ConversationQuery = NonNullable<
  paths['/v1/admin/communications/conversations']['get']['parameters']['query']
>;

function sessionHeaders(sessionMaterial: string): Record<string, string> {
  return { [ADMIN_SESSION_HEADER]: sessionMaterial };
}

function toFailure(error: unknown): BackendFailure {
  return error instanceof BackendFailure ? error : new BackendFailure('backend_unavailable');
}

type Outcome<T> = {
  readonly data?: T;
  readonly error?: unknown;
  readonly response: Response;
};

async function call<T>(request: () => Promise<Outcome<T>>): Promise<T> {
  let response: Outcome<T>;

  try {
    response = await request();
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw communicationsFailure(response.response.status, response.error);
  }

  return response.data;
}

export function getCommunicationsSummary(sessionMaterial: string): Promise<CommunicationsSummary> {
  return call(() =>
    backendClient().GET('/v1/admin/communications/summary', {
      headers: sessionHeaders(sessionMaterial),
    }),
  );
}

export function listConversations(
  sessionMaterial: string,
  query: ConversationQuery,
): Promise<ConversationPage> {
  return call(() =>
    backendClient().GET('/v1/admin/communications/conversations', {
      params: { query },
      headers: sessionHeaders(sessionMaterial),
    }),
  );
}

export function getConversation(
  sessionMaterial: string,
  conversationId: string,
): Promise<Conversation> {
  return call(() =>
    backendClient().GET('/v1/admin/communications/conversations/{conversationId}', {
      params: { path: { conversationId } },
      headers: sessionHeaders(sessionMaterial),
    }),
  );
}

export function listMessages(
  sessionMaterial: string,
  conversationId: string,
  pageToken?: string,
): Promise<CommunicationMessagePage> {
  return call(() =>
    backendClient().GET('/v1/admin/communications/conversations/{conversationId}/messages', {
      params: {
        path: { conversationId },
        query: pageToken === undefined ? {} : { pageToken },
      },
      headers: sessionHeaders(sessionMaterial),
    }),
  );
}

export function markConversationRead(
  sessionMaterial: string,
  conversationId: string,
): Promise<Conversation> {
  return call(() =>
    backendClient().POST('/v1/admin/communications/conversations/{conversationId}/read', {
      params: { path: { conversationId } },
      headers: sessionHeaders(sessionMaterial),
    }),
  );
}

export function assignConversation(
  sessionMaterial: string,
  conversationId: string,
  body: { readonly expectedVersion: number; readonly assignedAdminId: string | null },
): Promise<Conversation> {
  return call(() =>
    backendClient().POST('/v1/admin/communications/conversations/{conversationId}/assignment', {
      params: { path: { conversationId } },
      body,
      headers: sessionHeaders(sessionMaterial),
    }),
  );
}

export function setConversationStatus(
  sessionMaterial: string,
  conversationId: string,
  body: { readonly expectedVersion: number; readonly status: ConversationStatus },
): Promise<Conversation> {
  return call(() =>
    backendClient().POST('/v1/admin/communications/conversations/{conversationId}/status', {
      params: { path: { conversationId } },
      body,
      headers: sessionHeaders(sessionMaterial),
    }),
  );
}

export function linkConversationOrder(
  sessionMaterial: string,
  conversationId: string,
  body: { readonly expectedVersion: number; readonly orderId: string | null },
): Promise<Conversation> {
  return call(() =>
    backendClient().POST('/v1/admin/communications/conversations/{conversationId}/order-link', {
      params: { path: { conversationId } },
      body,
      headers: sessionHeaders(sessionMaterial),
    }),
  );
}

export function reclassifyConversation(
  sessionMaterial: string,
  conversationId: string,
  body: { readonly expectedVersion: number; readonly channel: ReclassifyChannel },
): Promise<Conversation> {
  return call(() =>
    backendClient().POST(
      '/v1/admin/communications/conversations/{conversationId}/reclassification',
      { params: { path: { conversationId } }, body, headers: sessionHeaders(sessionMaterial) },
    ),
  );
}

export function replyToConversation(
  sessionMaterial: string,
  conversationId: string,
  idempotencyKey: string,
  body: { readonly expectedVersion: number; readonly text: string },
): Promise<ReplyResult> {
  return call(() =>
    backendClient().POST('/v1/admin/communications/conversations/{conversationId}/replies', {
      params: { path: { conversationId }, header: { 'Idempotency-Key': idempotencyKey } },
      body,
      headers: sessionHeaders(sessionMaterial),
    }),
  );
}

export type DownloadedAttachment = {
  readonly bytes: ArrayBuffer;
  readonly contentType: string | null;
  readonly contentDisposition: string | null;
};

/** Los bytes del adjunto, del bucket privado a través del backend. Nunca hay URL pública. */
export async function downloadAttachment(
  sessionMaterial: string,
  ids: {
    readonly conversationId: string;
    readonly messageId: string;
    readonly attachmentId: string;
  },
): Promise<DownloadedAttachment> {
  let response;

  try {
    response = await backendClient().GET(
      '/v1/admin/communications/conversations/{conversationId}/messages/{messageId}/attachments/{attachmentId}',
      { params: { path: ids }, headers: sessionHeaders(sessionMaterial), parseAs: 'arrayBuffer' },
    );
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw communicationsFailure(response.response.status, response.error);
  }

  return {
    bytes: response.data,
    contentType: response.response.headers.get('content-type'),
    contentDisposition: response.response.headers.get('content-disposition'),
  };
}
