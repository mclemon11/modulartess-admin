import { NextRequest } from 'next/server';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE_NAME } from '@/features/session/session-cookie';
import { BackendFailure } from '@/lib/api/errors';

/**
 * Simulador de pago en el BFF.
 *
 * El navegador llama **solo** a esta ruta local: no conoce la URL del backend, no tiene identidad
 * IAM y no puede leer la cookie. Aquí se comprueba la frontera completa —`Origin`, cookie, cuerpo,
 * traducción de fallos— y, sobre todo, que el cuerpo se estreche al contrato: sin `eventId` no hay
 * idempotencia, y un resultado inventado no puede llegar a gastar una llamada.
 */

const simulateOrderPayment = vi.fn();

vi.mock('@/lib/api/orders', () => ({
  simulateOrderPayment: (...args: unknown[]) => simulateOrderPayment(...args),
}));

const { POST } = await import('./route');

const ALLOWED_ORIGIN = 'https://panel.example.invalid';
const MATERIAL = 'material-de-sesion-opaco';

const context = { params: Promise.resolve({ orderId: 'ord_abc' }) };

const VALID_BODY = {
  event: 'approved',
  expectedVersion: 3,
  eventId: '3f2b1c7e-0a8d-4c2f-9c11-7a4c2b0d55e1',
};

function request(options?: {
  readonly origin?: string | null;
  readonly body?: unknown;
  readonly cookie?: boolean;
}): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });

  if (options?.origin !== null) {
    headers.set('origin', options?.origin ?? ALLOWED_ORIGIN);
  }

  if (options?.cookie !== false) {
    headers.set('cookie', `${SESSION_COOKIE_NAME}=${MATERIAL}`);
  }

  return new NextRequest(
    'https://panel.example.invalid/api/admin/orders/ord_abc/payment-simulation',
    { method: 'POST', headers, body: JSON.stringify(options?.body ?? VALID_BODY) },
  );
}

beforeEach(() => {
  process.env.MODULARTESS_ADMIN_ORIGIN = ALLOWED_ORIGIN;
  simulateOrderPayment.mockReset();
});

afterEach(() => {
  delete process.env.MODULARTESS_ADMIN_ORIGIN;
});

describe('POST /api/admin/orders/[orderId]/payment-simulation', () => {
  it('transporta la sesión de la cookie y devuelve el pedido autoritativo', async () => {
    const order = { id: 'ord_abc', publicId: 'MZ-1', version: 4, status: 'paid' };

    simulateOrderPayment.mockResolvedValue(order);

    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(order);
    expect(simulateOrderPayment).toHaveBeenCalledWith(MATERIAL, 'ord_abc', VALID_BODY);
    // Una respuesta de pedido nunca se cachea: lleva datos de una persona.
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('rechaza un Origin que no es el del panel sin llamar al backend', async () => {
    const response = await POST(request({ origin: 'https://otro.invalid' }), context);

    expect(response.status).toBe(403);
    expect(simulateOrderPayment).not.toHaveBeenCalled();
  });

  it('rechaza la petición sin cookie de sesión', async () => {
    const response = await POST(request({ cookie: false }), context);

    expect(response.status).toBe(401);
    expect(simulateOrderPayment).not.toHaveBeenCalled();
  });

  it.each([
    ['sin evento', { expectedVersion: 3, eventId: VALID_BODY.eventId }],
    [
      'con un evento que no existe',
      { event: 'refunded', expectedVersion: 3, eventId: VALID_BODY.eventId },
    ],
    ['sin expectedVersion', { event: 'approved', eventId: VALID_BODY.eventId }],
    [
      'con expectedVersion cero',
      { event: 'approved', expectedVersion: 0, eventId: VALID_BODY.eventId },
    ],
    ['sin eventId', { event: 'approved', expectedVersion: 3 }],
    ['con un eventId demasiado corto', { event: 'approved', expectedVersion: 3, eventId: 'corto' }],
  ])('rechaza un cuerpo %s sin llamar al backend', async (_case, body) => {
    const response = await POST(request({ body }), context);

    expect(response.status).toBe(400);
    expect(simulateOrderPayment).not.toHaveBeenCalled();
  });

  /*
   * El contrato admite `reasonCode` como código acotado, pero no publica la lista de valores. El
   * panel no la inventa: lo que llegue en ese campo se descarta antes de tocar el backend.
   */
  it('no reenvía un reasonCode libre', async () => {
    simulateOrderPayment.mockResolvedValue({ id: 'ord_abc' });

    await POST(request({ body: { ...VALID_BODY, reasonCode: 'lo-que-sea' } }), context);

    expect(simulateOrderPayment).toHaveBeenCalledWith(MATERIAL, 'ord_abc', VALID_BODY);
  });

  /* Los tres `409` del contrato llegan con códigos distintos porque significan cosas distintas. */
  it.each([
    ['backend_conflict', 'version_conflict'],
    ['backend_payment_transition_invalid', 'payment_transition_invalid'],
    ['backend_payment_conflict', 'payment_conflict'],
  ] as const)('traduce %s a 409 %s', async (failure, code) => {
    simulateOrderPayment.mockRejectedValue(new BackendFailure(failure));

    const response = await POST(request(), context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code });
  });

  /* El simulador apagado no es «ese pedido no existe»: mandaría a buscar un pedido que sí está. */
  it('distingue el simulador deshabilitado de un pedido inexistente', async () => {
    simulateOrderPayment.mockRejectedValue(new BackendFailure('backend_simulator_disabled'));

    const disabled = await POST(request(), context);

    expect(disabled.status).toBe(404);
    await expect(disabled.json()).resolves.toMatchObject({ code: 'simulator_disabled' });

    simulateOrderPayment.mockRejectedValue(new BackendFailure('backend_not_found'));

    const missing = await POST(request(), context);

    await expect(missing.json()).resolves.toMatchObject({ code: 'not_found' });
  });

  it('traduce la falta de permiso a 403 sin decir cuál falta', async () => {
    simulateOrderPayment.mockRejectedValue(new BackendFailure('backend_forbidden'));

    const response = await POST(request(), context);
    const body = (await response.json()) as { code: string; message: string };

    expect(response.status).toBe(403);
    expect(body.code).toBe('admin_role_required');
    expect(body.message).not.toContain('payments.simulate');
  });

  it('no propaga el mensaje del backend en un fallo inesperado', async () => {
    simulateOrderPayment.mockRejectedValue(new Error('backend en https://interno.invalid falló'));

    const response = await POST(request(), context);
    const body = (await response.json()) as { code: string; message: string };

    expect(response.status).toBe(500);
    expect(body.code).toBe('internal_error');
    expect(JSON.stringify(body)).not.toContain('interno.invalid');
  });
});
