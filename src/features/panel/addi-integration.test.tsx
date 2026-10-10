import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  addiActivationBlocker,
  addiActivationRequest,
  addiHealth,
  buildAddiUpdate,
  describeAddiCredential,
  describeAddiFailure,
  describeAddiIncidents,
  EMPTY_ADDI_SECRETS,
  isAddiConfirmation,
} from './addi-integration';
import { parseAddiActivation, parseAddiUpdate } from './integration-input';
import { compactPaymentSummary, paymentMethodFacts } from './payment-method';
import { presentAttempt, usesOnlineCheckout } from './payment-attempts';
import { currentMethodName, finalMethodName } from './payment-reconciliation';

import type { AddiIntegration } from '@/lib/api/integrations';
import type { AdminPaymentAttempt } from '@/lib/api/orders';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
}));

const { AddiSettings } = await import('./addi-settings');
const { AddiProviderCard } = await import('./integration-cards');

/**
 * Addi en el panel (ADR 0015). Valores con aspecto de credencial: inventados.
 */
function integration(overrides: Partial<AddiIntegration> = {}): AddiIntegration {
  return {
    provider: 'addi',
    environment: 'production',
    version: 3,
    livePaymentsEnabled: true,
    enabledForNewPayments: false,
    acceptingNewPayments: false,
    configured: true,
    missing: [],
    allySlug: 'industrialmodulartess-ecommerce',
    clientIdConfigured: true,
    clientIdHint: '…7Kq2',
    clientSecretConfigured: true,
    callbackUsernameConfigured: true,
    callbackUsernameHint: '…ally',
    callbackSecretConfigured: true,
    webhookUrl: 'https://api.example.invalid/v1/webhooks/addi',
    resultBaseUrl: 'https://tienda.example.invalid/pagos/addi/resultado',
    checkoutOrigins: ['https://originations.addi.com'],
    lastTestedAt: '2026-10-09T12:00:00.000Z',
    lastTestStatus: 'passed',
    lastAttemptAt: null,
    lastWebhookAttemptAt: null,
    lastVerifiedWebhookAt: null,
    lastErrorCode: null,
    lastErrorAt: null,
    openIncidents: 0,
    ...overrides,
  } as AddiIntegration;
}

const KEEP = {
  clientId: false,
  clientSecret: false,
  callbackUsername: false,
  callbackSecret: false,
};

describe('credenciales enmascaradas', () => {
  it('solo enseña la pista del backend o «Guardado»', () => {
    const current = integration();

    expect(describeAddiCredential(current, 'clientId')).toBe('Guardado · termina en 7Kq2');
    expect(describeAddiCredential(current, 'clientSecret')).toBe('Guardado');
    expect(describeAddiCredential(current, 'callbackSecret')).toBe('Guardado');
    expect(
      describeAddiCredential(integration({ clientSecretConfigured: false }), 'clientSecret'),
    ).toBe('Sin configurar');
  });

  it('la pantalla no re-muestra secretos y usa campos de contraseña vacíos', () => {
    const html = renderToStaticMarkup(<AddiSettings canManage integration={integration()} />);

    // Con todo guardado, los campos secretos no se montan hasta marcar «Reemplazar».
    expect(html).not.toContain('type="password"');
    expect(html).toContain('Reemplazar');
    expect(html).toContain('https://api.example.invalid/v1/webhooks/addi');

    const empty = renderToStaticMarkup(
      <AddiSettings
        canManage
        integration={integration({
          clientIdConfigured: false,
          clientIdHint: null,
          clientSecretConfigured: false,
          callbackUsernameConfigured: false,
          callbackUsernameHint: null,
          callbackSecretConfigured: false,
          configured: false,
        })}
      />,
    );

    expect(empty.match(/type="password"/g)).toHaveLength(4);
    expect(empty.toLowerCase()).toContain('autocomplete="new-password"');
    expect(empty).not.toMatch(/type="password"[^>]*value="[^"]+"/);
  });
});

