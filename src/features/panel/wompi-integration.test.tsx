import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
}));

const { WompiCredentialsForm } = await import('./wompi-credentials-form');
const { SandboxPaymentsToggle } = await import('./wompi-operations');
const { AddiProviderCard, WompiProviderCard } = await import('./integration-cards');
const { describeOpenIncidentCount, OPEN_INCIDENTS_UNAVAILABLE, readOpenIncidentCount } =
  await import('./integration-labels');
const { CopyableValue } = await import('./copyable-value');
const { checkCredentials, describeSaveFailure, detectCredentialEnvironment, requiresReload } =
  await import('./wompi-credential-check');

import type { WompiEnvironmentConfig, WompiIntegration } from '@/lib/api/integrations';
import type { PaymentIncidentPage } from '@/lib/api/payment-incidents';

/**
 * La superficie de Wompi, sobre el HTML que React produce de verdad.
 *
 * Lo que se comprueba aquí es lo que no puede fallar: que ningún secreto llegue al marcado, que los
 * campos sean write-only, que producción siga bloqueada y que los tres relojes operativos se
 * distingan. Cada prueba está escrita para **fallar si se quita la protección**, no para
 * acompañar al código.
 *
 * Los valores con aspecto de credencial que aparecen en este archivo son **inventados para la
 * prueba** y no corresponden a ninguna cuenta: son la forma de comprobar que un valor así no se
 * escapa al HTML.
 */

/** Cadenas con forma de credencial, usadas solo para comprobar que NO aparecen. */
const NEVER_RENDERED = {
  privateKey: 'prv_test_NUNCADEBEAPARECERENELHTML01',
  eventsSecret: 'test_events_NUNCADEBEAPARECERENELHTML',
  integritySecret: 'test_integrity_NUNCADEBEAPARECER01',
  fullPublicKey: 'pub_test_ESTAESLALLAVECOMPLETAa1b2',
} as const;

function environmentConfig(
  overrides: Partial<WompiEnvironmentConfig> = {},
): WompiEnvironmentConfig {
  return {
    configured: true,
    enabledForNewPayments: true,
    publicKeyMasked: 'pub_test_…a1b2',
    privateKeyConfigured: true,
    eventsSecretConfigured: true,
    integritySecretConfigured: true,
    redirectUrl: 'https://tienda.example.invalid/pagos/resultado',
    webhookUrl: 'https://api.example.invalid/v1/webhooks/wompi',
    lastTestedAt: '2026-09-19T10:00:00.000Z',
    lastTestStatus: 'passed',
    lastWebhookAttemptAt: '2026-09-19T11:00:00.000Z',
    lastVerifiedWebhookAt: '2026-09-19T10:30:00.000Z',
    lastReconciledAt: '2026-09-19T09:00:00.000Z',
    retiredEventsSecretCount: 1,
    eventsSecretGraceHours: 25,
    lastErrorCode: null,
    ...overrides,
  } as WompiEnvironmentConfig;
}

function integration(overrides: Partial<WompiIntegration> = {}): WompiIntegration {
  return {
    provider: 'wompi',
    activeEnvironment: 'sandbox',
    livePaymentsEnabled: false,
    version: 4,
    sandbox: environmentConfig(),
    production: environmentConfig({
      configured: false,
      enabledForNewPayments: false,
      publicKeyMasked: null,
      privateKeyConfigured: false,
      eventsSecretConfigured: false,
      integritySecretConfigured: false,
    }),
    ...overrides,
  } as WompiIntegration;
}

