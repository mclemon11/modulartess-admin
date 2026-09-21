import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  describePaymentStatus,
  describeReasonCode,
  describeSimulationEvent,
  isSandbox,
  needsSimulationConfirmation,
  paymentStatusVariant,
} from './payment-status';

/**
 * Vocabulario del pago.
 *
 * El listado no puede pedir la ficha de cada pedido para traducir su estado de pago, así que este
 * mapa existe y se comprueba contra el contrato: ni un valor de más ni uno de menos.
 */

type Contract = {
  readonly components: {
    readonly schemas: Record<
      string,
      { readonly properties?: Record<string, { readonly enum?: readonly string[] }> }
    >;
  };
};

const CONTRACT = JSON.parse(readFileSync('openapi/backend-v1.json', 'utf8')) as Contract;

const PAYMENT_STATUSES: readonly string[] =
  CONTRACT.components.schemas.OrderPaymentDto?.properties?.status?.enum ?? [];

const SIMULATION_EVENTS: readonly string[] =
  CONTRACT.components.schemas.SimulatePaymentRequestDto?.properties?.event?.enum ?? [];

describe('estados del pago', () => {
  it('el contrato publica siete y el panel nombra los siete', () => {
    expect(PAYMENT_STATUSES).toEqual([
      'pending',
      'processing',
      'approved',
      'declined',
      'voided',
      'expired',
      'error',
    ]);

    for (const status of PAYMENT_STATUSES) {
      expect(describePaymentStatus(status), status).not.toBe(status);
    }
  });

  it.each([
    ['pending', 'Pendiente'],
    ['processing', 'Procesando'],
    ['approved', 'Pagado'],
    ['declined', 'Rechazado'],
    // Anulado, no rechazado: nadie negó el pago y no hay dinero que devolver.
    ['voided', 'Anulado'],
    ['expired', 'Vencido'],
    ['error', 'Error técnico'],
  ])('%s se lee «%s»', (status, label) => {
    expect(describePaymentStatus(status)).toBe(label);
  });

  it('cada estado publicado tiene su propia variante visual', () => {
    const variants = PAYMENT_STATUSES.map((status) => paymentStatusVariant(status));

    expect(new Set(variants).size).toBe(PAYMENT_STATUSES.length);
    expect(variants).not.toContain('unknown');
  });

  /* Si el backend añadiera uno, la fila sigue siendo legible en vez de romperse. */
  it('un estado que el panel no conoce se muestra con su valor y cae en la variante neutra', () => {
    expect(describePaymentStatus('refunded')).toBe('refunded');
    expect(paymentStatusVariant('refunded')).toBe('unknown');
  });
});

describe('resultados del simulador', () => {
  it('el panel etiqueta exactamente los seis que publica el contrato', () => {
    expect(SIMULATION_EVENTS).toEqual([
      'processing',
      'approved',
      'declined',
      'voided',
      'expired',
      'error',
    ]);

    for (const event of SIMULATION_EVENTS) {
      expect(describeSimulationEvent(event), event).not.toBe(event);
    }
  });

  it.each([
    ['processing', 'Simular procesamiento'],
    ['approved', 'Simular aprobación'],
    ['declined', 'Simular rechazo'],
    ['voided', 'Simular anulación'],
    ['expired', 'Simular vencimiento'],
    ['error', 'Simular error técnico'],
  ])('%s se ofrece como «%s»', (event, label) => {
    expect(describeSimulationEvent(event)).toBe(label);
  });

  /*
   * Los cuatro que cierran el desenlace piden confirmación. `processing` abre un intento y no lo
   * cierra, así que pedir confirmación ahí solo enseñaría a pulsar «Confirmar» sin leer.
   */
  it('pide confirmación para todo menos abrir el intento', () => {
    expect(needsSimulationConfirmation('processing')).toBe(false);

    for (const event of ['approved', 'declined', 'voided', 'expired', 'error']) {
      expect(needsSimulationConfirmation(event), event).toBe(true);
    }
  });
});

describe('motivos del rechazo', () => {
  /*
   * El contrato define `reasonCode` como «stable, bounded» pero no publica los valores. Solo se
   * muestra lo que el panel sabe traducir: un código interno en pantalla se lee como un error.
   */
  it('solo traduce los códigos con lectura aprobada', () => {
    expect(describeReasonCode('insufficient_funds')).toBe('Fondos insuficientes');
    expect(describeReasonCode('gw_err_0x22')).toBeNull();
  });

  it('sin motivo no inventa ninguno', () => {
    expect(describeReasonCode(null)).toBeNull();
  });
});

describe('entorno', () => {
  it('distingue la simulación del cobro real', () => {
    expect(isSandbox('sandbox')).toBe(true);
    expect(isSandbox('live')).toBe(false);
  });
});
