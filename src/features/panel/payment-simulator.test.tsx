import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

const { PaymentSimulator } = await import('./payment-simulator');

import type { AdminOrder } from '@/lib/api/orders';

/**
 * La puerta del simulador, comprobada sobre el marcado que React produce de verdad.
 *
 * No hace falta un DOM: lo que importa aquí es qué llega a pintarse y qué no, y eso está en el
 * HTML. Tres condiciones tienen que darse a la vez, y las tres vienen de fuera del panel: el
 * despliegue lo declara, el backend dice qué resultados caben, y la matriz explícita dice quién
 * puede. Si alguna se dedujera aquí, el panel ofrecería algo que el backend rechaza.
 */

function order(overrides: Partial<AdminOrder> = {}): AdminOrder {
  return {
    id: 'ord_abc',
    publicId: 'MZ-7KQ2R9DA',
    version: 3,
    status: 'pending_payment',
    statusLabel: 'Pendiente de pago',
    paymentSimulationEnabled: true,
    availableSimulationEvents: ['processing', 'approved'],
    payment: {
      status: 'pending',
      statusLabel: 'Pendiente',
      environment: 'sandbox',
      attemptNumber: 0,
      approvedAt: null,
      approvedAtSource: null,
      updatedAt: '2026-09-05T15:24:00.000Z',
    },
    paymentAttempts: [],
    paymentEvents: [],
    notifications: [],
    ...overrides,
  } as AdminOrder;
}

function render(props: { readonly order?: AdminOrder; readonly role?: string }): string {
  return renderToStaticMarkup(
    <PaymentSimulator
      onUpdated={() => undefined}
      order={props.order ?? order()}
      role={props.role ?? 'super_admin'}
    />,
  );
}

describe('cuándo se pinta', () => {
  it('con las tres condiciones cumplidas', () => {
    const html = render({});

    expect(html).toContain('Simulador de pago');
    expect(html).toContain('Simular procesamiento');
    expect(html).toContain('Simular aprobación');
  });

  /* El contrato reserva `payments.simulate` a `super_admin`. */
  it.each(['master_admin', 'moderator', 'rol-inventado'])('no se pinta para %s', (role) => {
    expect(render({ role })).toBe('');
  });

  it('no se pinta si el despliegue no tiene el simulador encendido', () => {
    expect(render({ order: order({ paymentSimulationEnabled: false }) })).toBe('');
  });

  it('no se pinta si el backend no ofrece ningún resultado', () => {
    expect(render({ order: order({ availableSimulationEvents: [] }) })).toBe('');
  });
});

describe('qué botones ofrece', () => {
  /*
   * Exactamente los de `availableSimulationEvents`. El panel no reimplementa la máquina de estados
   * del pago: deducirla localmente acabaría ofreciendo resultados que el backend rechaza.
   */
  it('solo los resultados que el backend declara disponibles', () => {
    const html = render({ order: order({ availableSimulationEvents: ['declined'] }) });

    expect(html).toContain('Simular rechazo');
    expect(html).not.toContain('Simular aprobación');
    expect(html).not.toContain('Simular vencimiento');
    expect(html).not.toContain('Simular error técnico');
  });

  it('no ofrece un selector arbitrario de estados de pago', () => {
    const html = render({
      order: order({
        availableSimulationEvents: ['processing', 'approved', 'declined', 'expired', 'error'],
      }),
    });

    expect(html).not.toContain('<select');
    expect(html).not.toContain('<input');
    // Y tampoco un campo libre para el motivo: el contrato no publica la lista de códigos.
    expect(html).not.toContain('<textarea');
  });
});

describe('qué dice antes de aplicar nada', () => {
  it('avisa de que es el entorno de pruebas y no hay cobro', () => {
    const html = render({});

    expect(html).toContain('Entorno de pruebas');
    expect(html).toContain('No se realiza un cobro real');
  });

  /* Ni tarjeta, ni entidad, ni referencia: no se inventa un medio de pago. */
  it.each(['Visa', 'Tarjeta', 'Referencia', 'últimos cuatro'])('no menciona «%s»', (needle) => {
    expect(render({})).not.toContain(needle);
  });
});
