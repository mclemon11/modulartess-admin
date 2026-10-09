import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { OrderMobileCard } from './order-mobile-card';
import { OrderPaymentAttemptsCard, OrderPaymentCard } from './order-detail-cards';
import { OrdersTable } from './orders-table';
import { compactPaymentSummary, paymentCardSummary, paymentMethodFacts } from './payment-method';

import type {
  AdminOrder,
  AdminOrderListItem,
  AdminPaymentAttempt,
  AdminPaymentMethod,
  AdminPaymentSummary,
} from '@/lib/api/orders';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined, replace: () => undefined }),
}));

/**
 * Proveedor y medio de pago en la ficha y en el listado.
 *
 * Todas las etiquetas de estas pruebas son las que publicaría el backend, y en los datos van a
 * propósito valores que el panel **no** debe enseñar aunque llegaran: si alguno aparece en el HTML,
 * el panel está pintando algo que no le toca.
 */

const WOMPI = { code: 'wompi', label: 'Wompi' } as const;
const SIMULATOR = { code: 'simulator', label: 'Simulador (sin cobro)' } as const;

function card(
  overrides: Partial<NonNullable<AdminPaymentMethod['card']>> = {},
): AdminPaymentMethod {
  return {
    code: 'card',
    providerType: 'CARD',
    label: 'Tarjeta',
    card: {
      brand: 'VISA',
      brandLabel: 'Visa',
      lastFour: '1234',
      cardType: null,
      cardTypeLabel: null,
      installments: 1,
      ...overrides,
    },
  };
}

function method(code: AdminPaymentMethod['code'], providerType: string, label: string) {
  return { code, providerType, label, card: null } as AdminPaymentMethod;
}

function summary(
  paymentMethod: AdminPaymentMethod | null,
  provider: AdminPaymentSummary['provider'] = WOMPI,
): AdminPaymentSummary {
  return { provider, environment: 'production', paymentMethod };
}

function attempt(overrides: Partial<AdminPaymentAttempt> = {}): AdminPaymentAttempt {
  return {
    attemptNumber: 1,
    createdAt: '2026-09-26T10:30:00.000Z',
    environment: 'production',
    expiresAt: '2026-09-26T11:00:00.000Z',
    hasTransactionId: true,
    status: 'approved',
    provider: WOMPI,
    paymentMethod: card(),
    ...overrides,
  };
}

function order(overrides: Partial<AdminOrder> = {}): AdminOrder {
  return {
    id: 'ord_abc',
    publicId: 'MZ-7KQ2R9DA',
    version: 3,
    status: 'paid',
    statusLabel: 'Pagado',
    createdAt: '2026-09-05T15:24:00.000Z',
    updatedAt: '2026-09-05T15:24:00.000Z',
    timeline: [],
    payment: {
      status: 'approved',
      statusLabel: 'Pago confirmado',
      environment: 'live',
      attemptNumber: 1,
      approvedAt: '2026-09-05T15:28:00.000Z',
      approvedAtSource: 'provider_event',
      updatedAt: '2026-09-05T15:28:00.000Z',
    },
    paymentAttempts: [attempt()],
    paymentEvents: [],
    notifications: [],
    paymentEditing: {
      method: 'wompi',
      methodLabel: 'Wompi',
      manual: false,
      methodLocked: null,
      statusLocked: 'payment_status_automatic',
      manualEvents: [],
    },
    paymentSimulationEnabled: false,
    availableSimulationEvents: [],
    paymentSummary: summary(card()),
    ...overrides,
  } as AdminOrder;
}

function row(overrides: Partial<AdminOrderListItem> = {}): AdminOrderListItem {
  return {
    id: 'ord_abc',
    publicId: 'MZ-7KQ2R9DA',
    status: 'paid',
    statusLabel: 'Pagado',
    paymentStatus: 'approved',
    version: 3,
    customerName: 'Ana Pérez',
    itemCount: 1,
    previewLine: { name: 'Tocador Aura', sku: 'TOCADOR', primaryImageUrl: null, quantity: 1 },
    totalCop: 1450000,
    createdAt: '2026-09-05T15:24:00.000Z',
    updatedAt: '2026-09-05T19:30:00.000Z',
    paymentSummary: summary(card()),
    ...overrides,
  } as AdminOrderListItem;
}

const detail = (value: AdminOrder) =>
  renderToStaticMarkup(<OrderPaymentCard now={null} order={value} />) +
  renderToStaticMarkup(<OrderPaymentAttemptsCard now={null} order={value} />);

