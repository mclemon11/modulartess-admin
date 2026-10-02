import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { OrderInvoiceCard } from './order-detail-cards';

import type { AdminOrder } from '@/lib/api/orders';

/**
 * Tarjeta «Facturación electrónica» de la ficha del pedido. Datos ficticios.
 *
 * Los datos fiscales son distintos de los de contacto para que una fuga al listado se vea.
 */

type Invoice = AdminOrder['electronicInvoice'];

const NOT_RECORDED: Invoice = {
  status: 'not_recorded',
  statusLabel: 'Sin información fiscal registrada',
  buyer: null,
};
const FINAL_CONSUMER: Invoice = {
  status: 'final_consumer',
  statusLabel: 'Consumidor final',
  buyer: null,
};
const BUYER: Invoice = {
  status: 'buyer',
  statusLabel: 'Datos del adquirente',
  buyer: {
    buyerName: 'Muebles Ejemplo SAS',
    identificationType: '31',
    identificationTypeLabel: 'NIT',
    identificationNumber: '0900123456',
    billingEmail: 'facturas@empresa-ejemplo.test',
  },
};

function order(electronicInvoice: Invoice | undefined): AdminOrder {
  return {
    id: 'ord_ficticio',
    publicId: 'MZ-FICTICIO',
    customer: { fullName: 'Persona Ficticia', email: 'ficticia@example.test', phone: '3000000000' },
    ...(electronicInvoice === undefined ? {} : { electronicInvoice }),
  } as AdminOrder;
}

const NOTE =
  'Estos son los datos suministrados por el cliente. La emisión y validación de la factura electrónica todavía se realiza mediante el proceso externo de facturación.';

const render = (invoice: Invoice | undefined) =>
  renderToStaticMarkup(<OrderInvoiceCard order={order(invoice)} />);

describe('tres estados', () => {
  it('pedido antiguo: sin información fiscal, sin presumir consumidor final', () => {
    const html = render(NOT_RECORDED);
    expect(html).toContain('Facturación electrónica');
    expect(html).toContain('Sin información fiscal registrada');
    expect(html).toContain('anterior a la captura de datos de facturación');
    expect(html).not.toContain('Consumidor final');
  });

  it('consumidor final', () => {
    const html = render(FINAL_CONSUMER);
    expect(html).toContain('Consumidor final');
    expect(html).not.toContain('Número de documento');
    expect(html).toContain(NOTE);
  });

  it('datos del adquirente: nombre, tipo, número y correo', () => {
    const html = render(BUYER);
    for (const text of [
      'Nombre o razón social',
      'Muebles Ejemplo SAS',
      'Tipo de documento',
      'NIT (31)',
      'Número de documento',
      // El número llega como texto y se pinta tal cual, con su cero inicial.
      '0900123456',
      'Correo de facturación',
      'facturas@empresa-ejemplo.test',
    ]) {
      expect(html, text).toContain(text);
    }
  });

  it('la nota del equipo acompaña a los datos y no afirma ninguna integración', () => {
    for (const invoice of [FINAL_CONSUMER, BUYER]) {
      const html = render(invoice);
      expect(html).toContain(NOTE);
      expect(html).not.toMatch(/automátic|enviad[ao] a la DIAN|validada por la DIAN|integrad/i);
    }
    // En un pedido sin datos no hay «datos suministrados» de los que hablar.
    expect(render(NOT_RECORDED)).not.toContain(NOTE);
  });

  it('con un backend anterior al campo no se pinta nada', () => {
    expect(render(undefined)).toBe('');
  });
});

describe('solo lectura', () => {
  it.each([NOT_RECORDED, FINAL_CONSUMER, BUYER])(
    'sin controles de edición ($status)',
    (invoice) => {
      const html = render(invoice);
      expect(html).not.toMatch(/<(input|button|select|textarea|form)\b/);
    },
  );
});

describe('fuera de la ficha no aparecen', () => {
  it.each([
    'src/features/panel/orders-table.tsx',
    'src/features/panel/order-mobile-card.tsx',
    'src/features/panel/orders-client.ts',
    'src/features/panel/dashboard-recent-orders.tsx',
    'src/app/panel/pedidos/page.tsx',
  ])('%s no lee los datos fiscales', (file) => {
    expect(codeOf(file)).not.toMatch(
      /electronicInvoice|buyerName|identificationNumber|billingEmail/,
    );
  });

  it('el contrato del listado no los publica', () => {
    const contract = JSON.parse(readFileSync('openapi/backend-v1.json', 'utf8')) as {
      components: { schemas: Record<string, unknown> };
    };
    for (const name of ['AdminOrderSummaryDto', 'AdminOrderListItemDto', 'AdminOrderPageDto']) {
      expect(JSON.stringify(contract.components.schemas[name] ?? {}), name).not.toMatch(
        /electronicInvoice|buyerName|identificationNumber|billingEmail/,
      );
    }
  });

  it('la tarjeta no registra nada ni manda los datos a ningún sitio', () => {
    const source = codeOf('src/features/panel/order-detail-cards.tsx');
    expect(source).not.toMatch(/console\.|localStorage|sessionStorage|fetch\(/);
  });
});

describe('permisos', () => {
  it('la ficha se lee con la misma operación que exige orders.read', () => {
    const page = codeOf('src/app/panel/pedidos/[orderId]/page.tsx');
    expect(page).toContain('getOrder(session.session.sessionMaterial, orderId)');
  });
});

/** Código sin comentarios: se buscan usos, no menciones en prosa. */
function codeOf(path: string) {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}
