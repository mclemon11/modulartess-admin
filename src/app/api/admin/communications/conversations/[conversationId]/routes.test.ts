import { NextRequest } from 'next/server';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE_NAME } from '@/features/session/session-cookie';
import { BackendFailure } from '@/lib/api/errors';

/**
 * Rutas BFF de la bandeja. El navegador nunca llama al backend ni a Resend: todo pasa por aquí,
 * con `Origin` exacto, la cookie leída en el servidor y códigos estables.
 */

const api = {
  assignConversation: vi.fn(),
  replyToConversation: vi.fn(),
  downloadAttachment: vi.fn(),
  markConversationRead: vi.fn(),
};
const verifyAdminSession = vi.fn();

vi.mock('@/lib/api/communications', () => ({
  assignConversation: (...args: unknown[]) => api.assignConversation(...args),
  replyToConversation: (...args: unknown[]) => api.replyToConversation(...args),
  downloadAttachment: (...args: unknown[]) => api.downloadAttachment(...args),
  markConversationRead: (...args: unknown[]) => api.markConversationRead(...args),
}));
vi.mock('@/lib/api/backend-client', () => ({
  verifyAdminSession: (...args: unknown[]) => verifyAdminSession(...args),
}));

const assignment = await import('./assignment/route');
const replies = await import('./replies/route');
const read = await import('./read/route');
const download = await import('./messages/[messageId]/attachments/[attachmentId]/route');

const ORIGIN = 'https://panel.example.invalid';
const MATERIAL = 'material-de-sesion-opaco';
const context = { params: Promise.resolve({ conversationId: 'conv_1' }) };

function post(body: unknown, options: { origin?: string } = {}): NextRequest {
  return new NextRequest(`${ORIGIN}/api/admin/communications/conversations/conv_1/x`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: options.origin ?? ORIGIN,
      cookie: `${SESSION_COOKIE_NAME}=${MATERIAL}`,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.MODULARTESS_ADMIN_ORIGIN = ORIGIN;
  for (const fn of Object.values(api)) fn.mockReset();
  verifyAdminSession.mockReset();
});

afterEach(() => {
  delete process.env.MODULARTESS_ADMIN_ORIGIN;
});

describe('asignación', () => {
  it('«a mí» se resuelve con el UID de la sesión verificada, no con algo del navegador', async () => {
    verifyAdminSession.mockResolvedValue({ uid: 'adm_self', role: 'master_admin' });
    api.assignConversation.mockResolvedValue({ id: 'conv_1' });

    const response = await assignment.POST(post({ expectedVersion: 3, assignee: 'me' }), context);

    expect(response.status).toBe(200);
    expect(verifyAdminSession).toHaveBeenCalledWith(MATERIAL);
    expect(api.assignConversation).toHaveBeenCalledWith(MATERIAL, 'conv_1', {
      expectedVersion: 3,
      assignedAdminId: 'adm_self',
    });
  });

  it('«a nadie» no necesita verificar identidad', async () => {
    api.assignConversation.mockResolvedValue({ id: 'conv_1' });

    await assignment.POST(post({ expectedVersion: 3, assignee: 'none' }), context);

    expect(api.assignConversation).toHaveBeenCalledWith(MATERIAL, 'conv_1', {
      expectedVersion: 3,
      assignedAdminId: null,
    });
  });

  it('otro origen se rechaza sin llamar al backend', async () => {
    const response = await assignment.POST(
      post({ expectedVersion: 3, assignee: 'me' }, { origin: 'https://evil.example.invalid' }),
      context,
    );

    expect(response.status).toBe(403);
    expect(api.assignConversation).not.toHaveBeenCalled();
  });
});

describe('respuesta', () => {
  it('viaja con la clave en su encabezado y responde 201', async () => {
    api.replyToConversation.mockResolvedValue({ message: { id: 'msg_2' } });

    const response = await replies.POST(
      post({ idempotencyKey: 'clave-respuesta-1', expectedVersion: 2, text: 'Hola' }),
      context,
    );

    expect(response.status).toBe(201);
    expect(api.replyToConversation).toHaveBeenCalledWith(MATERIAL, 'conv_1', 'clave-respuesta-1', {
      expectedVersion: 2,
      text: 'Hola',
    });
  });

  it('sin clave de envío en el backend, 503 reply_unavailable', async () => {
    api.replyToConversation.mockRejectedValue(new BackendFailure('backend_reply_unavailable'));

    const response = await replies.POST(
      post({ idempotencyKey: 'clave-respuesta-1', expectedVersion: 2, text: 'Hola' }),
      context,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: 'reply_unavailable' });
  });

  it('un remitente elegido desde el navegador se rechaza', async () => {
    const response = await replies.POST(
      post({
        idempotencyKey: 'clave-respuesta-1',
        expectedVersion: 2,
        text: 'Hola',
        from: 'ceo@modulartess.com',
      }),
      context,
    );

    expect(response.status).toBe(400);
    expect(api.replyToConversation).not.toHaveBeenCalled();
  });
});

describe('leída', () => {
  it('un identificador con forma rara no llega al backend', async () => {
    const response = await read.POST(post({}), {
      params: Promise.resolve({ conversationId: '../admin' }),
    });

    expect(response.status).toBe(404);
    expect(api.markConversationRead).not.toHaveBeenCalled();
  });
});

describe('descarga de adjuntos', () => {
  const ids = { conversationId: 'conv_1', messageId: 'msg_1', attachmentId: 'att_1' };

  function get(cookie = true): NextRequest {
    return new NextRequest(
      `${ORIGIN}/api/admin/communications/conversations/conv_1/messages/msg_1/attachments/att_1`,
      {
        headers: cookie ? { cookie: `${SESSION_COOKIE_NAME}=${MATERIAL}` } : {},
      },
    );
  }

  it('entrega los bytes como descarga, con nosniff y sin caché', async () => {
    api.downloadAttachment.mockResolvedValue({
      bytes: new TextEncoder().encode('%PDF-1.7').buffer,
      contentType: 'application/pdf',
      contentDisposition: 'attachment; filename="factura.pdf"',
    });

    const response = await download.GET(get(), { params: Promise.resolve(ids) });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="factura.pdf"');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('%PDF-1.7');
  });

  it('un tipo peligroso llega como binario opaco', async () => {
    api.downloadAttachment.mockResolvedValue({
      bytes: new TextEncoder().encode('<script>').buffer,
      contentType: 'text/html',
      contentDisposition: 'inline',
    });

    const response = await download.GET(get(), { params: Promise.resolve(ids) });

    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('content-disposition')).toBe('attachment');
  });

  it('sin sesión no se pide nada', async () => {
    const response = await download.GET(get(false), { params: Promise.resolve(ids) });

    expect(response.status).toBe(401);
    expect(api.downloadAttachment).not.toHaveBeenCalled();
  });

  it('un adjunto retenido o rechazado es 409 attachment_unavailable', async () => {
    api.downloadAttachment.mockRejectedValue(new BackendFailure('backend_attachment_unavailable'));

    const response = await download.GET(get(), { params: Promise.resolve(ids) });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'attachment_unavailable' });
  });
});
