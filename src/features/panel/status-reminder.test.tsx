import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { OrderNotificationsCard } from './order-detail-cards';
import { describeOrderFailure, offersReload } from './order-errors';
import { parseStatusReminder } from './order-input';
import {
  STATUS_REMINDER_WARNING,
  StatusReminderView,
  trackingMessage,
} from './status-reminder-control';
import {
  canSendStatusReminder,
  createReminderRunner,
  REMINDER_ALREADY_QUEUED_MESSAGE,
  REMINDER_QUEUED_MESSAGE,
  trackReminder,
  type ReminderTracking,
} from './status-reminder-flow';
import {
  describeNotificationEvent,
  describeNotificationStatus,
  notificationNote,
} from './notification-labels';

import type { AdminNotification, AdminOrder } from '@/lib/api/orders';

/**
 * Recordatorio manual del estado desde la ficha del pedido.
 *
 * El panel solo **pide**: no hay campo para el destinatario, el asunto ni el cuerpo, y lo único
 * que viaja es la versión. Lo que se comprueba aquí es lo que no puede fallar: que la acción solo
 * aparezca con el permiso, que pida confirmación con el texto acordado, que un doble clic no mande
 * dos peticiones y que cada respuesta del backend se cuente como lo que es.
 */

function order(overrides: Partial<AdminOrder> = {}): AdminOrder {
  return {
    id: 'ord_abc',
    publicId: 'MZ-A33JZEGY',
    version: 3,
    status: 'pending_payment',
    statusLabel: 'Pendiente de pago',
    createdAt: '2026-09-27T15:16:05.000Z',
    updatedAt: '2026-09-27T15:16:05.000Z',
    timeline: [],
    payment: {
      status: 'pending',
      statusLabel: 'Pendiente',
      environment: 'live',
      attemptNumber: 0,
      approvedAt: null,
      approvedAtSource: null,
      updatedAt: '2026-09-27T15:16:05.000Z',
    },
    paymentAttempts: [],
    paymentEvents: [],
    notifications: [],
    paymentSimulationEnabled: false,
    availableSimulationEvents: [],
    paymentSummary: null,
    ...overrides,
  } as AdminOrder;
}

function view(props: Partial<Parameters<typeof StatusReminderView>[0]> = {}): string {
  return renderToStaticMarkup(
    <StatusReminderView
      busy={false}
      confirming={false}
      onCancel={() => undefined}
      onConfirm={() => undefined}
      onReload={() => undefined}
      onStart={() => undefined}
      order={order()}
      outcome={null}
      {...props}
    />,
  );
}

describe('permiso', () => {
  it('solo super_admin ve la acción', () => {
    expect(canSendStatusReminder('super_admin')).toBe(true);
    expect(canSendStatusReminder('master_admin')).toBe(false);
    expect(canSendStatusReminder('moderator')).toBe(false);
    expect(canSendStatusReminder('desconocido')).toBe(false);
  });
});

