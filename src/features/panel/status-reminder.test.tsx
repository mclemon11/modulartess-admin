import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { OrderNotificationsCard } from './order-detail-cards';
import { describeOrderFailure, offersReload } from './order-errors';
import { parseStatusReminder } from './order-input';
import {
  STATUS_REMINDER_ALREADY_QUEUED,
  STATUS_REMINDER_QUEUED,
  STATUS_REMINDER_WARNING,
  StatusReminderView,
} from './status-reminder-control';
import { canSendStatusReminder, createReminderRunner } from './status-reminder-flow';
import { describeNotificationEvent, notificationNote } from './notification-labels';

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

  it('queued y already_queued se cuentan distinto', () => {
    expect(view({ outcome: { kind: 'queued' } })).toContain(STATUS_REMINDER_QUEUED);
    expect(view({ outcome: { kind: 'already_queued' } })).toContain(
      'Ya se envió un recordatorio para este estado.',
    );
    expect(STATUS_REMINDER_ALREADY_QUEUED).toBe('Ya se envió un recordatorio para este estado.');
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
    let release: (value: { ok: true; status: 'queued' }) => void = () => undefined;
    const send = vi.fn(
      () =>
        new Promise<{ ok: true; status: 'queued' }>((resolve) => {
          release = resolve;
        }),
    );
    const run = createReminderRunner({
      send,
      reload: async () => order({ version: 3 }),
      onUpdated: () => undefined,
      refresh: () => undefined,
    });

    const first = run(order());
    const second = await run(order());
    expect(second).toBeNull();
    release({ ok: true, status: 'queued' });
    await expect(first).resolves.toEqual({ kind: 'queued' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('ord_abc', 3);
  });

  it('tras queued vuelve a leer la ficha y la sustituye', async () => {
    const fresh = order({ notifications: [{ id: 'ntf_1' } as AdminNotification] });
    const onUpdated = vi.fn();
    const refresh = vi.fn();
    const run = createReminderRunner({
      send: async () => ({ ok: true, status: 'queued' }),
      reload: async () => fresh,
      onUpdated,
      refresh,
    });
    await run(order());
    expect(onUpdated).toHaveBeenCalledWith(fresh);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('si no puede releer, refresca la página', async () => {
    const refresh = vi.fn();
    const run = createReminderRunner({
      send: async () => ({ ok: true, status: 'queued' }),
      reload: async () => null,
      onUpdated: () => undefined,
      refresh,
    });
    await run(order());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('already_queued no relee: no se escribió nada', async () => {
    const reload = vi.fn();
    const run = createReminderRunner({
      send: async () => ({ ok: true, status: 'already_queued' }),
      reload,
      onUpdated: () => undefined,
      refresh: () => undefined,
    });
    await expect(run(order())).resolves.toEqual({ kind: 'already_queued' });
    expect(reload).not.toHaveBeenCalled();
  });

  it('un conflicto vuelve como fallo y libera el candado', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, code: 'version_conflict', ambiguous: false })
      .mockResolvedValueOnce({ ok: true, status: 'queued' });
    const run = createReminderRunner({
      send,
      reload: async () => null,
      onUpdated: () => undefined,
      refresh: () => undefined,
    });
    await expect(run(order())).resolves.toEqual({ kind: 'failure', code: 'version_conflict' });
    await expect(run(order())).resolves.toEqual({ kind: 'queued' });
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
