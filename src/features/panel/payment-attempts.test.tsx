import { readFileSync } from 'node:fs';

import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OrderPaymentAttemptsCard, OrderPaymentCard } from './order-detail-cards';
import { OrderDetailView } from './order-detail-view';
import { attemptKey, presentAttempt, presentCheckoutState } from './payment-attempts';
import { getServerSnapshot, getSnapshot, subscribe } from './use-now';

import type { AdminOrder, AdminPaymentAttempt, OrderPayment } from '@/lib/api/orders';

// La ficha monta la barra de acciones, que pide el router de la App. Aquí no se navega.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined, replace: () => undefined }),
}));

/**
 * Intentos de pago: presentación con un reloj **fijo**.
 *
 * Todos los valores son ficticios. Los tres pedidos auditados solo aportan su identificador público
 * y la forma de su respuesta; ni datos personales ni importes reales.
 */

const NOW = Date.parse('2026-09-26T12:00:00.000Z');
const BEFORE = '2026-09-26T11:00:00.000Z';
const AFTER = '2026-09-26T13:00:00.000Z';

function attempt(overrides: Partial<AdminPaymentAttempt> = {}): AdminPaymentAttempt {
  return {
    attemptNumber: 1,
    createdAt: '2026-09-26T10:30:00.000Z',
    environment: 'production',
    expiresAt: AFTER,
    hasTransactionId: false,
    status: 'created',
    ...overrides,
  };
}

function payment(overrides: Partial<OrderPayment> = {}): OrderPayment {
  return {
    status: 'pending',
    statusLabel: 'Pago pendiente',
    environment: 'live',
    attemptNumber: 1,
    approvedAt: null,
    approvedAtSource: null,
    updatedAt: '2026-09-26T10:30:00.000Z',
    ...overrides,
  };
}

function order(overrides: Partial<AdminOrder> = {}): AdminOrder {
  return {
    id: 'ord_ficticio',
    publicId: 'MZ-FICTICIO',
    version: 1,
    status: 'pending_payment',
    statusLabel: 'Pendiente de pago',
    createdAt: '2026-09-26T10:00:00.000Z',
    updatedAt: '2026-09-26T10:30:00.000Z',
    timeline: [],
    items: [],
    customer: { fullName: 'Persona Ficticia', email: 'ficticia@example.test', phone: '3000000000' },
    shippingAddress: {
      addressLine: 'Calle Ficticia 1',
      city: 'Ciudad',
      department: 'Departamento',
      instructions: null,
    },
    subtotalCop: 1000,
    shippingCop: 0,
    totalCop: 1000,
    payment: payment(),
    paymentAttempts: [],
    paymentEvents: [],
    notifications: [],
    paymentSimulationEnabled: false,
    availableSimulationEvents: [],
    ...overrides,
  } as AdminOrder;
}

function card(value: AdminOrder, now: number | null = NOW): string {
  return renderToStaticMarkup(<OrderPaymentCard now={now} order={value} />);
}

function history(value: AdminOrder, now: number | null = NOW): string {
  return renderToStaticMarkup(<OrderPaymentAttemptsCard now={now} order={value} />);
}