describe('conservar o reemplazar', () => {
  it('lo omitido no viaja: solo el secreto marcado y el slug cambiado', () => {
    const built = buildAddiUpdate(integration(), {
      allySlug: 'industrialmodulartess-ecommerce',
      replace: { ...KEEP, clientSecret: true },
      values: { ...EMPTY_ADDI_SECRETS, clientSecret: ' nuevo ', clientId: 'ignorado' },
    });

    expect(built).toEqual({ ok: true, body: { expectedVersion: 3, clientSecret: 'nuevo' } });
  });

  it('marcar «Reemplazar» y dejarlo vacío es un error, no borrar', () => {
    const built = buildAddiUpdate(integration(), {
      allySlug: '',
      replace: { ...KEEP, callbackSecret: true },
      values: EMPTY_ADDI_SECRETS,
    });

    expect(built).toMatchObject({ ok: false, fields: ['callbackSecret'] });
  });

  it('sin cambios no hay llamada', () => {
    expect(
      buildAddiUpdate(integration(), {
        allySlug: 'industrialmodulartess-ecommerce',
        replace: KEEP,
        values: EMPTY_ADDI_SECRETS,
      }),
    ).toMatchObject({ ok: false, fields: [] });
  });

  it('el BFF tampoco deja pasar campos fuera del contrato', () => {
    expect(
      parseAddiUpdate({ expectedVersion: 2, clientId: 'a', enabledForNewPayments: true, x: 1 }),
    ).toEqual({ expectedVersion: 2, clientId: 'a' });
    expect(parseAddiUpdate({ expectedVersion: 2, allySlug: 'MAL SLUG' })).toBeNull();
  });
});

describe('activar exige confirmación', () => {
  it('el cuerpo lleva confirm literal y nunca credenciales', () => {
    expect(addiActivationRequest(3, true)).toEqual({
      expectedVersion: 3,
      enabledForNewPayments: true,
      confirm: true,
    });
    expect(parseAddiActivation({ expectedVersion: 3, enabledForNewPayments: true })).toBeNull();
  });

  it('la frase de confirmación es exacta', () => {
    expect(isAddiConfirmation('activar addi')).toBe(true);
    expect(isAddiConfirmation('ACTIVAR')).toBe(false);
  });

  it('dice qué bloquea la activación', () => {
    expect(addiActivationBlocker(integration({ livePaymentsEnabled: false }))).toContain(
      'despliegue',
    );
    expect(addiActivationBlocker(integration({ configured: false }))).toContain('Faltan datos');
    expect(addiActivationBlocker(integration({ lastTestStatus: null }))).toContain('prueba');
    expect(addiActivationBlocker(integration())).toBeNull();
  });

  it('el estado activo solo se afirma con acceptingNewPayments', () => {
    expect(addiHealth(integration({ enabledForNewPayments: true })).label).toBe('Desactivado');
    expect(
      addiHealth(integration({ enabledForNewPayments: true, acceptingNewPayments: true })).label,
    ).toBe('Activo');
    expect(addiHealth(integration({ livePaymentsEnabled: false })).label).toBe('Bloqueado');
  });
});

describe('permisos', () => {
  it('sin integrations.manage no hay botones de guardar, probar ni activar', () => {
    const html = renderToStaticMarkup(
      <AddiSettings canManage={false} integration={integration()} />,
    );

    expect(html).not.toContain('Guardar configuración');
    expect(html).not.toContain('Probar autenticación');
    expect(html).not.toContain('Activar pagos con Addi');
    expect(html).not.toContain('Reemplazar');
    expect(html).toContain('Tu rol puede');
  });

  it('la tarjeta enlaza a la configuración según el permiso', () => {
    expect(
      renderToStaticMarkup(<AddiProviderCard canManage integration={integration()} />),
    ).toContain('Configurar');
    const readOnly = renderToStaticMarkup(
      <AddiProviderCard canManage={false} integration={integration()} />,
    );

    expect(readOnly).toContain('Ver configuración');
    expect(readOnly).not.toContain('Pendiente de integración');
    expect(renderToStaticMarkup(<AddiProviderCard canManage integration={null} />)).toContain(
      'Estado no disponible',
    );
  });
});

