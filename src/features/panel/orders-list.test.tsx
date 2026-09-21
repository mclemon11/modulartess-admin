import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { OrderMobileCard } from './order-mobile-card';
import { OrdersTable } from './orders-table';

import type { AdminOrderSummary } from '@/lib/api/orders';

/**
 * El listado de pedidos, comprobado sobre el HTML que React produce de verdad.
 *
 * Las dos lecturas del pedido —el pago y el trabajo— viajan en el resumen, así que la lista las
 * pinta sin abrir ni un pedido. Lo que se comprueba aquí es que no se confundan: el texto del
 * estado es el que manda el backend, el del pago sale del mapa cerrado del panel, y en móvil no se
 * pierde ninguno de los dos.
 */

function summary(overrides: Partial<AdminOrderSummary> = {}): AdminOrderSummary {
  return {
    id: 'ord_abc',
    publicId: 'MZ-7KQ2R9DA',
    status: 'preparing',
    statusLabel: 'Etiqueta que manda el backend',
    paymentStatus: 'approved',
    version: 3,
    customerName: 'Ana Pérez',
    itemCount: 2,
    previewLine: {
      name: 'Tocador Aura',
      sku: 'TOCADOR-AURA-80-ROBLE',
      primaryImageUrl: null,
      quantity: 2,
    },
    totalCop: 1450000,
    createdAt: '2026-09-05T15:24:00.000Z',
    updatedAt: '2026-09-05T19:30:00.000Z',
    ...overrides,
  } as AdminOrderSummary;
}

function table(orders: readonly AdminOrderSummary[]): string {
  return renderToStaticMarkup(<OrdersTable orders={orders} />);
}

describe('columnas', () => {
  it('Pago y Estado son dos columnas distintas', () => {
    const html = table([summary()]);

    expect(html).toContain('<th scope="col">Pago</th>');
    expect(html).toContain('<th scope="col">Estado</th>');
  });

  /* El texto del estado del pedido es autoritativo: el panel no lo reescribe. */
  it('el estado del pedido se pinta con la etiqueta del backend', () => {
    expect(table([summary()])).toContain('Etiqueta que manda el backend');
  });

  /*
   * El resumen publica `paymentStatus` sin etiqueta, así que el pago sí lo nombra el panel. Es lo
   * que evita pedir la ficha de cada pedido para rellenar una columna.
   */
  it.each([
    ['pending', 'Pendiente'],
    ['processing', 'Procesando'],
    ['approved', 'Pagado'],
    ['declined', 'Rechazado'],
    ['expired', 'Vencido'],
    ['error', 'Error técnico'],
  ])('un pago %s se lee «%s»', (paymentStatus, label) => {
    expect(table([summary({ paymentStatus } as Partial<AdminOrderSummary>)])).toContain(label);
  });

  /* El color nunca es el único portador: las dos pastillas llevan su texto. */
  it('los dos estados se distinguen sin depender del color', () => {
    const html = table([
      summary({
        paymentStatus: 'declined',
        statusLabel: 'Pendiente de pago',
      } as Partial<AdminOrderSummary>),
    ]);

    expect(html).toContain('Rechazado');
    expect(html).toContain('Pendiente de pago');
  });
});

describe('tarjeta de móvil', () => {
  it('conserva los dos estados y el resto de la fila', () => {
    const html = renderToStaticMarkup(<OrderMobileCard order={summary()} />);

    for (const needle of [
      'MZ-7KQ2R9DA',
      'Ana Pérez',
      'Tocador Aura',
      'Pagado',
      'Etiqueta que manda el backend',
      'y 1 producto más',
    ]) {
      expect(html, needle).toContain(needle);
    }
  });
});

describe('lo que la lista no afirma', () => {
  it('no inventa un método de pago', () => {
    const html = table([summary()]) + renderToStaticMarkup(<OrderMobileCard order={summary()} />);

    for (const needle of ['Visa', 'Tarjeta', 'Método de pago', 'Transferencia']) {
      expect(html, needle).not.toContain(needle);
    }
  });

  /*
   * Si el backend añadiera un estado de pago, la fila sigue siendo legible mientras el panel se
   * pone al día. El valor se fuerza a través de `unknown` porque el tipo generado —correctamente—
   * no lo admite: la prueba describe un contrato futuro, no uno vigente.
   */
  it('un estado de pago que el panel no conoce no rompe la fila', () => {
    const unpublished = { ...summary(), paymentStatus: 'refunded' } as unknown as AdminOrderSummary;

    expect(table([unpublished])).toContain('refunded');
  });
});