describe('estado efectivo del intento', () => {
  it('sin intentos: Pago no iniciado', () => {
    expect(presentCheckoutState([], 'pending', NOW).title).toBe('Pago no iniciado');
  });

  it('created vigente: Checkout abierto', () => {
    const state = presentCheckoutState([attempt({ expiresAt: AFTER })], 'pending', NOW);

    expect(state.title).toBe('Checkout abierto');
    expect(state.text).toBe(
      'El enlace de pago sigue vigente; todavía no existe una transacción en Wompi.',
    );
  });

  it('created vencido: Checkout vencido, aunque el backend conserve created', () => {
    const state = presentCheckoutState([attempt({ expiresAt: BEFORE })], 'pending', NOW);

    expect(state.title).toBe('Checkout vencido');
    expect(state.text).toBe(
      'El checkout venció antes de que Wompi creara una transacción. El cliente puede reintentar sobre el mismo pedido.',
    );
  });

  it('el vencimiento es inclusivo: expiresAt igual a ahora ya venció', () => {
    const exact = new Date(NOW).toISOString();

    expect(presentAttempt(attempt({ expiresAt: exact }), NOW).title).toBe('Checkout vencido');
  });

  it('expired: Checkout vencido', () => {
    expect(
      presentCheckoutState([attempt({ status: 'expired', expiresAt: BEFORE })], 'pending', NOW)
        .title,
    ).toBe('Checkout vencido');
  });

  it('processing: Transacción pendiente', () => {
    expect(presentCheckoutState([attempt({ status: 'processing' })], 'processing', NOW).title).toBe(
      'Transacción pendiente',
    );
  });

  it('hasTransactionId=true sin estado final: Transacción pendiente, aunque el enlace venciera', () => {
    expect(
      presentCheckoutState(
        [attempt({ status: 'created', hasTransactionId: true, expiresAt: BEFORE })],
        'pending',
        NOW,
      ).title,
    ).toBe('Transacción pendiente');
  });

  it.each([
    ['declined', 'Pago rechazado'],
    ['voided', 'Pago anulado'],
    ['error', 'Error de pago'],
  ] as const)('%s: %s', (status, title) => {
    expect(presentCheckoutState([attempt({ status })], 'pending', NOW).title).toBe(title);
  });

  it('approved coherente con payment.status: Pagado', () => {
    const state = presentCheckoutState([attempt({ status: 'approved' })], 'approved', NOW);

    expect(state.title).toBe('Pagado');
    expect(state.inconsistent).toBe(false);
  });

  it('approved con el pago sin aprobar: alerta visible, no pagado', () => {
    const html = card(
      order({ paymentAttempts: [attempt({ status: 'approved', hasTransactionId: true })] }),
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('Inconsistencia de pago');
    expect(html).not.toContain('>Pagado<');
  });

  it('usa el intento más reciente, que el contrato entrega primero', () => {
    const state = presentCheckoutState(
      [attempt({ status: 'declined' }), attempt({ status: 'approved' })],
      'pending',
      NOW,
    );

    expect(state.title).toBe('Pago rechazado');
  });

  it('sin reloj no adivina el vencimiento', () => {
    expect(presentAttempt(attempt({ expiresAt: BEFORE }), null).title).toBe(
      'Checkout sin transacción',
    );
    expect(presentAttempt(attempt({ expiresAt: AFTER }), null).title).toBe(
      'Checkout sin transacción',
    );
  });
});

describe('información de pago', () => {
  it('live se presenta como Producción', () => {
    expect(card(order())).toContain('Producción');
    expect(card(order())).not.toContain('Pruebas (sandbox)');
  });

  it('sandbox se presenta como Pruebas (sandbox)', () => {
    expect(card(order({ payment: payment({ environment: 'sandbox' }) }))).toContain(
      'Pruebas (sandbox)',
    );
  });

  /* «Simulación» sale de paymentSimulationEnabled y de nada más: ni del entorno ni de los intentos. */
  it.each([
    ['sandbox', false, false],
    ['live', false, false],
    ['sandbox', true, true],
    ['live', true, true],
  ] as const)('entorno %s con simulación %s → etiqueta %s', (environment, enabled, shown) => {
    const html = card(
      order({
        payment: payment({ environment }),
        paymentSimulationEnabled: enabled,
        paymentAttempts: [attempt({ environment: 'sandbox' })],
      }),
    );

    expect(html.includes('Simulación')).toBe(shown);
  });

  it('el recuento usa paymentAttempts.length, no payment.attemptNumber', () => {
    const html = card(
      order({
        payment: payment({ attemptNumber: 7 }),
        paymentAttempts: [attempt(), attempt({ status: 'expired' })],
      }),
    );

    expect(html).toMatch(/Intentos de pago<\/dt><dd[^>]*>2</);
    expect(html).not.toMatch(/Intentos de pago<\/dt><dd[^>]*>7</);
  });

  it('con intentos no dice que no se ha iniciado ninguno', () => {
    const html = card(
      order({ payment: payment({ attemptNumber: 0 }), paymentAttempts: [attempt()] }),
    );

    expect(html).not.toContain('Todavía no se ha iniciado un intento');
  });

  it('sin intentos: Pago no iniciado y Ninguno', () => {
    const html = card(order({ payment: payment({ attemptNumber: 0 }) }));

    expect(html).toContain('Pago no iniciado');
    expect(html).toMatch(/Intentos de pago<\/dt><dd[^>]*>Ninguno</);
  });
});

describe('historial de intentos', () => {
  it('respeta el orden del contrato', () => {
    const html = history(
      order({
        paymentAttempts: [
          attempt({ status: 'declined', createdAt: '2026-09-26T11:30:00.000Z' }),
          attempt({ status: 'expired', createdAt: '2026-09-26T09:00:00.000Z' }),
        ],
      }),
    );

    expect(html.indexOf('Pago rechazado')).toBeLessThan(html.indexOf('Checkout vencido'));
  });

  it('muestra ambiente, fechas, número y si hay transacción', () => {
    const html = history(
      order({
        paymentAttempts: [
          attempt({ environment: 'sandbox', hasTransactionId: true, status: 'processing' }),
          attempt({ environment: 'production' }),
        ],
      }),
    );

    expect(html).toContain('Sandbox');
    expect(html).toContain('Producción');
    expect(html).toContain('Creado');
    expect(html).toContain('Vence');
    expect(html).toContain('Intento n.º');
    expect(html).toMatch(/Transacción registrada<\/dt><dd[^>]*>Sí</);
    expect(html).toMatch(/Transacción registrada<\/dt><dd[^>]*>No</);
  });

  it('un attemptNumber repetido no rompe el render ni las claves', () => {
    const repeated = [
      attempt({ attemptNumber: 1, expiresAt: BEFORE }),
      attempt({ attemptNumber: 1, expiresAt: BEFORE }),
      attempt({ attemptNumber: 1, status: 'expired' }),
    ];
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const html = history(order({ paymentAttempts: repeated }));

    expect(html.match(/Checkout vencido/g)).toHaveLength(3);
    expect(errors).not.toHaveBeenCalled();
    expect(new Set(repeated.map(attemptKey)).size).toBe(3);
    errors.mockRestore();
  });

  it('no enseña ningún campo sensible aunque llegara en la respuesta', () => {
    const leaky = {
      ...attempt(),
      reference: 'ref-sensible-001',
      transactionId: 'txn-sensible-001',
      redirectUrl: 'https://checkout.invalid/sensible',
      publicKey: 'pub_sensible_001',
      signature: 'firma-sensible-001',
      integritySecret: 'secreto-sensible-001',
    } as AdminPaymentAttempt;
    const value = order({ paymentAttempts: [leaky] });
    const html = card(value) + history(value);

    for (const needle of ['sensible', 'Referencia', 'reference', 'transactionId', 'redirect']) {
      expect(html, needle).not.toContain(needle);
    }
  });

  it('los componentes no leen campos sensibles del intento', () => {
    const source = readFileSync('src/features/panel/order-detail-cards.tsx', 'utf8');

    for (const field of [
      '.reference',
      '.transactionId',
      '.redirectUrl',
      '.publicKey',
      'signature',
    ]) {
      expect(source, field).not.toContain(field);
    }
  });
});

describe('pedidos auditados', () => {
  /*
   * Forma de MZ-J327WPJW, MZ-F11KCYT4 y MZ-N3QVA4BH: pago pendiente en live, un único intento
   * production en created, sin transacción y con el enlace ya vencido.
   */
  it.each(['MZ-J327WPJW', 'MZ-F11KCYT4', 'MZ-N3QVA4BH'])('%s', (publicId) => {
    const value = order({
      publicId,
      payment: payment({ status: 'pending', statusLabel: 'Pago pendiente', environment: 'live' }),
      paymentAttempts: [
        attempt({
          environment: 'production',
          status: 'created',
          hasTransactionId: false,
          expiresAt: BEFORE,
        }),
      ],
      paymentSimulationEnabled: false,
    });
    const html = card(value);
    const rows = history(value);

    expect(html).toMatch(/Entorno<\/dt><dd[^>]*>Producción</);
    expect(html).toMatch(/Intentos de pago<\/dt><dd[^>]*>1</);
    expect(html).toContain('Checkout vencido');
    expect(html).toContain('Sin transacción registrada');
    expect(html).toContain('Pago pendiente');
    expect(html).not.toContain('Simulación');
    expect(html).not.toContain('Todavía no se ha iniciado');
    expect(rows).toContain('Checkout vencido');
    expect(rows).toMatch(/Transacción registrada<\/dt><dd[^>]*>No</);
  });
});

describe('hidratación', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('el reloj del servidor es null', () => {
    expect(getServerSnapshot()).toBeNull();
  });

  /* Tras hidratar, React ya comparó la instantánea: la hora tiene que llegar con un aviso. */
  it('al suscribirse fija la hora y avisa sin esperar al primer tic', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const listener = vi.fn();

    const unsubscribe = subscribe(listener);
    await Promise.resolve();

    expect(getSnapshot()).toBe(NOW);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  /* El HTML de servidor no depende de la hora: si dependiera, el cliente hidrataría otra cosa. */
  it('la ficha renderizada en servidor es idéntica a cualquier hora', () => {
    const value = order({ paymentAttempts: [attempt({ expiresAt: new Date(NOW).toISOString() })] });

    vi.spyOn(Date, 'now').mockReturnValue(NOW - 3_600_000);
    const early = renderToString(<OrderDetailView initialOrder={value} role="super_admin" />);
    vi.spyOn(Date, 'now').mockReturnValue(NOW + 3_600_000);
    const late = renderToString(<OrderDetailView initialOrder={value} role="super_admin" />);

    expect(early).toBe(late);
    expect(early).toContain('Checkout sin transacción');
  });

  it('solo use-now lee la hora', () => {
    for (const path of [
      'src/features/panel/order-detail-cards.tsx',
      'src/features/panel/order-detail-view.tsx',
      'src/features/panel/payment-attempts.ts',
    ]) {
      const source = readFileSync(path, 'utf8');

      expect(source, path).not.toContain('Date.now');
      expect(source, path).not.toContain('new Date()');
    }
  });
});
