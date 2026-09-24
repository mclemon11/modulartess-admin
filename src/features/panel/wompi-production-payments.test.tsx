import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
}));

const { LivePaymentsConfirmation, ProductionPaymentsControl } =
  await import('./wompi-production-payments');
const { WompiCredentialsForm } = await import('./wompi-credentials-form');
const {
  describeProductionFailure,
  isLiveConfirmation,
  LIVE_CONFIRMATION_PHRASE,
  PRODUCTION_GENERIC_MESSAGE,
  productionPaymentsRequest,
  productionPaymentsState,
  productionRequiresReload,
} = await import('./wompi-live-payments');
const { parseWompiUpdate } = await import('./integration-input');

import type { WompiEnvironmentConfig, WompiIntegration } from '@/lib/api/integrations';

/**
 * Cobros reales en Producción.
 *
 * Es el único control del panel que mueve dinero de verdad. Estas pruebas fijan los cuatro estados,
 * la confirmación escrita y el cuerpo exacto que se manda, y cada una está escrita para **fallar si
 * se quita la protección**: un botón que aparece sin llaves, una confirmación que acepta cualquier
 * texto o un cuerpo que arrastra credenciales.
 *
 * Ningún valor de este archivo es una credencial: los prefijos se usan solo para comprobar que no
 * aparecen.
 */

function environmentConfig(
  overrides: Partial<WompiEnvironmentConfig> = {},
): WompiEnvironmentConfig {
  return {
    configured: true,
    enabledForNewPayments: false,
    publicKeyMasked: 'pub_prod_…c3d4',
    privateKeyConfigured: true,
    eventsSecretConfigured: true,
    integritySecretConfigured: true,
    redirectUrl: 'https://tienda.example.invalid/pagos/resultado',
    webhookUrl: 'https://api.example.invalid/v1/webhooks/wompi',
    lastTestedAt: null,
    lastTestStatus: null,
    lastWebhookAttemptAt: null,
    lastVerifiedWebhookAt: null,
    lastReconciledAt: null,
    retiredEventsSecretCount: 0,
    eventsSecretGraceHours: 25,
    lastErrorCode: null,
    ...overrides,
  } as WompiEnvironmentConfig;
}

function integration(
  production: Partial<WompiEnvironmentConfig>,
  overrides: Partial<WompiIntegration> = {},
): WompiIntegration {
  return {
    provider: 'wompi',
    activeEnvironment: 'disabled',
    livePaymentsEnabled: true,
    version: 7,
    sandbox: environmentConfig({ publicKeyMasked: 'pub_test_…a1b2' }),
    production: environmentConfig(production),
    ...overrides,
  } as WompiIntegration;
}

const UNCONFIGURED = integration({
  configured: false,
  publicKeyMasked: null,
  privateKeyConfigured: false,
  eventsSecretConfigured: false,
  integritySecretConfigured: false,
});
const BLOCKED = integration({}, { livePaymentsEnabled: false });
const INACTIVE = integration({});
const ACTIVE = integration({ enabledForNewPayments: true }, { activeEnvironment: 'production' });

function control(value: WompiIntegration, canManage = true): string {
  return renderToStaticMarkup(
    <ProductionPaymentsControl canManage={canManage} integration={value} />,
  );
}

function confirmation(phrase: string, busy = false): string {
  return renderToStaticMarkup(
    <LivePaymentsConfirmation
      busy={busy}
      onCancel={() => undefined}
      onConfirm={() => undefined}
      onPhraseChange={() => undefined}
      phrase={phrase}
    />,
  );
}

/** ¿El botón de enviar de la confirmación está deshabilitado? */
function confirmDisabled(html: string): boolean {
  const button = /<button[^>]*type="submit"[^>]*>/.exec(html)?.[0] ?? '';

  expect(button, 'la confirmación tiene botón de enviar').not.toBe('');

  return button.includes('disabled=""');
}