const list = (value: AdminOrderListItem) =>
  renderToStaticMarkup(<OrdersTable orders={[value]} />) +
  renderToStaticMarkup(<OrderMobileCard order={value} />);

describe('ficha: tarjeta', () => {
  it('muestra proveedor, medio, franquicia, terminación y cuotas', () => {
    const html = detail(order());

    for (const needle of ['Proveedor', 'Wompi', 'Medio de pago', 'Tarjeta', 'Visa', '•••• 1234']) {
      expect(html, needle).toContain(needle);
    }
    expect(html).toContain('Cuotas');
  });

  it('la terminación se lee «terminada en 1234»', () => {
    const html = detail(order());

    expect(html).toContain('<span aria-hidden="true">•••• 1234</span>');
    expect(html).toContain('<span class="sr-only">terminada en 1234</span>');
  });

  /* Wompi no siempre distingue crédito de débito. Sin el dato no se afirma ninguno. */
  it('CARD sin tipo no se llama «tarjeta de crédito»', () => {
    const html = detail(order()).toLowerCase();

    expect(html).not.toContain('crédito');
    expect(html).not.toContain('débito');
    expect(html).not.toContain('tipo de tarjeta');
  });

  it('con el tipo publicado, lo muestra con la etiqueta del backend', () => {
    const credit = card({ cardType: 'credit', cardTypeLabel: 'Crédito' });
    const html = detail(order({ paymentSummary: summary(credit), paymentAttempts: [] }));

    expect(html).toContain('Tipo de tarjeta');
    expect(html).toContain('Crédito');
  });

  it('una tarjeta sin últimos cuatro no enseña una terminación vacía', () => {
    const partial = card({ lastFour: null });
    const html = detail(order({ paymentSummary: summary(partial), paymentAttempts: [] }));

    expect(html).toContain('Visa');
    expect(html).not.toContain('Terminación');
    expect(html).not.toContain('••••');
  });

  it('datos parciales: solo la terminación', () => {
    const partial = card({ brand: null, brandLabel: null, installments: null });
    const facts = paymentMethodFacts(WOMPI, partial).map((fact) => fact.label);

    expect(facts).toEqual(['Medio de pago', 'Terminación']);
  });

  it('una tarjeta sin ningún detalle es solo «Tarjeta»', () => {
    const bare = { ...card(), card: null };

    expect(paymentMethodFacts(WOMPI, bare)).toEqual([{ label: 'Medio de pago', value: 'Tarjeta' }]);
  });
});

describe('ficha: otros medios', () => {
  it.each([
    ['pse', 'PSE', 'PSE'],
    ['nequi', 'NEQUI', 'Nequi'],
    ['daviplata', 'DAVIPLATA', 'Daviplata'],
    ['bancolombia_transfer', 'BANCOLOMBIA_TRANSFER', 'Transferencia Bancolombia'],
    ['bancolombia_collect', 'BANCOLOMBIA_COLLECT', 'Corresponsal Bancolombia'],
    ['bancolombia_qr', 'BANCOLOMBIA_QR', 'QR Bancolombia'],
    ['bancolombia_bnpl', 'BANCOLOMBIA_BNPL', 'Compra ahora, paga después Bancolombia'],
    ['su_plus', 'SU_PLUS', 'SU+ Pay'],
    ['puntos_colombia', 'PCOL', 'Puntos Colombia'],
    ['other', 'NEW_WALLET_2027', 'Otro medio de pago'],
  ] as const)('%s se muestra con su etiqueta y sin detalles de tarjeta', (code, type, label) => {
    const value = method(code, type, label);
    const html = detail(
      order({
        paymentSummary: summary(value),
        paymentAttempts: [attempt({ paymentMethod: value })],
      }),
    );

    expect(html).toContain('Wompi');
    expect(html).toContain(label);
    for (const needle of ['Franquicia', 'Terminación', 'Cuotas', '••••']) {
      expect(html, needle).not.toContain(needle);
    }
    expect(compactPaymentSummary(summary(value)).visible).toBe(`Wompi · ${label}`);
  });
});

