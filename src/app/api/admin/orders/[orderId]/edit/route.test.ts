import { NextRequest } from 'next/server';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE_NAME } from '@/features/session/session-cookie';
import { BackendFailure, orderEditFailure } from '@/lib/api/errors';

/**
 * Frontera de «Editar pedido» (ADR 0013).
 *
 * El BFF solo comprueba la forma: cualquier campo fuera del alcance se rechaza **antes** de llamar
 * al backend. Los rechazos del backend llegan al navegador como código estable y, si lo hay, un
 * motivo de una lista cerrada; nunca su texto.
 */

const editOrder = vi.fn();

vi.mock('@/lib/api/orders', () => ({
  editOrder: (...args: unknown[]) => editOrder(...args),
}));

const { POST } = await import('./route');
const { POST: PREVIEW } = await import('./preview/route');

const ALLOWED_ORIGIN = 'https://panel.example.invalid';
const MATERIAL = 'material-de-sesion-opaco';
const context = { params: Promise.resolve({ orderId: 'ord_abc' }) };

function request(body: unknown, path = 'edit'): NextRequest {
  return new NextRequest(`https://panel.example.invalid/api/admin/orders/ord_abc/${path}`, {
    method: 'POST',
    headers: new Headers({
      'content-type': 'application/json',
      origin: ALLOWED_ORIGIN,
      cookie: `${SESSION_COOKIE_NAME}=${MATERIAL}`,
    }),
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.MODULARTESS_ADMIN_ORIGIN = ALLOWED_ORIGIN;
  editOrder.mockReset();
});

afterEach(() => {
  delete process.env.MODULARTESS_ADMIN_ORIGIN;
});

describe('POST /api/admin/orders/[orderId]/edit', () => {
  it('transporta la sesión y solo los campos del contrato', async () => {
    const result = { order: { id: 'ord_abc', version: 5 }, changedFields: ['items'] };

    editOrder.mockResolvedValue(result);

    const body = {
      expectedVersion: 4,
      internalNotes: 'Revisar medidas',
      items: [{ productId: 'prd_1', variantId: 'var_1', quantity: 2 }],
    };
    const response = await POST(request(body), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(result);
    expect(editOrder).toHaveBeenCalledWith(MATERIAL, 'ord_abc', body, { preview: false });
  });

  it('la vista previa usa la misma frontera y no guarda', async () => {
    editOrder.mockResolvedValue({ order: { id: 'ord_abc' }, changedFields: ['status'] });

    await PREVIEW(request({ expectedVersion: 4, status: 'preparing' }, 'edit/preview'), context);

    expect(editOrder).toHaveBeenCalledWith(
      MATERIAL,
      'ord_abc',
      { expectedVersion: 4, status: 'preparing' },
      { preview: true },
    );
  });

  it.each([
    ['un precio en la línea', { items: [{ productId: 'prd_1', quantity: 1, unitPriceCop: 1 }] }],
    ['un total', { totalCop: 1 }],
    ['el cliente', { customer: { fullName: 'Otra' } }],
    ['la dirección', { shippingAddress: { city: 'Cali' } }],
    ['datos de pago', { payment: { status: 'approved' } }],
    ['un identificador', { publicId: 'MZ-OTRO' }],
    ['una cantidad inválida', { items: [{ productId: 'prd_1', quantity: 0 }] }],
    [
      'envío sin estado',
      { shipment: { carrierName: 'X', trackingNumber: '1', trackingUrl: 'https://x.co' } },
    ],
    ['nada que cambiar', {}],
  ])('rechaza %s sin llamar al backend', async (_name, extra) => {
    const response = await POST(request({ expectedVersion: 4, ...extra }), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'invalid_request' });
    expect(editOrder).not.toHaveBeenCalled();
  });

  it('un bloqueo llega como 409 con su motivo, sin texto del backend', async () => {
    editOrder.mockRejectedValue(
      orderEditFailure(409, {
        code: 'order_edit_blocked',
        reason: 'paid_total_changed',
        message: 'texto del backend que no debe viajar',
      }),
    );

    const response = await POST(
      request({ expectedVersion: 4, items: [{ productId: 'prd_1', quantity: 1 }] }),
      context,
    );
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({ code: 'order_edit_blocked', reference: 'paid_total_changed' });
    expect(JSON.stringify(payload)).not.toContain('texto del backend');
  });

  it('un conflicto de versión llega como version_conflict', async () => {
    editOrder.mockRejectedValue(orderEditFailure(409, { code: 'order_version_conflict' }));

    const response = await POST(request({ expectedVersion: 4, internalNotes: 'x' }), context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'version_conflict' });
  });

  it('una línea rechazada por el catálogo llega con su código', async () => {
    editOrder.mockRejectedValue(orderEditFailure(400, { code: 'order_variant_required' }));

    const response = await POST(
      request({ expectedVersion: 4, items: [{ productId: 'prd_1', quantity: 1 }] }),
      context,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'order_line_rejected',
      reference: 'order_variant_required',
    });
  });

  it('un 403 del backend no se disfraza de otra cosa', async () => {
    editOrder.mockRejectedValue(new BackendFailure('backend_forbidden'));

    const response = await POST(
      request({ expectedVersion: 4, items: [{ productId: 'prd_1', quantity: 1 }] }),
      context,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'admin_role_required' });
  });
});