function executable(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const CONTROL_SOURCE = executable(
  readFileSync('src/features/panel/wompi-production-payments.tsx', 'utf8'),
);

describe('Producción: en qué estado está', () => {
  it('deriva los cuatro estados de lo que responde el backend', () => {
    expect(productionPaymentsState(UNCONFIGURED)).toBe('unconfigured');
    expect(productionPaymentsState(BLOCKED)).toBe('blocked');
    expect(productionPaymentsState(INACTIVE)).toBe('inactive');
    expect(productionPaymentsState(ACTIVE)).toBe('active');
  });

  /* Sin llaves no hay nada que activar, aunque el despliegue ya lo permita. */
  it('sin llaves es «sin configurar» aunque el despliegue permita cobrar', () => {
    expect(productionPaymentsState({ ...UNCONFIGURED, livePaymentsEnabled: true })).toBe(
      'unconfigured',
    );
    expect(productionPaymentsState({ ...UNCONFIGURED, livePaymentsEnabled: false })).toBe(
      'unconfigured',
    );
  });

  /*
   * Si Producción está cobrando, lo único que importa es poder apagarla, aunque el despliegue
   * haya vuelto a bloquear. El contrato admite apagar Producción siempre.
   */
  it('encendida es «activa» aunque el despliegue vuelva a bloquear', () => {
    expect(
      productionPaymentsState(
        integration({ enabledForNewPayments: true }, { livePaymentsEnabled: false }),
      ),
    ).toBe('active');
  });
});

describe('Producción: lo que se pinta en cada estado', () => {
  it('sin configurar no pinta nada: solo queda el formulario de llaves', () => {
    expect(control(UNCONFIGURED)).toBe('');
    expect(control({ ...UNCONFIGURED, livePaymentsEnabled: false })).toBe('');
  });

  it('configurada y con el despliegue bloqueando, lo explica y no ofrece botón', () => {
    const html = control(BLOCKED);

    expect(html).toContain('este despliegue todavía bloquea los cobros reales');
    expect(html).toContain('Las llaves de Producción están guardadas');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('Activar cobros reales');
    expect(html).not.toContain('Cobros reales activos');
  });

  it('permitida y apagada: «Cobros reales desactivados» y un botón visible para activarlos', () => {
    const html = control(INACTIVE);

    expect(html).toContain('Cobros reales desactivados');
    expect(html).toMatch(/<button[^>]*>Activar cobros reales<\/button>/);
    // Visible y vivo: ni deshabilitado ni oculto.
    expect(html).not.toContain('disabled');
    expect(html).not.toContain('hidden');
    expect(html).not.toContain('Desactivar cobros reales');
    expect(html).not.toContain('Cobros reales activos');
  });

  /* La confirmación no está abierta de entrada: aparece al pulsar «Activar cobros reales». */
  it('apagada no enseña la confirmación hasta que se pide', () => {
    const html = control(INACTIVE);

    expect(html).not.toContain('wompi-live-confirmation');
    expect(html).not.toContain(LIVE_CONFIRMATION_PHRASE);
  });

  it('encendida: «Cobros reales activos» y «Desactivar cobros reales»', () => {
    const html = control(ACTIVE);

    expect(html).toContain('Cobros reales activos');
    expect(html).toContain('data-state="active"');
    expect(html).toMatch(/<button[^>]*>Desactivar cobros reales<\/button>/);
    expect(html).not.toContain('Activar cobros reales');
    expect(html).not.toContain('Cobros reales desactivados');
  });

  it('encendida con el despliegue bloqueando, sigue ofreciendo desactivar', () => {
    const html = control(
      integration({ enabledForNewPayments: true }, { livePaymentsEnabled: false }),
    );

    expect(html).toContain('Cobros reales activos');
    expect(html).toContain('Desactivar cobros reales');
  });

  it('desactivar no promete borrar nada', () => {
    expect(control(ACTIVE)).toContain('Desactivarlo no borra nada');
  });

  /*
   * «Activos» no puede leerse como «ya se cobra» si el backend dice que el ambiente activo sigue
   * siendo otro. Lo dice el campo derivado del backend, no una deducción del panel.
   */
  it('si el backend informa otro ambiente activo, lo dice', () => {
    const sandboxFirst = control(
      integration({ enabledForNewPayments: true }, { activeEnvironment: 'sandbox' }),
    );

    expect(sandboxFirst).toContain('el ambiente activo sigue siendo Pruebas (Sandbox)');
    expect(control(ACTIVE)).not.toContain('data-active-environment');
  });

  it('sin integrations.manage se ve el estado pero ningún botón', () => {
    for (const value of [INACTIVE, ACTIVE]) {
      const html = control(value, false);

      expect(html).toContain('Cobros reales');
      expect(html).not.toContain('<button');
      expect(html).toContain('Tu rol puede ver este estado, pero no cambiarlo.');
    }
  });

  /* La pantalla de Pruebas no cambia: su control sigue siendo el suyo. */
  it('el formulario arranca en Pruebas con su control, no con el de Producción', () => {
    const html = renderToStaticMarkup(<WompiCredentialsForm canManage integration={ACTIVE} />);

    expect(html).toContain('pagos de prueba');
    expect(html).not.toContain('cobros reales');
  });
});

describe('Producción: la confirmación escrita', () => {
  it('la frase es ACTIVAR PRODUCCIÓN', () => {
    expect(LIVE_CONFIRMATION_PHRASE).toBe('ACTIVAR PRODUCCIÓN');
  });

  it('dice con claridad que desde ese momento se cobra dinero real', () => {
    const html = confirmation('');

    expect(html).toContain('Vas a activar los cobros reales');
    expect(html).toContain('Desde el momento en que confirmes');
    expect(html).toContain('<strong>dinero real</strong>');
    expect(html).toContain('No es una prueba');
    expect(html).toContain('Escribe <strong>ACTIVAR PRODUCCIÓN</strong> para confirmar');
  });

  it('sin la frase exacta no se puede confirmar', () => {
    for (const phrase of [
      '',
      'activar producción',
      'ACTIVAR PRODUCCION',
      'ACTIVAR  PRODUCCIÓN',
      'ACTIVAR',
      'ACTIVAR PRODUCCIÓN YA',
      'Activar Producción',
    ]) {
      expect(isLiveConfirmation(phrase), phrase).toBe(false);
      expect(confirmDisabled(confirmation(phrase)), phrase).toBe(true);
    }
  });

  it('con la frase exacta se puede confirmar', () => {
    expect(isLiveConfirmation('ACTIVAR PRODUCCIÓN')).toBe(true);
    expect(confirmDisabled(confirmation('ACTIVAR PRODUCCIÓN'))).toBe(false);
  });

  /*
   * Lo único que se perdona son cosas que no decide quien escribe: los espacios de los extremos
   * y cómo codifica el teclado la «Ó».
   */
  it('perdona los extremos y la «Ó» descompuesta, nada más', () => {
    expect(isLiveConfirmation('  ACTIVAR PRODUCCIÓN\n')).toBe(true);
    expect(isLiveConfirmation('ACTIVAR PRODUCCIÓN'.normalize('NFD'))).toBe(true);
  });

  it('mientras se aplica, ni se confirma ni se cancela dos veces', () => {
    const html = confirmation('ACTIVAR PRODUCCIÓN', true);

    expect(confirmDisabled(html)).toBe(true);
    expect(html).toContain('Activando…');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*type="button"[^>]*>Cancelar/);
  });

  it('el campo de la frase no se autocompleta ni se corrige', () => {
    const html = confirmation('');

    expect(html).toMatch(/id="wompi-live-confirmation"/);
    expect(html).toContain('autoComplete="off"');
    expect(html).toContain('spellCheck="false"');
    expect(html).toMatch(/<label[^>]*for="wompi-live-confirmation"/);
  });

  /*
   * Es un formulario propio y el de llaves ya no la envuelve: Intro en la frase confirma esto y
   * nunca envía las cuatro llaves. El `submit` vuelve a comprobar la frase porque un botón
   * deshabilitado no impide que Intro envíe.
   */
  it('es un formulario propio que vuelve a comprobar la frase al enviar', () => {
    expect(confirmation('')).toMatch(/^<form/);
    expect(CONTROL_SOURCE).toMatch(/onSubmit=[\s\S]*?if \(matches && !busy\) onConfirm\(\)/);

    const form = executable(readFileSync('src/features/panel/wompi-credentials-form.tsx', 'utf8'));
    const credentialsForm = form.slice(form.indexOf('<form'), form.indexOf('</form>'));

    expect(credentialsForm).not.toContain('ProductionPaymentsControl');
    expect(credentialsForm).not.toContain('SandboxPaymentsToggle');
  });

  /* Activar sale solo de la confirmación. Ningún otro camino llama a `apply(true)`. */
  it('la activación solo se dispara desde la confirmación', () => {
    const calls = [...CONTROL_SOURCE.matchAll(/apply\(true\)/g)];

    expect(calls).toHaveLength(1);
    expect(CONTROL_SOURCE).toMatch(/onConfirm=\{\(\) => void apply\(true\)\}/);
    // El botón visible solo abre la confirmación.
    expect(CONTROL_SOURCE).toMatch(/setConfirming\(true\)/);
  });

  it('el texto de confirmación no sobrevive a un intento ni a cancelar', () => {
    const apply = CONTROL_SOURCE.slice(CONTROL_SOURCE.indexOf('async function apply'));
    const afterCall = apply.slice(apply.indexOf('await updateWompiIntegration'));

    // Se vacía nada más volver, antes de mirar si fue bien o mal.
    expect(afterCall.indexOf("setPhrase('')")).toBeGreaterThan(0);
    expect(afterCall.indexOf("setPhrase('')")).toBeLessThan(afterCall.indexOf('if (result.ok)'));

    const cancel = CONTROL_SOURCE.slice(CONTROL_SOURCE.indexOf('function cancel'));

    expect(cancel.slice(0, cancel.indexOf('}'))).toContain("setPhrase('')");
  });

  it('tras el éxito relee el estado del backend y cierra la confirmación', () => {
    const apply = CONTROL_SOURCE.slice(CONTROL_SOURCE.indexOf('async function apply'));
    const success = apply.slice(apply.indexOf('if (result.ok)'), apply.indexOf('} else {'));

    expect(success).toContain('setConfirming(false)');
    expect(success).toContain('router.refresh()');
  });

  it('un candado síncrono excluye el doble clic', () => {
    const apply = CONTROL_SOURCE.slice(CONTROL_SOURCE.indexOf('async function apply'));

    expect(apply.indexOf('if (running.current) return;')).toBeLessThan(apply.indexOf('await'));
    expect(apply.indexOf('running.current = true;')).toBeLessThan(apply.indexOf('await'));
  });
});

