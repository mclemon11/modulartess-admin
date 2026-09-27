import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { can } from '@/features/session/permissions';
import type { CommunicationMessage } from '@/lib/api/communications';

import { safeContentType, safeDisposition } from './attachment-headers';
import {
  parseAssign,
  parseMarkRead,
  parseOrderLink,
  parseReclassify,
  parseReply,
  parseStatus,
} from './inbox-input';
import { totalUnread } from './inbox-labels';
import { inboxHref, parseInboxFilters, toConversationQuery } from './inbox-query';
import { MessageCard } from './message-card';
import { keyFor, replyFingerprint } from './reply-key';

/**
 * La bandeja desde el panel: cuerpos cerrados hacia el BFF, filtros desde la URL, cabeceras de la
 * descarga y cómo se pinta un correo que no es de fiar.
 */

function message(overrides: Partial<CommunicationMessage> = {}): CommunicationMessage {
  return {
    id: 'msg_1',
    conversationId: 'conv_1',
    direction: 'inbound',
    from: { email: 'cliente@example.invalid', name: 'Cliente' },
    to: [{ email: 'soporte@modulartess.com', name: null }],
    cc: [],
    subject: 'Ayuda',
    plainText: 'Hola',
    attachments: [],
    delivery: { state: 'received', updatedAt: '2026-09-27T12:00:00.000Z', lastErrorCode: null },
    authorAdminId: null,
    createdAt: '2026-09-27T12:00:00.000Z',
    ...overrides,
  } as CommunicationMessage;
}

describe('permisos de la bandeja', () => {
  it('moderator no tiene ninguno', () => {
    for (const permission of [
      'communications.read',
      'communications.reply',
      'communications.assign',
      'communications.manage',
      'communications.review_unclassified',
    ] as const) {
      expect(can('moderator', permission), permission).toBe(false);
    }
  });

  it('master_admin trabaja la bandeja pero no revisa la cola sin clasificar', () => {
    expect(can('master_admin', 'communications.reply')).toBe(true);
    expect(can('master_admin', 'communications.review_unclassified')).toBe(false);
    expect(can('super_admin', 'communications.review_unclassified')).toBe(true);
  });
});

describe('cuerpos cerrados hacia el BFF', () => {
  it('marcar leída no lleva datos', () => {
    expect(parseMarkRead({})).toEqual({});
    expect(parseMarkRead({ unreadCount: 0 })).toBeNull();
  });

  it('la asignación solo admite «a mí» o «a nadie», nunca un UID del navegador', () => {
    expect(parseAssign({ expectedVersion: 2, assignee: 'me' })).toEqual({
      expectedVersion: 2,
      assignee: 'me',
    });
    expect(parseAssign({ expectedVersion: 2, assignee: 'adm_otro' })).toBeNull();
    expect(parseAssign({ expectedVersion: 2, assignee: 'me', assignedAdminId: 'x' })).toBeNull();
  });

  it('el estado es uno de los tres del contrato', () => {
    expect(parseStatus({ expectedVersion: 1, status: 'resolved' })).not.toBeNull();
    expect(parseStatus({ expectedVersion: 1, status: 'closed' })).toBeNull();
    expect(parseStatus({ expectedVersion: 0, status: 'open' })).toBeNull();
  });

  it('el enlace a pedido acepta un identificador o null, nada más', () => {
    expect(parseOrderLink({ expectedVersion: 1, orderId: ' ord_1 ' })).toEqual({
      expectedVersion: 1,
      orderId: 'ord_1',
    });
    expect(parseOrderLink({ expectedVersion: 1, orderId: null })).toEqual({
      expectedVersion: 1,
      orderId: null,
    });
    expect(parseOrderLink({ expectedVersion: 1, orderId: '../x' })).toBeNull();
  });

  it('no se reclasifica hacia la cola de revisión', () => {
    expect(parseReclassify({ expectedVersion: 1, channel: 'support' })).not.toBeNull();
    expect(parseReclassify({ expectedVersion: 1, channel: 'unclassified' })).toBeNull();
  });

  it('la respuesta no deja elegir remitente ni destinatario', () => {
    const base = { idempotencyKey: 'clave-respuesta-1', expectedVersion: 1, text: 'Hola' };

    expect(parseReply(base)).toEqual(base);
    expect(parseReply({ ...base, from: 'otro@example.invalid' })).toBeNull();
    expect(parseReply({ ...base, to: 'x@example.invalid' })).toBeNull();
    expect(parseReply({ ...base, text: '   ' })).toBeNull();
    expect(parseReply({ ...base, text: 'x'.repeat(20_001) })).toBeNull();
    expect(parseReply({ ...base, idempotencyKey: 'corta' })).toBeNull();
  });
});