describe('ficha: sin medio', () => {
  it('Wompi sin medio informado: «No informado por Wompi»', () => {
    const html = detail(
      order({ paymentSummary: summary(null), paymentAttempts: [attempt({ paymentMethod: null })] }),
    );

    expect(html).toContain('Proveedor');
    expect(html).toContain('Wompi');
    expect(html).toContain('No informado por Wompi');
  });

  /* Un intento anterior al campo llega con `paymentMethod: null` y su transacción. */
  it('un intento antiguo se lee como no informado, sin adivinar', () => {
    const legacy = attempt({ paymentMethod: null });
    const html = renderToStaticMarkup(
      <OrderPaymentAttemptsCard now={null} order={order({ paymentAttempts: [legacy] })} />,
    );

    expect(html).toContain('No informado por Wompi');
    expect(html).not.toContain('Tarjeta');
  });

  it('un checkout sin transacción no dice nada del medio', () => {
    const open = attempt({ status: 'created', hasTransactionId: false, paymentMethod: null });
    const html = renderToStaticMarkup(
      <OrderPaymentAttemptsCard now={null} order={order({ paymentAttempts: [open] })} />,
    );

    expect(html).toContain('Wompi');
    expect(html).not.toContain('Medio de pago');
  });

  it('sin resumen y sin intentos no hay proveedor que mostrar', () => {
    const html = renderToStaticMarkup(
      <OrderPaymentCard now={null} order={order({ paymentSummary: null, paymentAttempts: [] })} />,
    );

    expect(html).not.toContain('Proveedor');
    expect(html).not.toContain('Medio de pago');
  });

  it('sin pago aprobado usa el intento más reciente con transacción', () => {
    const declined = attempt({ status: 'declined', paymentMethod: method('pse', 'PSE', 'PSE') });

    expect(paymentCardSummary(null, [declined])).toEqual({
      provider: WOMPI,
      method: method('pse', 'PSE', 'PSE'),
    });
    expect(paymentCardSummary(null, [attempt({ hasTransactionId: false })])).toBeNull();
  });
});

describe('simulación', () => {
  it('un pago simulado no dice Wompi en la ficha ni en el listado', () => {
    const simulated = summary(null, SIMULATOR);
    const html =
      detail(order({ paymentSummary: simulated, paymentAttempts: [] })) +
      list(row({ paymentSummary: simulated }));

    expect(html).toContain('Simulador (sin cobro)');
    expect(html).not.toContain('Wompi');
  });
});

describe('listado', () => {
  it.each([
    [summary(card()), 'Wompi · Visa •••• 1234'],
    [summary(method('pse', 'PSE', 'PSE')), 'Wompi · PSE'],
    [summary(method('nequi', 'NEQUI', 'Nequi')), 'Wompi · Nequi'],
    [summary(null), 'Wompi · Medio no informado'],
    [summary(card({ lastFour: null })), 'Wompi · Visa'],
    [summary(card({ brand: null, brandLabel: null })), 'Wompi · Tarjeta •••• 1234'],
  ])('resume %# como «%s»', (value, expected) => {
    expect(compactPaymentSummary(value).visible).toBe(expected);
    expect(list(row({ paymentSummary: value }))).toContain(expected);
  });

  it('la columna tiene cabecera y el lector oye la frase sin la máscara', () => {
    const html = renderToStaticMarkup(<OrdersTable orders={[row()]} />);

    expect(html).toContain('<th scope="col">Medio de pago</th>');
    expect(html).toContain('Wompi, Visa terminada en 1234');
  });

  it('sin pago aprobado la celda lo dice sin un hueco', () => {
    const html = renderToStaticMarkup(
      <OrdersTable orders={[row({ paymentSummary: null, paymentStatus: 'pending' })]} />,
    );

    expect(html).toContain('Sin pago aprobado');
  });

  /* Responsive: en móvil el medio va dentro de la tarjeta, con su etiqueta de texto. */
  it('en móvil el medio va dentro de la tarjeta y se omite sin pago aprobado', () => {
    const withSummary = renderToStaticMarkup(<OrderMobileCard order={row()} />);
    const without = renderToStaticMarkup(<OrderMobileCard order={row({ paymentSummary: null })} />);

    expect(withSummary).toContain('Medio de pago');
    expect(withSummary).toContain('Wompi · Visa •••• 1234');
    expect(without).not.toContain('Medio de pago');
  });

  it('los nombres largos se parten en lugar de desbordar', () => {
    const css = readFileSync('src/features/panel/orders.module.css', 'utf8');
    const rule = /\.paymentSummary \{[^}]*\}/.exec(css)?.[0] ?? '';

    expect(rule).toContain('overflow-wrap: anywhere');
    expect(css).toMatch(/\.paymentSummaryCell \{[^}]*max-width/);
    expect(css).toMatch(/\.orderCardPayment \{[^}]*flex-wrap: wrap/);
  });
});

