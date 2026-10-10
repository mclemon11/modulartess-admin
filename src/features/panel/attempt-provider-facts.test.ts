import { describe, expect, it } from 'vitest';

import { attemptProviderFacts } from './attempt-provider-facts';
import type { AdminPaymentAttempt } from '@/lib/api/orders';

/** Lo que dijo el proveedor sobre un intento, en la ficha del pedido (ADR 0030 del backend). */

function attempt(overrides: Partial<AdminPaymentAttempt> = {}): AdminPaymentAttempt {
  return {
    attemptNumber: 1,
    createdAt: '2026-10-10T10:00:00.000Z',
    environment: 'production',
    expiresAt: '2026-10-10T12:00:00.000Z',
    hasTransactionId: true,
    provider: { code: 'addi', label: 'Addi' },
    paymentMethod: null,
    status: 'approved',
    providerStatus: 'APPROVED',
    externalId: 'app-ficticia-0001',
    completedAt: '2026-10-10T10:20:00.000Z',
    lastVerifiedAt: '2026-10-10T10:20:00.000Z',
    lastError: null,
    ...overrides,
  } as AdminPaymentAttempt;
}

const labels = (facts: ReturnType<typeof attemptProviderFacts>) => facts.map((fact) => fact.label);

describe('hechos del proveedor en la ficha del intento', () => {
  it('Addi aprobado: estado original, solicitud y fechas', () => {
    const facts = attemptProviderFacts(attempt());
    expect(labels(facts)).toEqual([
      'Estado en el proveedor',
      'Solicitud en Addi',
      'Cerrado',
      'Última verificación',
    ]);
    expect(facts[0]?.value).toBe('APPROVED');
    expect(facts[1]?.value).toBe('app-ficticia-0001');
  });

  it('una redirección sin verificar enseña el código traducido y solo el origen', () => {
    const facts = attemptProviderFacts(
      attempt({
        status: 'created',
        providerStatus: null,
        externalId: null,
        completedAt: null,
        lastVerifiedAt: null,
        lastError: {
          code: 'addi_redirect_unverified',
          at: '2026-10-10T10:05:00.000Z',
          origin: 'https://otro.addi.com',
        },
      }),
    );
    expect(labels(facts)).toEqual(['Último fallo']);
    expect(facts[0]?.value).toContain('origen todavía no autorizado');
    expect(facts[0]?.value).toContain('origen https://otro.addi.com');
    expect(facts[0]?.value).not.toMatch(/\?|\/onboarding/);
  });

  it('Wompi no publica identificador: no se inventa una fila', () => {
    const facts = attemptProviderFacts(
      attempt({ provider: { code: 'wompi', label: 'Wompi' }, externalId: null }),
    );
    expect(labels(facts)).not.toContain('Solicitud en Addi');
  });

  it('un backend anterior a estos campos no rompe la ficha ni inventa datos', () => {
    const legacy = {
      attemptNumber: 1,
      createdAt: '2026-10-10T10:00:00.000Z',
      environment: 'production',
      expiresAt: '2026-10-10T12:00:00.000Z',
      hasTransactionId: false,
      provider: { code: 'wompi', label: 'Wompi' },
      paymentMethod: null,
      status: 'created',
    } as unknown as AdminPaymentAttempt;
    expect(attemptProviderFacts(legacy)).toEqual([]);
  });
});