describe('lo que se ve', () => {
  it('ofrece la acción y dice qué estado se enviará, sin ningún campo editable', () => {
    const html = view();
    expect(html).toContain('Enviar recordatorio al cliente');
    expect(html).toContain('Estado que se enviará: <strong>Pendiente de pago</strong>');
    expect(html).toContain('Pago: <strong>Pendiente</strong>');
    expect(html).not.toMatch(/<input|<textarea|<select|contenteditable/);
    // Ni el destinatario, ni un asunto, ni un cuerpo.
    expect(html).not.toContain('@');
    expect(html.toLowerCase()).not.toMatch(/asunto|destinatario/);
  });

  it('pide confirmación explícita con el texto acordado antes de enviar', () => {
    const html = view({ confirming: true });
    expect(html).toContain(STATUS_REMINDER_WARNING);
    expect(STATUS_REMINDER_WARNING).toBe(
      'Se enviará un correo real al correo registrado del cliente con el estado actual del pedido.',
    );
    expect(html).toContain('Confirmar envío');
    expect(html).toContain('Cancelar');
    expect(html).not.toContain('Enviar recordatorio al cliente');
  });

  it('mientras envía, los botones quedan deshabilitados', () => {
    const html = view({ confirming: true, busy: true });
    expect(html.match(/disabled=""/g) ?? []).toHaveLength(2);
  });

  it('queued y already_queued nunca dicen «enviado»', () => {
    const queued = view({ outcome: { kind: 'queued', notificationId: 'ntf_1' } });
    const already = view({ outcome: { kind: 'already_queued', notificationId: 'ntf_1' } });
    expect(queued).toContain('Recordatorio programado para envío.');
    expect(already).toContain('Ya existe un recordatorio para este estado.');
    expect(REMINDER_QUEUED_MESSAGE).toBe('Recordatorio programado para envío.');
    expect(REMINDER_ALREADY_QUEUED_MESSAGE).toBe('Ya existe un recordatorio para este estado.');
    for (const html of [queued, already]) {
      expect(html.toLowerCase()).not.toMatch(/ya se envió|enviado|entregado|recibido/);
    }
  });

  it('enseña el estado real del seguimiento, sin identificadores ni destinatarios', () => {
    const html = view({
      order: order({
        notifications: [
          {
            id: 'ntf_630e7cfa58ba3232ed9c092da4bd8b62',
            eventKey: 'order_status_reminder',
            status: 'sent',
            lastErrorCode: null,
          } as AdminNotification,
        ],
      }),
      outcome: { kind: 'queued', notificationId: 'ntf_630e7cfa58ba3232ed9c092da4bd8b62' },
      tracking: { kind: 'status', status: 'sent', terminal: true },
    });
    expect(html).toContain('Estado del recordatorio: Aceptado por el proveedor de correo.');
    expect(html).toContain('No tenemos confirmación de que haya llegado al buzón del cliente.');
    expect(html).not.toContain('ntf_630e7cfa');
    expect(html).not.toContain('@');
    expect(html.toLowerCase()).not.toContain('entregado');
  });

  it('un conflicto de versión pide recargar y no se presenta como fallo genérico', () => {
    const html = view({ outcome: { kind: 'failure', code: 'version_conflict' } });
    expect(html).toContain('El pedido cambió mientras lo mirabas.');
    expect(html).toContain('Recargar pedido');
    expect(offersReload('version_conflict')).toBe(true);
  });

  it('un error controlado se explica con su texto y sin ofrecer recargar', () => {
    const html = view({ outcome: { kind: 'failure', code: 'notifications_unavailable' } });
    expect(html).toContain(describeOrderFailure('notifications_unavailable'));
    expect(html).not.toContain('Recargar pedido');
  });

  it('un pedido cancelado no ofrece la acción', () => {
    const html = view({ order: order({ status: 'cancelled', statusLabel: 'Cancelado' }) });
    expect(html).not.toContain('Enviar recordatorio al cliente');
    expect(html).toContain('no admite un recordatorio');
  });

  it('la tarjeta de notificaciones le hace sitio', () => {
    const html = renderToStaticMarkup(<OrderNotificationsCard order={order()} reminder={view()} />);
    expect(html).toContain('Notificaciones (0)');
  });
});

describe('el envío', () => {
  it('un doble clic manda una sola petición', async () => {
    let release: (value: { ok: true; status: 'queued'; notificationId: string }) => void = () =>
      undefined;
    const send = vi.fn(
      () =>
        new Promise<{ ok: true; status: 'queued'; notificationId: string }>((resolve) => {
          release = resolve;
        }),
    );
    const run = createReminderRunner({ send });

    const first = run(order());
    const second = await run(order());
    expect(second).toBeNull();
    release({ ok: true, status: 'queued', notificationId: 'ntf_1' });
    await expect(first).resolves.toEqual({ kind: 'queued', notificationId: 'ntf_1' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('ord_abc', 3);
  });

  it('un conflicto vuelve como fallo y libera el candado', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, code: 'version_conflict', ambiguous: false })
      .mockResolvedValueOnce({ ok: true, status: 'already_queued', notificationId: 'ntf_1' });
    const run = createReminderRunner({ send });
    await expect(run(order())).resolves.toEqual({ kind: 'failure', code: 'version_conflict' });
    await expect(run(order())).resolves.toEqual({
      kind: 'already_queued',
      notificationId: 'ntf_1',
    });
  });
});

function withReminder(status: string, lastErrorCode: string | null = null): AdminOrder {
  return order({
    notifications: [
      {
        id: 'ntf_1',
        eventKey: 'order_status_reminder',
        status,
        lastErrorCode,
      } as AdminNotification,
    ],
  });
}

async function track(sequence: Array<AdminOrder | null>, maxPolls = 10) {
  const progress: ReminderTracking[] = [];
  const updated: AdminOrder[] = [];
  let index = 0;
  const result = await trackReminder(
    'ord_abc',
    'ntf_1',
    {
      reload: async () => sequence[Math.min(index++, sequence.length - 1)] ?? null,
      onUpdated: (next) => updated.push(next),
      onProgress: (next) => progress.push(next),
      wait: async () => undefined,
    },
    { maxPolls },
  );
  return { result, progress, updated, polls: index };
}