describe('errores', () => {
  it.each([
    'addi_configuration_invalid',
    'addi_configuration_incomplete',
    'addi_connection_test_required',
    'addi_live_payments_not_enabled',
  ])('%s tiene su propio mensaje', (code) => {
    expect(describeAddiFailure(code)).not.toBe(describeAddiFailure('desconocido'));
  });

  it('cuenta las incidencias sin inventar un total', () => {
    expect(describeAddiIncidents(0)).toBe('Ninguna');
    expect(describeAddiIncidents(50)).toBe('50 o más');
  });
});

function attempt(overrides: Partial<AdminPaymentAttempt> = {}): AdminPaymentAttempt {
  return {
    attemptNumber: 1,
    createdAt: '2026-10-09T12:00:00.000Z',
    environment: 'production',
    expiresAt: '2026-10-09T14:00:00.000Z',
    hasTransactionId: false,
    paymentMethod: null,
    provider: { code: 'addi', label: 'Addi' },
    status: 'created',
    ...overrides,
  } as AdminPaymentAttempt;
}

describe('Addi web frente a Addi Marketplace', () => {
  it('un intento de Addi habla de su solicitud, no de Wompi', () => {
    const now = Date.parse('2026-10-09T12:30:00.000Z');

    for (const status of [
      'created',
      'processing',
      'approved',
      'declined',
      'voided',
      'expired',
      'error',
    ] as const) {
      const presented = presentAttempt(attempt({ status }), now);
      expect(`${presented.title} ${presented.text ?? ''}`, status).not.toContain('Wompi');
    }
    expect(presentAttempt(attempt({ status: 'voided' }), now).title).toContain('declinó');
  });

  it('Addi web con intento se cuenta por intentos; Marketplace, por el medio', () => {
    const web = { manual: true, checkoutPaymentMethod: 'addi' } as const;
    const marketplace = { manual: true, checkoutPaymentMethod: null } as const;

    expect(usesOnlineCheckout(web, [attempt()])).toBe(true);
    expect(usesOnlineCheckout(web, [])).toBe(false);
    expect(usesOnlineCheckout(marketplace, [attempt()])).toBe(false);
    expect(usesOnlineCheckout({ manual: false }, [])).toBe(true);
    // Un backend anterior sin el campo: como siempre.
    expect(usesOnlineCheckout({ manual: true }, [attempt()])).toBe(false);
  });

  it('las etiquetas no confunden los dos', () => {
    expect(
      currentMethodName({
        method: 'addi',
        methodLabel: 'Addi (checkout web)',
        checkoutPaymentMethod: 'addi',
      }),
    ).toBe('Addi (checkout web)');
    expect(
      currentMethodName({ method: 'addi', methodLabel: 'Addi', checkoutPaymentMethod: null }),
    ).toBe('Addi Marketplace');
  });

  it('la conciliación manual sigue registrando Addi como Addi Marketplace', () => {
    expect(finalMethodName('addi', 'Addi')).toBe('Addi Marketplace');
  });

  it('el resumen de Addi no dice «medio no informado»', () => {
    const provider = { code: 'addi', label: 'Addi' } as const;

    expect(paymentMethodFacts(provider, null)).toEqual([]);
    expect(
      compactPaymentSummary({ provider, environment: 'production', paymentMethod: null }).visible,
    ).toBe('Addi');
  });
});

describe('a quién llama el navegador', () => {
  // Sin comentarios: nombrar `localStorage` para decir que no se usa no es usarlo.
  const sources = ['addi-settings.tsx', 'addi-integration.ts', 'integrations-client.ts']
    .map((file) => readFileSync(`src/features/panel/${file}`, 'utf8'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  it('solo rutas locales del BFF, sin almacenamiento ni Addi directo', () => {
    expect(sources).toContain('/api/admin/integrations/addi');
    for (const needle of [
      'api.addi.com',
      'auth.addi.com',
      'localStorage',
      'sessionStorage',
      'console.',
      'NEXT_PUBLIC',
    ]) {
      expect(sources, needle).not.toContain(needle);
    }
  });
});
