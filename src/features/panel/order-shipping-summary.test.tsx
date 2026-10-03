import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { OrderSummaryCard, shippingAmountLabel } from './order-detail-cards';
import { RATE_TYPE_HINTS, RATE_TYPES } from '@/features/shipping/shipping-labels';

import type { AdminOrder } from '@/lib/api/orders';

/**
 * El envío en el resumen del pedido: gratis, con tarifa, pendiente de cotización y pedidos sin
 * cotización. Un manual cobra $ 0 de envío, pero nunca se presenta como gratis ni como $ 0.
 */
type Shipping = NonNullable<AdminOrder['shipping']>;

function shipping(overrides: Partial<Shipping>): Shipping {
  return {
    pricingStatus: 'free',
    label: 'Envío gratis',
    amountCop: 0,
    includedInPayment: true,
    reason: null,
    municipalityCode: '05001',
    municipalityName: 'MEDELLÍN',
    departmentName: 'ANTIOQUIA',
    quoteId: 'shq2_x',
    quotedAt: '2026-10-03T12:00:00.000Z',
    rulesetRevision: 4,
    applied: [],
    ...overrides,
  };
}

function order(overrides: Partial<AdminOrder>): AdminOrder {
  return {
    id: 'ord_abc',
    publicId: 'MZ-7KQ2R9DA',
    createdAt: '2026-10-03T12:00:00.000Z',
    subtotalCop: 1_200_000,
    shippingCop: 0,
    totalCop: 1_200_000,
    shippingPricingStatus: null,
    shipping: null,
    ...overrides,
  } as AdminOrder;
}

const manual = order({
  shippingPricingStatus: 'pending_manual_quote',
  shipping: shipping({
    pricingStatus: 'pending_manual_quote',
    label: 'Envío pendiente de cotización',
    amountCop: null,
    includedInPayment: false,
    reason: 'manual_quote_rule',
    municipalityCode: '91001',
    municipalityName: 'LETICIA',
    departmentName: 'AMAZONAS',
    applied: [
      {
        zoneId: 'shz_2',
        zoneName: 'Resto de Colombia — cotización posterior',
        zoneVersion: 2,
        ruleId: 'shr_2',
        ruleName: 'Cotización posterior',
        ruleVersion: 1,
        rateType: 'manual_quote',
        outcome: 'manual_quote',
        costCop: null,
        lineIndexes: [0],
      },
    ],
  }),
});

describe('envío en el resumen del pedido', () => {
  it('gratis dice «Envío gratis» y nada de cotizar ni contactar', () => {
    const free = order({ shippingPricingStatus: 'free', shipping: shipping({}) });
    const html = renderToStaticMarkup(<OrderSummaryCard order={free} />);
    expect(shippingAmountLabel(free)).toBe('Envío gratis');
    expect(html).toContain('Envío gratis');
    expect(html).not.toMatch(/contactar|cotiza|pendiente/i);
  });

  it('con tarifa muestra el valor', () => {
    const priced = order({
      shippingCop: 25_000,
      totalCop: 1_225_000,
      shippingPricingStatus: 'priced',
      shipping: shipping({ pricingStatus: 'priced', label: '$ 25.000', amountCop: 25_000 }),
    });
    expect(shippingAmountLabel(priced)).toMatch(/25\.000/);
    expect(renderToStaticMarkup(<OrderSummaryCard order={priced} />)).not.toContain('Envío gratis');
  });

  it('manual dice «Envío pendiente de cotización», explica qué hacer y nunca $ 0 ni gratis', () => {
    const html = renderToStaticMarkup(<OrderSummaryCard order={manual} />);
    expect(shippingAmountLabel(manual)).toBe('Envío pendiente de cotización');
    expect(html).toContain('Envío pendiente de cotización');
    expect(html).toContain('El envío no se incluyó en el pago');
    expect(html).toContain('LETICIA');
    expect(html).toContain('Resto de Colombia — cotización posterior · Cotización posterior');
    expect(html).not.toContain('Envío gratis');
    // La fila del envío no muestra un importe: «$ 0» sería leerlo como gratis.
    const shippingRow = html.slice(html.indexOf('>Envío<'), html.indexOf('>Total<'));
    expect(shippingRow).not.toMatch(/\$\s*0\b/);
  });

  it('un pedido sin cotización conserva su importe y no se lee como gratis', () => {
    const legacy = order({});
    const html = renderToStaticMarkup(<OrderSummaryCard order={legacy} />);
    expect(html).toContain('Pedido creado sin cotización de envío');
    expect(html).not.toContain('Envío gratis');
    expect(html).not.toContain('pendiente de cotización');
  });
});

describe('gestor de zonas', () => {
  it('conserva la cotización manual como tipo seleccionable y explica su efecto', () => {
    expect(RATE_TYPES).toContain('manual_quote');
    expect(RATE_TYPE_HINTS.manual_quote).toBe(
      'Permite confirmar el pedido sin incluir el envío en el pago. El equipo debe contactar al cliente para cotizarlo.',
    );
  });
});
