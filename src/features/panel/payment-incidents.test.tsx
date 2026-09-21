import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { readIncidentFilters } from './payment-incident-filters';
import { parseIncidentResolution, parseWompiUpdate } from './integration-input';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
}));

const { PaymentIncidentsView } = await import('./payment-incidents-view');

import type { PaymentIncident, PaymentIncidentPage } from '@/lib/api/payment-incidents';

/**
 * La bandeja de incidencias.
 *
 * Dos cosas se comprueban aquí y las dos importan: que la proyección no filtre nada que el
 * contrato dejó fuera a propósito, y que cerrar una incidencia exija versión y motivo de un
 * vocabulario cerrado.
 */

function incident(overrides: Partial<PaymentIncident> = {}): PaymentIncident {
  return {
    id: 'pin_0123456789abcdef0123456789abcdef',
    provider: 'wompi',
    environment: 'sandbox',
    reason: 'amount_mismatch',
    providerTransactionId: '1234-1610641025-49201',
    providerStatus: 'APPROVED',
    attemptId: 'pat_abc',
    orderId: 'ord_abc',
    firstSeenAt: '2026-09-19T10:00:00.000Z',
    lastSeenAt: '2026-09-19T11:00:00.000Z',
    occurrences: 3,
    status: 'open',
    version: 2,
    resolvedAt: null,
    resolvedBy: null,
    resolutionCode: null,
    ...overrides,
  } as PaymentIncident;
}

function page(items: readonly PaymentIncident[]): PaymentIncidentPage {
  return { items: [...items], nextPageToken: null } as PaymentIncidentPage;
}

describe('proyección de la bandeja', () => {
  const html = renderToStaticMarkup(<PaymentIncidentsView canManage page={page([incident()])} />);

  it('traduce el motivo a palabras', () => {
    expect(html).toContain('Monto distinto');
    expect(html).not.toContain('amount_mismatch');
  });

  it('muestra ocurrencias y las dos fechas', () => {
    expect(html).toContain('3');
    expect(html).toContain('ocurrencia');
  });

  it('enlaza al pedido por su identificador interno', () => {
    expect(html).toContain('href="/panel/pedidos/ord_abc"');
  });

  /*
   * El contrato deja fuera el payload, la firma, el correo, la dirección y el monto recibido a
   * propósito. La pantalla no los reconstruye ni los pide por otra vía.
   */
  it.each(['signature', 'checksum', '@', 'payload', 'amount_in_cents'])(
    'no filtra «%s»',
    (needle) => {
      expect(html).not.toContain(needle);
    },
  );

  it('sin pedido identificado lo dice en lugar de inventarlo', () => {
    const html = renderToStaticMarkup(
      <PaymentIncidentsView canManage page={page([incident({ orderId: null })])} />,
    );

    expect(html).toContain('Sin identificar');
  });

  it('una bandeja vacía lo explica', () => {
    expect(renderToStaticMarkup(<PaymentIncidentsView canManage page={page([])} />)).toContain(
      'No hay incidencias con estos filtros',
    );
  });
});

describe('resolver una incidencia', () => {
  it('sin permiso de gestión no ofrece resolver', () => {
    const html = renderToStaticMarkup(
      <PaymentIncidentsView canManage={false} page={page([incident()])} />,
    );

    expect(html).not.toContain('>Resolver<');
    expect(html).toContain('no permite cerrar incidencias');
  });

  it('con permiso ofrece resolver, pero no cierra al primer clic', () => {
    const html = renderToStaticMarkup(<PaymentIncidentsView canManage page={page([incident()])} />);

    expect(html).toContain('Resolver');
    expect(html).not.toContain('Confirmar cierre');
  });

  /*
   * Una incidencia resuelta **puede reabrirse**: el contrato lo dice, y presentarla como definitiva
   * escondería algo que sigue ocurriendo.
   */
  it('una resuelta dice su motivo y que puede volver', () => {
    const html = renderToStaticMarkup(
      <PaymentIncidentsView
        canManage
        page={page([
          incident({
            status: 'resolved',
            resolutionCode: 'configuration_corrected',
            resolvedAt: '2026-09-19T12:00:00.000Z',
          }),
        ])}
      />,
    );

    expect(html).toContain('Se corrigió la configuración');
    expect(html).toContain('se reabre sola');
  });
});