describe('Producción: lo que se manda', () => {
  const CREDENTIAL_FIELDS = ['publicKey', 'privateKey', 'eventsSecret', 'integritySecret'];

  it('activar manda environment production, enabledForNewPayments true y la versión, nada más', () => {
    expect(productionPaymentsRequest(7, true)).toStrictEqual({
      expectedVersion: 7,
      environment: 'production',
      enabledForNewPayments: true,
    });
  });

  it('desactivar manda lo mismo con el interruptor apagado', () => {
    expect(productionPaymentsRequest(7, false)).toStrictEqual({
      expectedVersion: 7,
      environment: 'production',
      enabledForNewPayments: false,
    });
  });

  it('ninguna credencial ni ningún campo vacío viajan', () => {
    for (const enable of [true, false]) {
      const body = productionPaymentsRequest(7, enable);

      for (const field of [...CREDENTIAL_FIELDS, 'revokeRetiredEventsSecrets']) {
        expect(Object.hasOwn(body, field), field).toBe(false);
      }
      for (const value of Object.values(body)) {
        expect(value).not.toBe('');
      }
    }
  });

  /* El BFF lo reenvía tal cual: no añade ni quita nada del cuerpo de activación. */
  it('el BFF deja pasar exactamente ese cuerpo', () => {
    expect(parseWompiUpdate(productionPaymentsRequest(7, true))).toStrictEqual(
      productionPaymentsRequest(7, true),
    );
  });

  it('el control usa ese cuerpo y la versión que leyó, y no el selector', () => {
    expect(CONTROL_SOURCE).toContain(
      'updateWompiIntegration(\n      productionPaymentsRequest(integration.version, enable),\n    )',
    );

    for (const field of CREDENTIAL_FIELDS) {
      expect(CONTROL_SOURCE, field).not.toContain(field);
    }
  });
});