describe('configurar Wompi: la pantalla', () => {
  const html = renderToStaticMarkup(<WompiCredentialsForm canManage integration={integration()} />);

  /*
   * La prueba central de toda esta superficie. Si alguien precargara los campos con lo que
   * devuelve el backend —o si el backend empezara a devolverlos— esto lo dice.
   */
  it('ningún valor de credencial aparece en el HTML inicial', () => {
    for (const secret of Object.values(NEVER_RENDERED)) {
      expect(html, secret.slice(0, 12)).not.toContain(secret);
    }
  });

  it('los cuatro campos nacen vacíos', () => {
    // Un `value=""` o la ausencia de `value` son lo mismo aquí: lo que no puede haber es contenido.
    expect(html).not.toMatch(
      /name="wompi-(publicKey|privateKey|eventsSecret|integritySecret)"[^>]*value="[^"]+"/,
    );
  });

  /*
   * `new-password`, no `off`.
   *
   * Los navegadores llevan años ignorando `off` en campos de contraseña y ofreciendo autocompletar
   * igualmente; `new-password` es la señal que sí respetan para no rellenar ni guardar. Con `off`,
   * un gestor de contraseñas podía quedarse la llave privada de la pasarela.
   */
  it('los cuatro son campos de contraseña y piden no ser autocompletados', () => {
    expect(html.match(/type="password"/g) ?? []).toHaveLength(4);
    expect(html.match(/autoComplete="new-password"/g) ?? []).toHaveLength(4);
    expect(html).not.toContain('autoComplete="off"');
  });

  /* Selección por omisión: Pruebas. Nadie llega a esta pantalla para tocar producción primero. */
  it('ofrece los dos ambientes y arranca en Pruebas', () => {
    expect(html).toContain('Pruebas (Sandbox)');
    expect(html).toContain('Producción');
    expect(html).toMatch(/<select[^>]*id="wompi-environment"/);
    expect(html).toMatch(/<option[^>]*selected[^>]*value="sandbox"|value="sandbox"[^>]*selected/);
  });

  it('lleva las cuatro etiquetas oficiales y el botón que pide el diseño', () => {
    for (const label of [
      'Llave pública',
      'Llave privada',
      'Secreto de Eventos',
      'Secreto de Integridad',
    ]) {
      expect(html, label).toContain(label);
    }
    expect(html).toContain('Guardar llaves');
  });

  /* La ayuda de cada campo dice el prefijo del ambiente que está seleccionado. */
  it('enseña los prefijos de Sandbox mientras Sandbox esté seleccionado', () => {
    for (const prefix of ['pub_test_', 'prv_test_', 'test_events_', 'test_integrity_']) {
      expect(html, prefix).toContain(prefix);
    }
    for (const prefix of ['pub_prod_', 'prv_prod_', 'prod_events_', 'prod_integrity_']) {
      expect(html, prefix).not.toContain(prefix);
    }
  });

  it('resume el estado en dos palabras, sin contadores ni relojes', () => {
    expect(html).toContain('Configurado');
    // «Configurado» no es «Verificado», y el contrato solo puede probar la llave pública.
    expect(html).not.toContain('Verificado');

    const sinConfigurar = renderToStaticMarkup(
      <WompiCredentialsForm
        canManage
        integration={integration({ sandbox: environmentConfig({ configured: false }) })}
      />,
    );
    expect(sinConfigurar).toContain('Sin configurar');
  });

  /*
   * Lo que se quitó, y que esta prueba impide que vuelva por descuido: la pantalla hace una cosa.
   */
  it('no vuelve a llevar el resumen operativo, los relojes ni la prueba de conexión', () => {
    for (const removed of [
      'Resumen operativo',
      'Último intento de webhook',
      'Último webhook verificado',
      'Última reconciliación',
      'Versión de la configuración',
      'Rotación de secretos',
      'Probar configuración',
      'API Gateway',
      'reconciliación',
    ]) {
      expect(html, removed).not.toContain(removed);
    }
  });

  /* La URL de eventos sí se queda: Wompi la pide por ambiente, en su propio panel. */
  it('conserva la URL de eventos en un bloque plegado', () => {
    expect(html).toContain('Configuración avanzada');
    expect(html).toContain('<details');
    expect(html).toContain('https://api.example.invalid/v1/webhooks/wompi');
    // Plegado: sin `open`, no ocupa la pantalla.
    expect(html).not.toMatch(/<details[^>]*\sopen/);
  });

  it('sin permiso de gestión no ofrece guardar', () => {
    const readOnly = renderToStaticMarkup(
      <WompiCredentialsForm canManage={false} integration={integration()} />,
    );

    expect(readOnly).not.toContain('Guardar llaves');
    expect(readOnly).toContain('no editar sus llaves');
    // Y los campos quedan deshabilitados, no solo ocultos: el botón no es la única barrera visual.
    expect((readOnly.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  /* Accesibilidad: cada campo con su etiqueta, su ayuda y una región viva para el resultado. */
  it('cada campo tiene etiqueta asociada y ayuda descrita', () => {
    for (const field of ['publicKey', 'privateKey', 'eventsSecret', 'integritySecret']) {
      expect(html, field).toContain(`for="wompi-${field}"`);
      expect(html, field).toContain(`id="wompi-${field}"`);
      expect(html, field).toContain(`aria-describedby="wompi-${field}-hint"`);
      expect(html, field).toContain(`id="wompi-${field}-hint"`);
    }
    expect(html).toContain('for="wompi-environment"');
    expect(html).toContain('aria-live="polite"');
  });
});

describe('comprobación de llaves antes de enviar', () => {
  const SANDBOX = {
    publicKey: 'pub_test_aaaaaaaaaaaaaaaaaaaaaaaa1234',
    privateKey: 'prv_test_bbbbbbbbbbbbbbbbbbbbbbbb5678',
    eventsSecret: 'test_events_cccccccccccccccccccccccc',
    integritySecret: 'test_integrity_dddddddddddddddddddd',
  } as const;

  const PRODUCTION = {
    publicKey: 'pub_prod_eeeeeeeeeeeeeeeeeeeeeeee9012',
    privateKey: 'prv_prod_ffffffffffffffffffffffff3456',
    eventsSecret: 'prod_events_gggggggggggggggggggggggg',
    integritySecret: 'prod_integrity_hhhhhhhhhhhhhhhhhhhh',
  } as const;

  it('acepta el juego de Sandbox con Sandbox seleccionado', () => {
    expect(checkCredentials('sandbox', SANDBOX)).toEqual({ ok: true, values: SANDBOX });
  });

  it('acepta el juego de Producción con Producción seleccionado', () => {
    expect(checkCredentials('production', PRODUCTION)).toEqual({ ok: true, values: PRODUCTION });
  });

  /*
   * El error de verdad: el panel de Wompi enseña las llaves de producción por omisión, así que
   * pegarlas con el selector en Pruebas es lo más fácil del mundo. El mensaje dice qué hacer.
   */
  it('con Sandbox seleccionado y llaves de Producción, dice cambiar de ambiente', () => {
    const result = checkCredentials('sandbox', PRODUCTION);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe(
      'Estas llaves son de Producción. Cambia el ambiente a Producción para guardarlas.',
    );
    expect(result.fields).toEqual(['publicKey', 'privateKey', 'eventsSecret', 'integritySecret']);
  });

  it('con Producción seleccionado y llaves de Sandbox, dice lo equivalente', () => {
    const result = checkCredentials('production', SANDBOX);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe(
      'Estas llaves son de Pruebas. Cambia el ambiente a Pruebas para guardarlas.',
    );
  });

  /*
   * Tres de un ambiente y una del otro **no** es «el ambiente equivocado»: es una mezcla.
   *
   * Decir «cambia a Producción» ahí mandaría a alguien a dar vueltas, porque al cambiar quedarían
   * fuera las otras tres. Es el único caso en el que mover el selector no arregla nada, y por eso
   * tiene su propio mensaje.
   */
  it('una mezcla de ambientes se dice como mezcla, no como ambiente equivocado', () => {
    const result = checkCredentials('sandbox', {
      ...SANDBOX,
      integritySecret: PRODUCTION.integritySecret,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe('Las cuatro llaves deben pertenecer al mismo ambiente.');
    expect(result.fields).toEqual(['integritySecret']);
    expect(result.fieldMessage).toBe('Esta llave no es del mismo ambiente que las demás.');
  });

  /* Espacios exteriores: se recortan y se envía el valor limpio. */
  it('recorta los extremos y no toca el interior', () => {
    const result = checkCredentials('sandbox', {
      publicKey: ` ${SANDBOX.publicKey}\n`,
      privateKey: `\t${SANDBOX.privateKey}  `,
      eventsSecret: `  ${SANDBOX.eventsSecret}`,
      integritySecret: `${SANDBOX.integritySecret}\r\n`,
    });

    expect(result).toEqual({ ok: true, values: SANDBOX });

    const inner = checkCredentials('sandbox', {
      ...SANDBOX,
      publicKey: 'pub_test_aaaa aaaaaaaaaaaaaaaaaaa1234',
    });
    // Un espacio en medio no se «arregla»: el prefijo sigue siendo válido, y el backend lo rechaza.
    expect(inner.ok).toBe(true);
  });

  it('declara incompletos los campos en blanco y los nombra', () => {
    const result = checkCredentials('sandbox', {
      ...SANDBOX,
      eventsSecret: '',
      integritySecret: '   ',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fields).toEqual(['eventsSecret', 'integritySecret']);
    expect(result.message).toContain('Secreto de Eventos');
    expect(result.message).toContain('Secreto de Integridad');
  });

  it('rechaza algo que no es una llave de Wompi', () => {
    const result = checkCredentials('sandbox', { ...SANDBOX, publicKey: 'pegar_aqui_la_llave' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('no parecen llaves de Wompi');
  });

  it('reconoce el ambiente de cada prefijo oficial', () => {
    expect(detectCredentialEnvironment('publicKey', SANDBOX.publicKey)).toBe('sandbox');
    expect(detectCredentialEnvironment('privateKey', PRODUCTION.privateKey)).toBe('production');
    expect(detectCredentialEnvironment('eventsSecret', 'algo_raro')).toBeNull();
  });

  /* Ningún mensaje de esta comprobación puede llevar el valor que se pegó. */
  it('ningún mensaje repite la credencial rechazada', () => {
    for (const [environment, values] of [
      ['sandbox', PRODUCTION],
      ['production', SANDBOX],
      ['sandbox', { ...SANDBOX, publicKey: 'pegar_aqui_la_llave' }],
    ] as const) {
      const result = checkCredentials(environment, values);
      if (result.ok) continue;
      for (const value of Object.values(values)) {
        expect(result.message).not.toContain(value);
      }
    }
  });

  /* El conflicto de versión tiene su propio texto, y es el que pide el diseño. */
  it('traduce el conflicto de versión con el mensaje acordado', () => {
    expect(describeSaveFailure('integration_conflict')).toBe(
      'La configuración cambió. Revisa el estado y vuelve a guardar.',
    );
    expect(requiresReload('integration_conflict')).toBe(true);
    expect(requiresReload('credentials_incomplete')).toBe(false);
  });

  /* Guardar llaves de producción no puede afirmar que los cobros quedaron habilitados. */
  it('el bloqueo de producción no se cuenta como cobros habilitados', () => {
    const message = describeSaveFailure('live_payments_not_enabled');

    expect(message).toContain('siguen bloqueados');
    expect(message).not.toContain('habilitados correctamente');
  });
});

describe('la tarjeta de Wompi y los pagos reales', () => {
  const card = (overrides: Partial<WompiIntegration>) =>
    renderToStaticMarkup(
      <WompiProviderCard
        canManage
        integration={integration(overrides)}
        openIncidents={{ kind: 'exact', value: 0 }}
      />,
    );
  /** El valor del dato «Pagos reales», y solo ese: «Checkouts de prueba» tiene los suyos. */
  const livePayments = (html: string) => /Pagos reales<\/dt><dd[^>]*>([^<]*)</.exec(html)?.[1];
  const productionKeys = (enabled: boolean) =>
    environmentConfig({ publicKeyMasked: 'pub_prod_…c3d4', enabledForNewPayments: enabled });

  it('con el despliegue bloqueando, dice «Bloqueados» y que no es una casilla', () => {
    const html = card({ livePaymentsEnabled: false, production: productionKeys(false) });

    expect(livePayments(html)).toBe('Bloqueados');
    expect(html).toContain('Los bloquea el despliegue del backend');
  });

  /*
   * Que el despliegue permita cobrar no significa que se cobre. Antes la tarjeta decía
   * «Habilitados» en ese caso, y se leía como dinero real en marcha.
   */
  it('permitidos pero apagados se dicen «Desactivados», nunca «Habilitados»', () => {
    const html = card({ livePaymentsEnabled: true, production: productionKeys(false) });

    expect(livePayments(html)).toBe('Desactivados');
    expect(html).toContain('Se activan o desactivan en Configurar Wompi');
  });

  it('encendidos se dicen «Activos», lo que sale de production.enabledForNewPayments', () => {
    const html = card({ livePaymentsEnabled: true, production: productionKeys(true) });

    expect(livePayments(html)).toBe('Activos');
  });
});

describe('activar pagos de prueba es otra decisión', () => {
  const sandbox = (configured: boolean, enabled: boolean) =>
    integration({ sandbox: environmentConfig({ configured, enabledForNewPayments: enabled }) });

  /*
   * Sin las cuatro llaves **no se pinta nada**. Un botón deshabilitado invita a pulsarlo para
   * averiguar por qué; lo que falta ya lo dice la insignia de credenciales, justo encima.
   */
  it('con Sandbox incompleto el control no existe', () => {
    const html = renderToStaticMarkup(
      <SandboxPaymentsToggle canManage integration={sandbox(false, false)} />,
    );

    expect(html).toBe('');
  });

  it('configurado y apagado ofrece activarlo', () => {
    const html = renderToStaticMarkup(
      <SandboxPaymentsToggle canManage integration={sandbox(true, false)} />,
    );

    expect(html).toContain('Activar pagos de prueba');
    expect(html).toContain('Pagos de prueba desactivados');
    expect(html).not.toContain('Desactivar pagos de prueba');
    // El botón está vivo: con las llaves puestas, activarlo es una acción posible.
    expect(html).not.toContain('disabled');
  });

  it('configurado y encendido enseña el estado y ofrece desactivarlo', () => {
    const html = renderToStaticMarkup(
      <SandboxPaymentsToggle canManage integration={sandbox(true, true)} />,
    );

    expect(html).toContain('Pagos de prueba activos');
    expect(html).toContain('Desactivar pagos de prueba');
    expect(html).not.toContain('Activar pagos de prueba');
    // El verde va acompañado de su texto: quien no distingue el color lee lo mismo.
    expect(html).toContain('data-state="active"');
  });

  it('desactivar no promete borrar nada', () => {
    const html = renderToStaticMarkup(
      <SandboxPaymentsToggle canManage integration={sandbox(true, true)} />,
    );

    expect(html).toContain('no borra nada');
    expect(html).toContain('los pagos en vuelo se siguen cerrando');
  });

  /*
   * El cuerpo lleva el ambiente fijo, la versión vigente y **solo** el interruptor. Ninguna
   * credencial: esta operación no las toca, y mandarlas escribiría una versión nueva en el almacén
   * de secretos cada vez que alguien enciende o apaga.
   */
  it('manda environment sandbox, la versión vigente y ninguna credencial', () => {
    const source = executable(readFileSync('src/features/panel/wompi-operations.tsx', 'utf8'));
    const call = source.slice(
      source.indexOf('updateWompiIntegration({'),
      source.indexOf('});', source.indexOf('updateWompiIntegration({')),
    );

    expect(call).toContain('expectedVersion: integration.version');
    expect(call).toContain("environment: 'sandbox'");
    expect(call).toContain('enabledForNewPayments: !enabled');

    for (const field of ['publicKey', 'privateKey', 'eventsSecret', 'integritySecret']) {
      expect(call, field).not.toContain(field);
    }
  });

  /*
   * El ambiente no sale del selector: va escrito. Si saliera del selector, tener Producción
   * elegido y pulsar aquí mandaría `environment: "production"`.
   */
  it('el ambiente no depende de lo que esté seleccionado', () => {
    const source = executable(readFileSync('src/features/panel/wompi-operations.tsx', 'utf8'));

    expect(source).not.toContain('environment,\n      enabledForNewPayments');
    expect(source).toContain("environment: 'sandbox'");
  });

  /*
   * El interruptor de Pruebas no tiene rama de Producción: el formulario decide cuál de los dos
   * controles pinta, y cada uno lleva su ambiente escrito.
   */
  it('el formulario pinta el control de cada ambiente, no uno que dependa del selector', () => {
    const form = executable(readFileSync('src/features/panel/wompi-credentials-form.tsx', 'utf8'));

    expect(form).toMatch(
      /environment === 'sandbox' \?[\s\S]*?<SandboxPaymentsToggle[\s\S]*?<ProductionPaymentsControl/,
    );
    expect(form).not.toMatch(/<SandboxPaymentsToggle[^>]*environment=/);
  });

  it('sin integrations.manage se ve el estado pero no el botón', () => {
    const html = renderToStaticMarkup(
      <SandboxPaymentsToggle canManage={false} integration={sandbox(true, true)} />,
    );

    expect(html).toContain('Pagos de prueba activos');
    expect(html).not.toContain('<button');
  });

  it('un conflicto de versión se traduce y provoca una relectura', () => {
    const source = executable(readFileSync('src/features/panel/wompi-operations.tsx', 'utf8'));

    expect(source).toContain('describeSaveFailure(result.code)');
    expect(source).toContain('if (requiresReload(result.code)) router.refresh()');
    // Nada de reintentar solo con la versión vieja.
    expect(source).not.toContain('setTimeout');
    expect(describeSaveFailure('integration_conflict')).toBe(
      'La configuración cambió. Revisa el estado y vuelve a guardar.',
    );
  });

  it('ninguna credencial aparece en el HTML del control, ni en sus errores', () => {
    const html = renderToStaticMarkup(
      <SandboxPaymentsToggle canManage integration={sandbox(true, true)} />,
    );

    for (const needle of [
      'pub_test_',
      'prv_test_',
      'test_events_',
      'test_integrity_',
      'pub_prod_',
    ]) {
      expect(html, needle).not.toContain(needle);
    }

    const source = executable(readFileSync('src/features/panel/wompi-operations.tsx', 'utf8'));

    // El mensaje sale del código traducido, nunca de un valor ni del texto del backend.
    expect(source).not.toContain('result.message');
    expect(source).toContain('setFailure(describeSaveFailure(result.code))');
  });

  /* La simplificación no se deshace: el control es uno, y no vuelve nada de lo retirado. */
  it('no reintroduce las tarjetas retiradas', () => {
    const html = renderToStaticMarkup(
      <SandboxPaymentsToggle canManage integration={sandbox(true, true)} />,
    );

    for (const needle of ['Probar conexión', 'Revocar', 'Resumen operativo', 'Versión']) {
      expect(html, needle).not.toContain(needle);
    }
  });
});

describe('URL de eventos', () => {
  const html = renderToStaticMarkup(
    <CopyableValue
      hint="Solo lectura."
      label="URL de eventos (pruebas)"
      value="https://api.example.invalid/v1/webhooks/wompi"
    />,
  );

  it('viene del backend y se muestra de solo lectura', () => {
    expect(html).toContain('readOnly');
    expect(html).toContain('https://api.example.invalid/v1/webhooks/wompi');
  });

  it('ofrece copiarla', () => {
    expect(html).toContain('Copiar');
  });
});

describe('Addi', () => {
  const html = renderToStaticMarkup(<AddiProviderCard />);

  it('se anuncia como pendiente', () => {
    expect(html).toContain('Pendiente de integración');
  });

  /* Sin botones: no hay endpoint que llamar, y un botón muerto prometería una integración. */
  it('no monta ningún control ni enlace', () => {
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('<form');
  });

  it('no inventa credenciales, ambientes ni cifras', () => {
    for (const needle of ['addi_', 'Sandbox activo', 'Configurado', 'Ventas']) {
      expect(html, needle).not.toContain(needle);
    }
  });
});

/** El código sin comentarios: aquí se explica por qué no se usa `localStorage`, y nombrarlo no es usarlo. */
function executable(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('a quién llama el navegador', () => {
  const CLIENT = executable(readFileSync('src/features/panel/integrations-client.ts', 'utf8'));

  /*
   * El navegador habla **solo** con rutas locales. Una llamada directa a Wompi necesitaría la
   * llave privada en el cliente, y una a Firestore o a Secret Manager rompería la frontera entera.
   */
  it('solo llama a rutas locales del BFF', () => {
    const urls = [...CLIENT.matchAll(/fetch\(\s*([^,]+),/g)].map((match) => match[1] ?? '');

    expect(urls.length).toBeGreaterThan(0);

    for (const needle of [
      'wompi.co',
      'sandbox.wompi.co',
      'googleapis.com',
      'firestore',
      'secretmanager',
    ]) {
      expect(CLIENT, needle).not.toContain(needle);
    }
  });

  it('no guarda nada en el navegador', () => {
    for (const needle of ['localStorage', 'sessionStorage', 'document.cookie', 'indexedDB']) {
      expect(CLIENT, needle).not.toContain(needle);
    }
  });

  /* La prueba de conexión pasa por el BFF, no por el proveedor. */
  it('la prueba de conexión llama a la ruta local', () => {
    expect(CLIENT).toContain('/api/admin/integrations/wompi/test');
  });
});

describe('el formulario no filtra por otras vías', () => {
  const FORM = executable(readFileSync('src/features/panel/wompi-credentials-form.tsx', 'utf8'));
  const CHECK = executable(readFileSync('src/features/panel/wompi-credential-check.ts', 'utf8'));

  it('no guarda credenciales fuera del estado del componente', () => {
    for (const source of [FORM, CHECK]) {
      for (const needle of [
        'localStorage',
        'sessionStorage',
        'document.cookie',
        'indexedDB',
        'searchParams',
        'router.push',
      ]) {
        expect(source, needle).not.toContain(needle);
      }
    }
  });

  /* Tampoco a través de un registro: los parámetros son las cuatro credenciales en claro. */
  it('no registra nada', () => {
    for (const source of [FORM, CHECK]) {
      for (const needle of ['console.log', 'console.error', 'console.warn']) {
        expect(source, needle).not.toContain(needle);
      }
    }
  });

  /*
   * Lo escrito se conserva cuando el guardado falla, y se vacía **solo** al guardar bien. Pegar
   * cuatro credenciales cuesta, y un fallo de red no es motivo para obligar a repetirlo; una vez
   * guardadas, en cambio, no hay ninguna razón para dejarlas en el DOM.
   */
  it('vacía los campos solo después de guardar correctamente', () => {
    const save = FORM.slice(FORM.indexOf('async function save'));
    const success = save.indexOf('if (result.ok)');
    const reset = save.indexOf('setValues({ ...EMPTY_CREDENTIALS })');
    const failure = save.indexOf('setFailure(describeSaveFailure(result.code))');

    expect(reset).toBeGreaterThan(success);
    expect(reset).toBeLessThan(failure);
    // Y no hay ningún otro vaciado suelto en el camino de error.
    expect(save.slice(failure).includes('setValues({ ...EMPTY_CREDENTIALS })')).toBe(false);
  });

  /* Ningún valor entra en el mensaje de error: se enseña el texto traducido, nunca lo escrito. */
  it('no pone valores en los mensajes de error', () => {
    expect(FORM).toContain('describeSaveFailure(result.code)');
    expect(FORM).not.toMatch(/setFailure\([^)]*values\./);
  });

  /* El ambiente seleccionado es lo que viaja en el cuerpo. */
  it('manda el ambiente seleccionado, no una constante', () => {
    const save = FORM.slice(FORM.indexOf('async function save'));

    expect(save).toContain('environment,');
    expect(save).not.toContain("environment: 'sandbox'");
    expect(save).not.toContain("environment: 'production'");
  });

  /* `expectedVersion` viaja siempre: sin él no hay control de concurrencia. */
  it('conserva el control optimista', () => {
    expect(FORM).toContain('expectedVersion: integration.version');
  });

  /* El recorte ocurre antes de enviar, en la comprobación pura. */
  it('recorta antes de enviar', () => {
    expect(CHECK).toContain('.trim()');
    const save = FORM.slice(FORM.indexOf('async function save'));
    expect(save.indexOf('checkCredentials(environment, values)')).toBeLessThan(
      save.indexOf('updateWompiIntegration('),
    );
  });
});

describe('la pantalla no llama a Wompi ni se desborda', () => {
  const PAGE = executable(
    readFileSync('src/app/panel/configuracion/integraciones/wompi/page.tsx', 'utf8'),
  );
  const CSS = readFileSync('src/features/panel/integrations.module.css', 'utf8');

  it('la página no conoce a Wompi ni a Google', () => {
    for (const needle of ['wompi.co', 'googleapis.com', 'secretmanager', 'firestore']) {
      expect(PAGE, needle).not.toContain(needle);
    }
  });

  /*
   * Sin overflow a 1440, 1280, 1024, 768, 390 y 360 px.
   *
   * No hay navegador en las pruebas, así que se comprueba lo que produce el desbordamiento: un
   * ancho fijo en píxeles, un mínimo de rejilla sin `min()` o una columna que no puede encogerse.
   * La tarjeta se acota con `max-width` en `rem`, la rejilla de campos usa
   * `minmax(min(100%, …), 1fr)` y las filas flexibles envuelven.
   */
  it('no hay anchos fijos que puedan desbordar una pantalla estrecha', () => {
    expect(CSS).not.toMatch(/\bwidth:\s*\d{3,}px/);
    expect(CSS).not.toMatch(/\bmin-width:\s*\d{3,}px/);
  });

  it('la tarjeta se acota en rem y la rejilla de campos puede encogerse', () => {
    expect(CSS).toContain('max-width: 44rem');
    expect(CSS).toContain('grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr))');
  });

  it('la fila de ambiente y estado se apila en pantallas estrechas', () => {
    const narrow = CSS.slice(CSS.indexOf('@media (max-width: 40rem)'));

    expect(narrow).toContain('.environmentRow');
    expect(narrow).toContain('grid-template-columns: minmax(0, 1fr)');
  });

  it('las filas flexibles envuelven en lugar de empujar', () => {
    for (const block of ['.environmentRow', '.formActions', '.copyRow']) {
      const start = CSS.indexOf(`${block} {`);
      expect(start, block).toBeGreaterThan(-1);
      expect(CSS.slice(start, start + 220), block).toContain('flex-wrap: wrap');
    }
  });
});

describe('cuántas incidencias abiertas hay', () => {
  /** Una página con `count` incidencias y, si se pide, cursor a la siguiente. */
  function incidentPage(count: number, nextPageToken: string | null): PaymentIncidentPage {
    return {
      items: Array.from({ length: count }, (_unused, index) => ({ id: `pin_${index}` })),
      nextPageToken,
    } as unknown as PaymentIncidentPage;
  }

  /*
   * La prueba que motiva todo este tipo.
   *
   * La tarjeta pide una sola página de 50. Si el backend devuelve 50 resultados **y** un cursor,
   * quedan más: decir «50» sería una cifra falsa, y quien la lee decide con ella. Esta prueba falla
   * si alguien vuelve a presentar `items.length` como si fuera el total.
   */
  it('cincuenta con cursor son «50 o más», nunca «50»', () => {
    const count = readOpenIncidentCount(incidentPage(50, 'cursor-opaco'));

    expect(count).toEqual({ kind: 'atLeast', value: 50 });
    expect(describeOpenIncidentCount(count)).toBe('50 o más');
    expect(describeOpenIncidentCount(count)).not.toBe('50');
  });

  /* Y la tarjeta tiene que pintarlo así, no solo calcularlo bien. */
  it('la tarjeta lo escribe como «50 o más» y explica por qué', () => {
    const html = renderToStaticMarkup(
      <WompiProviderCard
        canManage
        integration={integration()}
        openIncidents={readOpenIncidentCount(incidentPage(50, 'cursor-opaco'))}
      />,
    );

    expect(html).toContain('50 o más');
    expect(html).toContain('La bandeja pagina');
    // El «50» a secas no puede aparecer como valor de la fila.
    expect(html).not.toMatch(/>50</);
  });

  /*
   * Sin cursor, esa página es todo lo que hay: el número es exacto aunque venga llena. Que una
   * página llegue llena no dice nada del total; lo dice el cursor.
   */
  it('sin cursor el número es exacto, aunque la página venga llena', () => {
    expect(readOpenIncidentCount(incidentPage(50, null))).toEqual({ kind: 'exact', value: 50 });
    expect(describeOpenIncidentCount({ kind: 'exact', value: 50 })).toBe('50');
  });

  it('una bandeja vacía es un cero exacto', () => {
    const count = readOpenIncidentCount(incidentPage(0, null));

    expect(count).toEqual({ kind: 'exact', value: 0 });
    expect(describeOpenIncidentCount(count)).toBe('0');
  });

  /* Que la lectura falle no es que no haya incidencias: es que no se sabe. */
  it('un fallo de lectura no se confunde con cero', () => {
    expect(describeOpenIncidentCount(OPEN_INCIDENTS_UNAVAILABLE)).toBe('No disponible');
    expect(describeOpenIncidentCount(OPEN_INCIDENTS_UNAVAILABLE)).not.toBe('0');
  });

  it('la tarjeta conserva «No disponible» cuando la consulta falló', () => {
    const html = renderToStaticMarkup(
      <WompiProviderCard
        canManage
        integration={integration()}
        openIncidents={OPEN_INCIDENTS_UNAVAILABLE}
      />,
    );

    expect(html).toContain('No disponible');
  });

  /*
   * El contador sale de **una** consulta. Recorrer la bandeja entera convertiría una tarjeta de
   * resumen en tantas llamadas como páginas haya, y consultar el Dashboard para esto mezclaría dos
   * superficies que responden preguntas distintas.
   */
  it('la tarjeta se compone con una sola consulta, sin recorrer páginas', () => {
    const page = executable(
      readFileSync('src/app/panel/configuracion/integraciones/page.tsx', 'utf8'),
    );

    expect(page.match(/listPaymentIncidents\(/g) ?? []).toHaveLength(1);
    expect(page).not.toContain('nextPageToken');
    expect(page).not.toContain('while');
    expect(page).not.toContain('getDashboardSummary');
  });
});

/**
 * Lo que pasa cuando algo está mal: dónde se dice y dónde queda el cursor.
 *
 * Con cuatro campos `type="password"` —los cuatro idénticos en pantalla y ninguno enseñando su
 * contenido— un único mensaje al pie no dice en cuál está el problema. Antes había que adivinarlo.
 */
describe('errores por campo y foco', () => {
  const SANDBOX_KEYS = {
    publicKey: 'pub_test_aaaaaaaaaaaaaaaaaaaaaaaa1234',
    privateKey: 'prv_test_bbbbbbbbbbbbbbbbbbbbbbbb5678',
    eventsSecret: 'test_events_cccccccccccccccccccccccc',
    integritySecret: 'test_integrity_dddddddddddddddddddd',
  } as const;

  const PRODUCTION_KEYS = {
    publicKey: 'pub_prod_eeeeeeeeeeeeeeeeeeeeeeee9012',
    privateKey: 'prv_prod_ffffffffffffffffffffffff3456',
    eventsSecret: 'prod_events_gggggggggggggggggggggggg',
    integritySecret: 'prod_integrity_hhhhhhhhhhhhhhhhhhhh',
  } as const;

  it('cada fallo trae un texto corto para pintar junto al campo', () => {
    const cases = [
      [checkCredentials('sandbox', PRODUCTION_KEYS), 'Es una llave de Producción.'],
      [
        checkCredentials('sandbox', { ...SANDBOX_KEYS, privateKey: PRODUCTION_KEYS.privateKey }),
        'Esta llave no es del mismo ambiente que las demás.',
      ],
      [
        checkCredentials('sandbox', { ...SANDBOX_KEYS, eventsSecret: 'hola' }),
        'No parece una llave de Wompi.',
      ],
      [
        checkCredentials('sandbox', { ...SANDBOX_KEYS, integritySecret: '  ' }),
        'Esta llave es obligatoria.',
      ],
    ] as const;

    for (const [result, expected] of cases) {
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.fieldMessage).toBe(expected);
      expect(result.fields.length).toBeGreaterThan(0);
    }
  });

  it('ningún texto por campo repite la credencial', () => {
    const values = { ...SANDBOX_KEYS, privateKey: PRODUCTION_KEYS.privateKey };
    const result = checkCredentials('sandbox', values);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    for (const value of Object.values(values)) {
      expect(result.fieldMessage).not.toContain(value);
      expect(result.message).not.toContain(value);
    }
  });

  it('señala el primer campo incompleto, que es al que va el foco', () => {
    const result = checkCredentials('sandbox', {
      ...SANDBOX_KEYS,
      privateKey: '',
      integritySecret: '',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // El orden es el del formulario, así que el primero de la lista es el primero de la pantalla.
    expect(result.fields[0]).toBe('privateKey');
  });

  it('el formulario lleva el foco al primero señalado', () => {
    const source = executable(
      readFileSync('src/features/panel/wompi-credentials-form.tsx', 'utf8'),
    );

    expect(source).toContain('inputs.current[check.fields[0]');
    expect(source).toContain('?.focus()');
    // El foco se mueve al rechazar, no al enviar: enviar bien no debe robar el cursor.
    expect(source).toMatch(/function reject\([\s\S]*?focus\(\)/);
  });

  it('el error y la ayuda se anuncian los dos, y el error primero', () => {
    const source = readFileSync('src/features/panel/wompi-credentials-form.tsx', 'utf8');

    expect(source).toContain('aria-describedby={error === null ? hintId : `${errorId} ${hintId}`}');
    expect(source).toContain('aria-invalid={error !== null}');
    expect(source).toContain('role="alert"');
  });

  /*
   * Sensibilidad del vaciado: los valores se conservan en **todos** los caminos de error, y el
   * único `setValues(EMPTY_CREDENTIALS)` vive dentro de la rama de éxito.
   */
  it('ningún camino de error toca lo escrito', () => {
    const source = executable(
      readFileSync('src/features/panel/wompi-credentials-form.tsx', 'utf8'),
    );

    expect(source.match(/setValues\(\{ \.\.\.EMPTY_CREDENTIALS \}\)/g) ?? []).toHaveLength(1);

    const failureBranch = source.slice(
      source.indexOf('} else {'),
      source.indexOf('running.current = false'),
    );

    expect(failureBranch).toContain('setFailure(describeSaveFailure(result.code))');
    expect(failureBranch).not.toContain('setValues');
  });

  it('un conflicto conserva lo escrito y pide revisar antes de reintentar', () => {
    expect(describeSaveFailure('integration_conflict')).toBe(
      'La configuración cambió. Revisa el estado y vuelve a guardar.',
    );
    expect(requiresReload('integration_conflict')).toBe(true);
    // Recargar el Server Component no vuelve a montar el formulario con los campos vacíos: lo que
    // se relee es el estado de la integración, no el borrador.
    expect(requiresReload('credentials_incomplete')).toBe(false);
  });
});