describe('filtros desde la URL', () => {
  it('estrecha a los valores del contrato e ignora lo demás', () => {
    const filters = parseInboxFilters(
      { cola: 'support', estado: 'open', asignada: 'me', noLeidas: '1', pageToken: 'abc' },
      false,
    );

    expect(toConversationQuery(filters)).toEqual({
      channel: 'support',
      status: 'open',
      assigned: 'me',
      unread: 'true',
      pageToken: 'abc',
    });
    expect(parseInboxFilters({ cola: 'spam', estado: 'x', asignada: 'adm_1' }, true)).toEqual({
      channel: null,
      status: null,
      assigned: null,
      unread: false,
      pageToken: null,
    });
  });

  it('la cola de revisión solo entra con su permiso', () => {
    expect(parseInboxFilters({ cola: 'unclassified' }, false).channel).toBeNull();
    expect(parseInboxFilters({ cola: 'unclassified' }, true).channel).toBe('unclassified');
  });

  it('cambiar de filtro vuelve a la primera página', () => {
    expect(inboxHref({ channel: 'orders', status: null, assigned: null, unread: true })).toBe(
      '/panel/bandeja?cola=orders&noLeidas=1',
    );
    expect(inboxHref({ channel: null, status: null, assigned: null, unread: false })).toBe(
      '/panel/bandeja',
    );
  });

  it('el total de no leídos suma lo que devolvió el backend', () => {
    expect(totalUnread({ orders: 1, shipping: 0, support: 2, complaints: 0, information: 3 })).toBe(
      6,
    );
  });
});

describe('descarga de adjuntos', () => {
  it('solo pasan tipos permitidos; lo demás es binario opaco', () => {
    expect(safeContentType('application/pdf')).toBe('application/pdf');
    expect(safeContentType('image/PNG; charset=binary')).toBe('image/png');
    expect(safeContentType('text/html')).toBe('application/octet-stream');
    expect(safeContentType('image/svg+xml')).toBe('application/octet-stream');
    expect(safeContentType(null)).toBe('application/octet-stream');
  });

  it('siempre como descarga, con un nombre sin trucos', () => {
    expect(safeDisposition('attachment; filename="factura.pdf"')).toBe(
      'attachment; filename="factura.pdf"',
    );
    expect(safeDisposition('inline; filename="x.pdf"')).toBe('attachment');
    expect(safeDisposition('attachment; filename="../../etc/passwd"')).toBe('attachment');
    expect(safeDisposition('attachment; filename="a\r\nSet-Cookie: x"')).toBe('attachment');
  });
});

describe('clave de la respuesta', () => {
  it('se reutiliza para el mismo texto y cambia con otro', () => {
    let counter = 0;
    const newKey = () => `clave-${++counter}-xxxxxxxx`;
    const first = keyFor(null, replyFingerprint('conv_1', 2, 'Hola'), newKey);

    expect(keyFor(first, replyFingerprint('conv_1', 2, 'Hola'), newKey)).toBe(first);
    expect(keyFor(first, replyFingerprint('conv_1', 2, 'Hola!'), newKey).key).not.toBe(first.key);
    expect(keyFor(first, replyFingerprint('conv_1', 3, 'Hola'), newKey).key).not.toBe(first.key);
  });
});

describe('cómo se pinta un correo', () => {
  it('el texto se escapa: ni etiquetas ni manejadores llegan al marcado', () => {
    const html = renderToStaticMarkup(
      <MessageCard
        conversationId="conv_1"
        message={message({
          plainText: '<img src=x onerror="alert(1)"><script>alert(2)</script>',
          from: { email: 'x@example.invalid', name: '<b>Nombre</b>' },
        })}
      />,
    );

    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('solo los adjuntos guardados enlazan, y siempre al BFF', () => {
    const html = renderToStaticMarkup(
      <MessageCard
        conversationId="conv_1"
        message={message({
          attachments: [
            {
              id: 'att_1',
              filename: 'factura.pdf',
              contentType: 'application/pdf',
              size: 2048,
              status: 'stored',
              reason: null,
            },
            {
              id: 'att_2',
              filename: 'virus.exe',
              contentType: 'application/x-msdownload',
              size: 10,
              status: 'rejected',
              reason: 'type_not_allowed',
            },
            {
              id: 'att_3',
              filename: 'f.pdf',
              contentType: 'application/pdf',
              size: 10,
              status: 'held',
              reason: 'unclassified',
            },
          ],
        })}
      />,
    );

    expect(html).toContain(
      'href="/api/admin/communications/conversations/conv_1/messages/msg_1/attachments/att_1"',
    );
    expect(html.match(/href=/g)).toHaveLength(1);
    expect(html).toContain('Rechazado: tipo de archivo no permitido');
    expect(html).toContain('Retenido hasta reclasificar');
  });

  it('una respuesta enseña el estado del proveedor y nunca inventa «entregada»', () => {
    const html = renderToStaticMarkup(
      <MessageCard
        conversationId="conv_1"
        message={message({
          direction: 'outbound',
          delivery: {
            state: 'accepted',
            updatedAt: '2026-09-27T12:00:00.000Z',
            lastErrorCode: null,
          },
        })}
      />,
    );

    expect(html).toContain('Aceptada por el proveedor');
    expect(html).not.toContain('Entregada');
  });
});