/*
 * Barrido: aunque la respuesta trajera un número completo, un token, un teléfono, un documento o el
 * payload del proveedor —el contrato no los publica—, el panel no los pinta.
 */
describe('barrido de datos sensibles', () => {
  const LEAKS = {
    pan: '4242424242424242',
    token: 'tok_prod_ABCDEF123456',
    phone: '3991111111',
    document: '1999888777',
    payload: 'payment_method_type',
    email: 'payer@example.com',
  };

  it('no enseña nada que no sea del resumen', () => {
    const leaky = {
      ...card(),
      number: LEAKS.pan,
      token: LEAKS.token,
      phone_number: LEAKS.phone,
      user_legal_id: LEAKS.document,
      raw: { payment_method_type: 'CARD', customer_email: LEAKS.email },
      card: { ...card().card, bin: '424242', number: LEAKS.pan },
    } as unknown as AdminPaymentMethod;
    const leakySummary = { ...summary(leaky), payload: LEAKS } as unknown as AdminPaymentSummary;
    const html =
      detail(
        order({
          paymentSummary: leakySummary,
          paymentAttempts: [attempt({ paymentMethod: leaky })],
        }),
      ) + list(row({ paymentSummary: leakySummary }));

    for (const [name, value] of Object.entries(LEAKS)) {
      expect(html, name).not.toContain(value);
    }
    expect(html).not.toContain('424242');
  });

  it('el código del medio no escribe nada en logs, almacenamiento ni analítica', () => {
    const source = ['payment-method.ts', 'order-payment-summary.tsx']
      .map((file) => readFileSync(`src/features/panel/${file}`, 'utf8'))
      .join('\n');

    for (const needle of ['console.', 'localStorage', 'sessionStorage', 'gtag', 'dataLayer']) {
      expect(source, needle).not.toContain(needle);
    }
  });
});

/* Pago manual (ADR 0028 del backend): sin checkout, sin intentos y sin medio informado por un proveedor. */
describe('pago manual', () => {
  const MANUAL = { code: 'manual', label: 'Pago manual' } as const;
  const CASH = {
    method: 'cash',
    methodLabel: 'Efectivo',
    manual: true,
    methodLocked: 'payment_not_pending',
    statusLocked: 'payment_settled',
    manualEvents: [],
    reconciliation: {
      locked: 'reconciliation_payment_settled',
      statuses: [],
      methods: [],
      noteRequired: false,
      externalPaymentIdRequiredFor: ['paid'],
      providerAttemptPreserved: false,
    },
  } as AdminOrder['paymentEditing'];

  it('confirmado a mano: dice que está pagado y con qué medio, nunca «Pago no iniciado»', () => {
    const html = detail(
      order({
        payment: { ...order().payment, status: 'approved', statusLabel: 'Pagado' },
        paymentEditing: CASH,
        paymentSummary: summary(null, MANUAL),
        paymentAttempts: [],
      }),
    );

    expect(html).toContain('Pagado por Efectivo');
    expect(html).toContain('Confirmado manualmente desde el panel.');
    expect(html).toContain('Efectivo');
    expect(html).not.toContain('Pago no iniciado');
    expect(html).not.toContain('No informado');
    expect(html).not.toContain('Wompi');
  });

  it('pendiente con un medio manual: explica que la tienda no ofrece pago en línea', () => {
    const html = detail(
      order({
        payment: {
          ...order().payment,
          status: 'pending',
          statusLabel: 'Pendiente',
          approvedAt: null,
        },
        paymentEditing: {
          ...CASH,
          method: 'bank_transfer',
          methodLabel: 'Transferencia bancaria',
          methodLocked: null,
          statusLocked: null,
          manualEvents: ['processing', 'approved', 'voided'],
        },
        paymentSummary: null,
        paymentAttempts: [],
      }),
    );

    expect(html).toContain('Pago por Transferencia bancaria: pendiente');
    expect(html).toContain('La tienda no ofrece pago en línea para este pedido.');
  });

  it('en el listado se lee «Pago manual», sin «Medio no informado»', () => {
    expect(compactPaymentSummary(summary(null, MANUAL))).toEqual({
      visible: 'Pago manual',
      spoken: 'Pago con Pago manual',
    });
    expect(paymentMethodFacts(MANUAL, null)).toEqual([]);
  });
});
