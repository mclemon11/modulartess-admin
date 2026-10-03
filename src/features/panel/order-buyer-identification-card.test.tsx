import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  OrderAddressCard,
  OrderBuyerIdentificationCard,
  OrderInvoiceCard,
} from './order-detail-cards';

import type { AdminOrder } from '@/lib/api/orders';

/**
 * Tarjeta «Identificación del comprador» y país de la dirección. Datos ficticios.
 *
 * El documento del pagador es distinto del NIT de la factura para que una mezcla se vea.
 */

type Identification = AdminOrder['buyerIdentification'];
type Address = AdminOrder['shippingAddress'];

const NOT_RECORDED: Identification = {
  status: 'not_recorded',
  statusLabel: 'Identificación no registrada',
  document: null,
};
const RECORDED: Identification = {
  status: 'recorded',
  statusLabel: 'Identificación registrada',
  document: {
    identificationType: '13',
    identificationTypeLabel: 'Cédula de ciudadanía',
    identificationNumber: '0012345678',
  },
};
const COMPANY_INVOICE: AdminOrder['electronicInvoice'] = {
  status: 'buyer',
  statusLabel: 'Datos del adquirente',
  buyer: {
    buyerName: 'Muebles Ejemplo SAS',
    identificationType: '31',
    identificationTypeLabel: 'NIT',
    identificationNumber: '900123456',
    billingEmail: 'facturas@empresa-ejemplo.test',
  },
};

const BASE_ADDRESS: Address = {
  department: 'Antioquia',
  city: 'Medellín',
  addressLine: 'Calle 10 #43-20',
  instructions: null,
  country: null,
  countryName: null,
};

function order(overrides: Partial<AdminOrder>): AdminOrder {
  return {
    id: 'ord_ficticio',
    publicId: 'MZ-FICTICIO',
    customer: { fullName: 'Persona Ficticia', email: 'ficticia@example.test', phone: '3000000000' },
    shippingAddress: BASE_ADDRESS,
    ...overrides,
  } as AdminOrder;
}

const renderIdentity = (buyerIdentification: Identification | undefined) =>
  renderToStaticMarkup(
    <OrderBuyerIdentificationCard
      order={order(buyerIdentification === undefined ? {} : { buyerIdentification })}
    />,
  );

describe('identificación del comprador', () => {
  it('pedido antiguo: «Identificación no registrada», el texto del backend', () => {
    const html = renderIdentity(NOT_RECORDED);
    expect(html).toContain('Identificación del comprador');
    expect(html).toContain('Identificación no registrada');
    expect(html).not.toContain('Número de documento');
  });

  it('registrada: tipo y número, con los ceros iniciales', () => {
    const html = renderIdentity(RECORDED);
    expect(html).toContain('Cédula de ciudadanía (13)');
    expect(html).toContain('Número de documento');
    expect(html).toContain('0012345678');
  });

  it('con un backend anterior al campo no se pinta nada', () => {
    expect(renderIdentity(undefined)).toBe('');
  });

  it.each([NOT_RECORDED, RECORDED])('sin controles de edición ($status)', (identification) => {
    expect(renderIdentity(identification)).not.toMatch(/<(input|button|select|textarea|form)\b/);
  });

  it('es independiente de la factura: cada tarjeta enseña su documento', () => {
    const both = order({ buyerIdentification: RECORDED, electronicInvoice: COMPANY_INVOICE });
    const identity = renderToStaticMarkup(<OrderBuyerIdentificationCard order={both} />);
    const invoice = renderToStaticMarkup(<OrderInvoiceCard order={both} />);
    expect(identity).toContain('0012345678');
    expect(identity).not.toContain('900123456');
    expect(invoice).toContain('900123456');
    expect(invoice).not.toContain('0012345678');
  });
});

describe('país de la dirección', () => {
  const renderAddress = (shippingAddress: Address) =>
    renderToStaticMarkup(<OrderAddressCard order={order({ shippingAddress })} />);

  it('pedido nuevo: «País: Colombia»', () => {
    const html = renderAddress({ ...BASE_ADDRESS, country: 'CO', countryName: 'Colombia' });
    expect(html).toContain('País');
    expect(html).toContain('Colombia');
  });

  it('pedido antiguo: la tarjeta se ve exactamente como antes, sin fila de país', () => {
    const html = renderAddress(BASE_ADDRESS);
    expect(html).not.toContain('País');
    expect(html).not.toContain('Colombia');
  });

  it('sin controles para cambiarlo', () => {
    const html = renderAddress({ ...BASE_ADDRESS, country: 'CO', countryName: 'Colombia' });
    expect(html).not.toMatch(/<(input|button|select|textarea|form)\b/);
  });
});

describe('fuera de la ficha no aparece', () => {
  it.each([
    'src/features/panel/orders-table.tsx',
    'src/features/panel/order-mobile-card.tsx',
    'src/features/panel/orders-client.ts',
    'src/features/panel/dashboard-recent-orders.tsx',
    'src/app/panel/pedidos/page.tsx',
  ])('%s no lee la identificación', (file) => {
    expect(codeOf(file)).not.toMatch(/buyerIdentification|identificationNumber/);
  });

  it('el contrato del listado no la publica', () => {
    const contract = JSON.parse(readFileSync('openapi/backend-v1.json', 'utf8')) as {
      components: { schemas: Record<string, unknown> };
    };
    for (const name of ['AdminOrderSummaryDto', 'AdminOrderListItemDto', 'AdminOrderPageDto']) {
      expect(JSON.stringify(contract.components.schemas[name] ?? {}), name).not.toMatch(
        /buyerIdentification|identificationNumber/,
      );
    }
  });
});

/** Código sin comentarios: se buscan usos, no menciones en prosa. */
function codeOf(path: string) {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}