describe('Producción: los fallos', () => {
  it('traduce el bloqueo del despliegue y relee para dejar de ofrecer el botón', () => {
    expect(describeProductionFailure('live_payments_not_enabled')).toBe(
      'El backend todavía bloquea los cobros reales en este despliegue. No se activó nada.',
    );
    expect(productionRequiresReload('live_payments_not_enabled')).toBe(true);
  });

  it('traduce el conflicto de versión y relee', () => {
    for (const code of ['integration_conflict', 'version_conflict']) {
      expect(describeProductionFailure(code)).toContain('La configuración cambió');
      expect(describeProductionFailure(code)).toContain('vuelve a confirmar');
      expect(productionRequiresReload(code)).toBe(true);
    }
  });

  it('traduce la falta de permisos sin releer', () => {
    expect(describeProductionFailure('admin_role_required')).toBe(
      'Tu rol no puede activar ni desactivar los cobros reales. No se cambió nada.',
    );
    expect(productionRequiresReload('admin_role_required')).toBe(false);
  });

  it('un código desconocido cae al mensaje genérico, sin repetirlo', () => {
    expect(describeProductionFailure('algo_nuevo')).toBe(PRODUCTION_GENERIC_MESSAGE);
    expect(PRODUCTION_GENERIC_MESSAGE).not.toContain('algo_nuevo');
  });

  /* Aquí no se guardan llaves: un mensaje sobre guardarlas mandaría a hacer otra cosa. */
  it('ningún mensaje habla de guardar llaves', () => {
    for (const code of [
      'live_payments_not_enabled',
      'integration_conflict',
      'admin_role_required',
      'session_required',
    ]) {
      expect(describeProductionFailure(code), code).not.toContain('quedan guardadas');
      expect(describeProductionFailure(code), code).not.toContain('vuelve a guardar');
    }
  });

  it('el error pintado sale del código traducido, nunca del texto del backend', () => {
    expect(CONTROL_SOURCE).toContain('setFailure(describeProductionFailure(result.code))');
    expect(CONTROL_SOURCE).not.toContain('result.message');
  });
});

describe('Producción: nada se filtra', () => {
  const PREFIXES = [
    'pub_prod_',
    'prv_prod_',
    'prod_events_',
    'prod_integrity_',
    'pub_test_',
    'prv_test_',
  ];

  it('ningún estado pinta una llave, ni enmascarada', () => {
    const renders = [
      control(UNCONFIGURED),
      control(BLOCKED),
      control(INACTIVE),
      control(ACTIVE),
      control(INACTIVE, false),
      confirmation('ACTIVAR PRODUCCIÓN'),
    ];

    for (const html of renders) {
      for (const prefix of PREFIXES) {
        expect(html, prefix).not.toContain(prefix);
      }
    }
  });

  it('no registra nada ni guarda nada en el navegador', () => {
    const PURE = executable(readFileSync('src/features/panel/wompi-live-payments.ts', 'utf8'));

    for (const source of [CONTROL_SOURCE, PURE]) {
      for (const needle of [
        'console.',
        'localStorage',
        'sessionStorage',
        'document.cookie',
        'searchParams',
        'router.push',
      ]) {
        expect(source, needle).not.toContain(needle);
      }
    }
  });
});