describe('seguimiento hasta el estado real', () => {
  it.each([
    ['sent', 'Aceptado por el proveedor de correo'],
    ['suppressed', 'No enviado'],
    ['dead_letter', 'No se pudo enviar'],
  ])('pending → sending → %s', async (terminal, label) => {
    const { result, progress, updated } = await track([
      withReminder('pending'),
      withReminder('sending'),
      withReminder(terminal),
    ]);
    expect(progress.map((entry) => (entry.kind === 'status' ? entry.status : entry.kind))).toEqual([
      'pending',
      'sending',
      terminal,
    ]);
    expect(result).toEqual({ kind: 'status', status: terminal, terminal: true });
    // Cada lectura sustituye la ficha: la tarjeta se actualiza sin recargar la página.
    expect(updated).toHaveLength(3);
    expect(trackingMessage(result)).toBe(`Estado del recordatorio: ${label}.`);
  });

  it('un fallo transitorio del proveedor no es terminal: se sigue consultando', async () => {
    const { result, progress } = await track([
      withReminder('sending'),
      withReminder('pending', 'provider_unavailable'),
      withReminder('sent'),
    ]);
    expect(progress).toHaveLength(3);
    expect(result).toMatchObject({ status: 'sent', terminal: true });
  });

  it('con un límite: si no termina, lo dice sin darlo por enviado', async () => {
    const { result, polls } = await track([withReminder('pending')], 4);
    expect(polls).toBe(4);
    expect(result).toEqual({ kind: 'timeout', lastStatus: 'pending' });
    const message = trackingMessage(result) ?? '';
    expect(message).toContain('Pendiente de envío');
    expect(message.toLowerCase()).not.toMatch(/enviado|entregado|aceptado/);
  });

  it('si la ficha no se puede leer, no inventa un estado', async () => {
    const { result, progress } = await track([null], 3);
    expect(progress).toEqual([{ kind: 'timeout', lastStatus: null }]);
    expect(result).toEqual({ kind: 'timeout', lastStatus: null });
  });

  it('se detiene si la pantalla se cierra', async () => {
    const reload = vi.fn(async () => withReminder('pending'));
    await trackReminder(
      'ord_abc',
      'ntf_1',
      {
        reload,
        onUpdated: () => undefined,
        onProgress: () => undefined,
        wait: async () => undefined,
        cancelled: () => true,
      },
      { maxPolls: 10 },
    );
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('estados de los avisos', () => {
  it.each([
    ['pending', 'Pendiente de envío'],
    ['sending', 'Enviando'],
    ['sent', 'Aceptado por el proveedor de correo'],
    ['suppressed', 'No enviado'],
    ['dead_letter', 'No se pudo enviar'],
  ])('%s se llama «%s»', (status, label) => {
    expect(describeNotificationStatus(status)).toBe(label);
  });

  it('sent no equivale a entregado: no existe «Entregado» ni «Enviado» sin más', () => {
    expect(describeNotificationStatus('sent')).not.toMatch(/^Enviado|Entregado/);
    expect(notificationNote('sent')).toContain('No tenemos confirmación');
  });

  it('un código de error del proveedor no se enseña tal cual', () => {
    const html = renderToStaticMarkup(
      <OrderNotificationsCard
        order={order({
          notifications: [
            {
              id: 'ntf_630e7cfa58ba3232ed9c092da4bd8b62',
              eventKey: 'order_status_reminder',
              audience: 'customer',
              template: 'customer_order_status_reminder',
              templateVersion: 1,
              deliveryMode: 'provider',
              status: 'dead_letter',
              attempts: 5,
              createdAt: '2026-09-27T16:33:32.000Z',
              updatedAt: '2026-09-27T16:34:04.000Z',
              nextAttemptAt: null,
              sentAt: null,
              lastErrorCode: 'provider_credentials_rejected',
            } as AdminNotification,
          ],
        })}
      />,
    );
    expect(html).toContain('No se pudo enviar');
    expect(html).not.toContain('provider_credentials_rejected');
    expect(html).not.toContain('ntf_630e7cfa');
  });
});

describe('el cuerpo que acepta el BFF', () => {
  it('solo expectedVersion', () => {
    expect(parseStatusReminder({ expectedVersion: 3 })).toEqual({ expectedVersion: 3 });
  });

  it.each([
    ['recipient', { recipient: 'otra@example.com' }],
    ['subject', { subject: 'Hola' }],
    ['body', { body: 'Texto' }],
    ['status', { status: 'paid' }],
    ['environment', { environment: 'live' }],
    ['url', { url: 'https://evil.example' }],
    ['template', { template: 'x' }],
  ])('rechaza %s', (_field, extra) => {
    expect(parseStatusReminder({ expectedVersion: 3, ...extra })).toBeNull();
  });
});

describe('etiquetas', () => {
  it('order_status_reminder es «Recordatorio manual de estado»', () => {
    expect(describeNotificationEvent('order_status_reminder')).toBe(
      'Recordatorio manual de estado',
    );
  });

  it('las supresiones a propósito se explican, no se enseñan como fallo', () => {
    expect(notificationNote('suppressed', 'payment_reminder_superseded_by_manual_reminder')).toBe(
      'Se sustituyó por un recordatorio manual de estado. No se envió.',
    );
    expect(notificationNote('suppressed', 'notification_environment_mismatch')).toBe(
      'El aviso se escribió con otro ambiente de pago que el del pedido. No se envió.',
    );
  });
});

describe('contrato', () => {
  const contract = JSON.parse(readFileSync('openapi/backend-v1.json', 'utf8')) as {
    paths: Record<string, { post?: { description?: string } }>;
    components: { schemas: Record<string, { properties?: Record<string, { enum?: string[] }> }> };
  };

  it('la copia local publica la operación, su permiso y sus dos respuestas', () => {
    const operation =
      contract.paths['/v1/admin/orders/{orderId}/notifications/status-reminder']?.post;
    expect(operation?.description).toContain('notifications.send_reminder');
    expect(
      Object.keys(contract.components.schemas.StatusReminderRequestDto?.properties ?? {}),
    ).toEqual(['expectedVersion']);
    expect(contract.components.schemas.StatusReminderResponseDto?.properties?.status?.enum).toEqual(
      ['queued', 'already_queued'],
    );
    expect(contract.components.schemas.AdminNotificationDto?.properties?.eventKey?.enum).toContain(
      'order_status_reminder',
    );
  });

  it('el componente cliente no llama al backend: solo al BFF', () => {
    const client = readFileSync('src/features/panel/orders-client.ts', 'utf8');
    expect(client).toContain('/api/admin/orders/');
    expect(client).not.toMatch(/run\.app|MODULARTESS_BACKEND|openapi-fetch/);
  });
});

describe('ningún texto de avisos dice «Enviado» ni «Entregado»', () => {
  const STATUSES = [
    'pending',
    'sending',
    'sent',
    'failed',
    'dead_letter',
    'previewed',
    'suppressed',
  ];
  const EVENTS = [
    'order_received',
    'payment_reminder',
    'payment_processing',
    'payment_approved',
    'payment_declined',
    'payment_voided',
    'payment_expired',
    'payment_error',
    'order_preparing',
    'order_ready_to_ship',
    'order_shipped',
    'order_delivered',
    'order_cancelled',
    'order_status_reminder',
  ];

  it('ni en los estados, ni en las notas, ni en los nombres de los avisos', () => {
    for (const status of STATUSES) {
      const text = `${describeNotificationStatus(status)} ${notificationNote(status) ?? ''}`;
      expect(text, status).not.toMatch(/\b(Enviado|Entregado)\b/);
    }
    for (const event of EVENTS) {
      expect(describeNotificationEvent(event), event).not.toMatch(/^(Enviado|Entregado)$/);
    }
    expect(describeNotificationEvent('order_shipped')).toBe('Pedido enviado');
    expect(describeNotificationEvent('order_delivered')).toBe('Pedido entregado');
  });

  it('la tarjeta nombra la fecha del proveedor como aceptación, no como envío', () => {
    const html = renderToStaticMarkup(
      <OrderNotificationsCard
        order={order({
          notifications: STATUSES.map(
            (status, index) =>
              ({
                id: `ntf_${index}`,
                eventKey: 'order_status_reminder',
                audience: 'customer',
                template: 'customer_order_status_reminder',
                templateVersion: 1,
                deliveryMode: 'provider',
                status,
                attempts: 1,
                createdAt: '2026-09-27T16:33:32.000Z',
                updatedAt: '2026-09-27T16:34:04.000Z',
                nextAttemptAt: null,
                sentAt: status === 'sent' ? '2026-09-27T16:34:04.000Z' : null,
                lastErrorCode: null,
              }) as AdminNotification,
          ),
        })}
      />,
    );
    expect(html).toContain('Aceptado por el proveedor');
    expect(html).not.toMatch(/>(Enviado|Entregado)</);
    for (const label of [
      'Pendiente de envío',
      'Enviando',
      'Aceptado por el proveedor de correo',
      'No enviado',
      'No se pudo enviar',
    ]) {
      expect(html).toContain(label);
    }
  });
});
