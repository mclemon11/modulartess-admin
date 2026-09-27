import { NextRequest } from 'next/server';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE_NAME } from '@/features/session/session-cookie';
import { BackendFailure } from '@/lib/api/errors';

/**
 * Frontera del recordatorio manual. El navegador solo manda `expectedVersion`; el BFF añade la
 * sesión de la cookie y traduce las respuestas del backend a códigos del panel.
 */

const sendStatusReminder = vi.fn();

vi.mock('@/lib/api/orders', () => ({
  sendStatusReminder: (...args: unknown[]) => sendStatusReminder(...args),
}));

const { POST } = await import('./route');

const ALLOWED_ORIGIN = 'https://panel.example.invalid';
const MATERIAL = 'material-de-sesion-opaco';
const context = { params: Promise.resolve({ orderId: 'ord_abc' }) };

function request(body: unknown, origin: string = ALLOWED_ORIGIN): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json', origin });
  headers.set('cookie', `${SESSION_COOKIE_NAME}=${MATERIAL}`);
  return new NextRequest(
    'https://panel.example.invalid/api/admin/orders/ord_abc/notifications/status-reminder',
    { method: 'POST', headers, body: JSON.stringify(body) },
  );
}

beforeEach(() => {
  process.env.MODULARTESS_ADMIN_ORIGIN = ALLOWED_ORIGIN;
  sendStatusReminder.mockReset();
});

afterEach(() => {
  delete process.env.MODULARTESS_ADMIN_ORIGIN;
});

describe('POST /api/admin/orders/[orderId]/notifications/status-reminder', () => {
  it('manda solo la versión y devuelve queued', async () => {
    sendStatusReminder.mockResolvedValue({ status: 'queued', notificationId: 'ntf_1' });
    const response = await POST(request({ expectedVersion: 3 }), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'queued', notificationId: 'ntf_1' });
    expect(sendStatusReminder).toHaveBeenCalledWith(MATERIAL, 'ord_abc', { expectedVersion: 3 });
  });

  it('devuelve already_queued tal cual', async () => {
    sendStatusReminder.mockResolvedValue({ status: 'already_queued', notificationId: 'ntf_1' });
    const response = await POST(request({ expectedVersion: 3 }), context);
    await expect(response.json()).resolves.toMatchObject({ status: 'already_queued' });
  });

  it('rechaza un destinatario sin llamar al backend', async () => {
    const response = await POST(
      request({ expectedVersion: 3, recipient: 'otra@example.com' }),
      context,
    );
    expect(response.status).toBe(400);
    expect(sendStatusReminder).not.toHaveBeenCalled();
  });

  it('rechaza un Origin ajeno sin llamar al backend', async () => {
    const response = await POST(request({ expectedVersion: 3 }, 'https://evil.example'), context);
    expect(response.status).toBe(403);
    expect(sendStatusReminder).not.toHaveBeenCalled();
  });

  it.each([
    ['backend_conflict', 409, 'version_conflict'],
    ['backend_forbidden', 403, 'admin_role_required'],
    ['backend_status_reminder_not_allowed', 409, 'status_reminder_not_allowed'],
    ['backend_notifications_unavailable', 503, 'notifications_unavailable'],
  ] as const)('traduce %s a %i %s', async (failure, status, code) => {
    sendStatusReminder.mockRejectedValue(new BackendFailure(failure));
    const response = await POST(request({ expectedVersion: 3 }), context);
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ code });
  });
});