describe('filtros de la URL', () => {
  it('estrecha a los valores del contrato', () => {
    expect(readIncidentFilters({ status: 'open', environment: 'sandbox' })).toMatchObject({
      status: 'open',
      environment: 'sandbox',
    });
  });

  /* Un valor inventado no viaja: el backend lo rechazaría y la pantalla no debe romperse. */
  it.each(['todas', 'OPEN', 'live', 'lo-que-sea'])('descarta %o', (value) => {
    const filters = readIncidentFilters({ status: value, environment: value, reason: value });

    expect(filters.status).toBeUndefined();
    expect(filters.environment).toBeUndefined();
    expect(filters.reason).toBeUndefined();
  });

  /* `status` ausente se queda ausente: el contrato ya responde `open` por defecto. */
  it('no fuerza un estado por defecto', () => {
    expect(readIncidentFilters({}).status).toBeUndefined();
  });

  it('un parámetro repetido conserva el primero', () => {
    expect(readIncidentFilters({ status: ['open', 'resolved'] }).status).toBe('open');
  });

  it('acepta los nueve motivos publicados', () => {
    for (const reason of [
      'reference_unknown',
      'provider_mismatch',
      'environment_mismatch',
      'currency_mismatch',
      'amount_mismatch',
      'attempt_bound_to_other_transaction',
      'transaction_bound_to_other_attempt',
      'order_unknown',
      'live_disabled',
    ]) {
      expect(readIncidentFilters({ reason }).reason, reason).toBe(reason);
    }
  });
});

describe('validación del cuerpo de resolución', () => {
  it('exige versión y motivo', () => {
    expect(
      parseIncidentResolution({ expectedVersion: 2, resolutionCode: 'no_action_needed' }),
    ).toEqual({ expectedVersion: 2, resolutionCode: 'no_action_needed' });
  });

  it.each([
    ['sin versión', { resolutionCode: 'no_action_needed' }],
    ['con versión cero', { expectedVersion: 0, resolutionCode: 'no_action_needed' }],
    ['sin motivo', { expectedVersion: 2 }],
    ['con un motivo inventado', { expectedVersion: 2, resolutionCode: 'porque_si' }],
    // El contrato no admite texto libre, y aceptarlo aquí lo colaría hasta el backend.
    ['con texto libre', { expectedVersion: 2, resolutionCode: 'El cliente llamó y lo aclaró' }],
  ])('rechaza un cuerpo %s', (_case, body) => {
    expect(parseIncidentResolution(body)).toBeNull();
  });
});

describe('validación del cuerpo de configuración', () => {
  it('exige versión y ambiente', () => {
    expect(parseWompiUpdate({ expectedVersion: 3, environment: 'sandbox' })).toEqual({
      expectedVersion: 3,
      environment: 'sandbox',
    });
  });

  it.each([
    ['sin versión', { environment: 'sandbox' }],
    ['sin ambiente', { expectedVersion: 3 }],
    ['con un ambiente inventado', { expectedVersion: 3, environment: 'staging' }],
    // `disabled` es el estado derivado de apagar los ambientes, no un ambiente configurable.
    ['con disabled como ambiente', { expectedVersion: 3, environment: 'disabled' }],
  ])('rechaza un cuerpo %s', (_case, body) => {
    expect(parseWompiUpdate(body)).toBeNull();
  });

  /*
   * Solo viajan los campos que el contrato publica. Copiar el objeto del navegador dejaría pasar
   * cualquier propiedad añadida, y aquí las propiedades añadidas serían credenciales.
   */
  it('descarta las propiedades que el contrato no publica', () => {
    const parsed = parseWompiUpdate({
      expectedVersion: 3,
      environment: 'sandbox',
      publicKey: 'pub_test_ejemplo1234',
      forzarProduccion: true,
      livePaymentsEnabled: true,
    });

    expect(Object.keys(parsed ?? {}).sort()).toEqual([
      'environment',
      'expectedVersion',
      'publicKey',
    ]);
  });

  /* Un campo vacío significa «conserva la actual», así que no se manda. */
  it('no convierte un campo vacío en una credencial', () => {
    const parsed = parseWompiUpdate({
      expectedVersion: 3,
      environment: 'sandbox',
      privateKey: '',
      eventsSecret: '',
    });

    expect(parsed).toEqual({ expectedVersion: 3, environment: 'sandbox' });
  });

  it('deja pasar la revocación y el encendido como booleanos', () => {
    expect(
      parseWompiUpdate({
        expectedVersion: 3,
        environment: 'sandbox',
        enabledForNewPayments: false,
        revokeRetiredEventsSecrets: true,
      }),
    ).toEqual({
      expectedVersion: 3,
      environment: 'sandbox',
      enabledForNewPayments: false,
      revokeRetiredEventsSecrets: true,
    });
  });
});
