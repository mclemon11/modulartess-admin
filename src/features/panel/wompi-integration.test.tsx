import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
}));

const { WompiCredentialsForm } = await import('./wompi-credentials-form');
const { WompiConnectionTester, WompiEnableToggle, WompiRevokeRetiredSecrets } =
  await import('./wompi-operations');
const { AddiProviderCard, WompiProviderCard } = await import('./integration-cards');
const { describeOpenIncidentCount, OPEN_INCIDENTS_UNAVAILABLE, readOpenIncidentCount } =
  await import('./integration-labels');
const { CopyableValue } = await import('./copyable-value');

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

describe('credenciales: write-only de verdad', () => {
  const html = renderToStaticMarkup(<WompiCredentialsForm canManage integration={integration()} />);

  /*
   * La prueba central de toda esta superficie. Si alguien precargara los campos con lo que
   * devuelve el backend —o si el backend empezara a devolverlos— esto lo dice.
   */
  it('ningún valor de credencial aparece en el HTML', () => {
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

  it('los cuatro son campos de contraseña y no se autocompletan', () => {
    const passwords = html.match(/type="password"/g) ?? [];

    expect(passwords).toHaveLength(4);
    expect(html.match(/autoComplete="new-password"/g) ?? []).toHaveLength(4);
  });

  /* Un campo vacío conserva el valor guardado: es la semántica que declara el contrato. */
  it('dice que dejar un campo vacío conserva el valor actual', () => {
    expect(html).toContain('Deja un campo vacío para conservar el valor actual');
  });

  /*
   * «Configurado» no es «verificado». El contrato solo puede probar la llave pública, y de las
   * otras tres sabe únicamente que hay una versión guardada.
   */
  it('dice «Configurado», nunca «Verificado», de los secretos guardados', () => {
    expect(html).toContain('Configurado');
    expect(html).not.toContain('Verificado');
  });

  it('enseña la llave pública solo enmascarada', () => {
    expect(html).toContain('pub_test_…a1b2');
    expect(html).not.toContain(NEVER_RENDERED.fullPublicKey);
  });

  it('sin permiso de gestión no ofrece guardar', () => {
    const readOnly = renderToStaticMarkup(
      <WompiCredentialsForm canManage={false} integration={integration()} />,
    );

    expect(readOnly).not.toContain('Guardar credenciales');
    expect(readOnly).toContain('no editar sus credenciales');
    // Y los campos quedan deshabilitados, no solo ocultos: el botón no es la única barrera visual.
    expect((readOnly.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});

describe('los tres relojes operativos', () => {
  const html = renderToStaticMarkup(
    <WompiProviderCard
      canManage
      integration={integration()}
      openIncidents={{ kind: 'exact', value: 2 }}
    />,
  );

  /*
   * Es la confusión que hace leer una integración rota como una sana: algo llega a la ruta, la
   * fecha se mueve, y nadie se entera de que ningún evento pasó la verificación de firma.
   */
  it('lleva tres etiquetas distintas, no tres formas de decir lo mismo', () => {
    expect(html).toContain('Último intento de webhook');
    expect(html).toContain('Último webhook verificado');
    expect(html).toContain('Última reconciliación');
  });

  it('explica que un intento no afirma autenticidad', () => {
    expect(html).toContain('No afirma que el evento fuera auténtico');
  });

  it('explica que la reconciliación no es un webhook', () => {
    expect(html).toContain('No es un webhook');
  });
});

describe('producción bloqueada', () => {
  it('la tarjeta dice que los pagos reales están bloqueados', () => {
    const html = renderToStaticMarkup(
      <WompiProviderCard
        canManage
        integration={integration()}
        openIncidents={{ kind: 'exact', value: 0 }}
      />,
    );

    expect(html).toContain('Bloqueados');
    expect(html).toContain('constante del backend');
  });

  /*
   * El bloqueo lo reporta el backend y la pantalla lo refleja. Si algún día
   * `livePaymentsEnabled` llegara en `true`, esta prueba deja de exigir «Bloqueados» y pide lo
   * contrario: es el contrato el que manda, no una constante escrita en el panel.
   */
  it('refleja lo que dice el backend, no una constante propia', () => {
    const html = renderToStaticMarkup(
      <WompiProviderCard
        canManage
        integration={integration({ livePaymentsEnabled: true })}
        openIncidents={{ kind: 'exact', value: 0 }}
      />,
    );

    expect(html).toContain('Habilitados');
  });
});

describe('habilitar y deshabilitar', () => {
  it('sin las cuatro credenciales no deja habilitar', () => {
    const html = renderToStaticMarkup(
      <WompiEnableToggle
        canManage
        integration={integration({
          sandbox: environmentConfig({ configured: false, enabledForNewPayments: false }),
        })}
      />,
    );

    expect(html).toContain('disabled');
    expect(html).toContain('Faltan credenciales');
  });

  it('sin permiso de gestión no se pinta', () => {
    expect(
      renderToStaticMarkup(<WompiEnableToggle canManage={false} integration={integration()} />),
    ).toBe('');
  });
});

describe('revocación inmediata', () => {
  const html = renderToStaticMarkup(
    <WompiRevokeRetiredSecrets canManage integration={integration()} />,
  );

  it('explica el periodo de gracia y por qué existe', () => {
    expect(html).toContain('25 horas');
    expect(html).toContain('no perder los reintentos');
  });

  /* Es destructiva: el botón no aplica nada, abre una confirmación que dice el precio. */
  it('no revoca al primer clic: abre una confirmación', () => {
    expect(html).toContain('Revocar versiones retiradas');
    expect(html).not.toContain('Revocar ahora');
  });

  it('sin versiones retiradas no hay nada que revocar', () => {
    const none = renderToStaticMarkup(
      <WompiRevokeRetiredSecrets
        canManage
        integration={integration({
          sandbox: environmentConfig({ retiredEventsSecretCount: 0 }),
        })}
      />,
    );

    expect(none).toContain('No hay versiones retiradas');
    expect(none).toContain('disabled');
  });

  it('sin permiso de gestión no se pinta', () => {
    expect(
      renderToStaticMarkup(
        <WompiRevokeRetiredSecrets canManage={false} integration={integration()} />,
      ),
    ).toBe('');
  });
});

describe('prueba de conexión', () => {
  it('dice lo que puede probar y lo que no', () => {
    const html = renderToStaticMarkup(<WompiConnectionTester canManage />);

    expect(html).toContain('Probar configuración');
  });

  it('sin permiso de gestión explica por qué no se ofrece', () => {
    const html = renderToStaticMarkup(<WompiConnectionTester canManage={false} />);

    expect(html).not.toContain('<button');
    expect(html).toContain('llamada saliente');
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

  it('no guarda credenciales fuera del estado del componente', () => {
    for (const needle of [
      'localStorage',
      'sessionStorage',
      'document.cookie',
      'searchParams',
      'router.push',
    ]) {
      expect(FORM, needle).not.toContain(needle);
    }
  });

  /*
   * Los campos se vacían pasara lo que pasara. Conservarlos «para no perder lo escrito» dejaría
   * cuatro credenciales en el DOM hasta que alguien cambiara de pantalla.
   */
  it('vacía los campos también cuando la petición falla', () => {
    const save = FORM.slice(FORM.indexOf('async function save'));
    const reset = save.indexOf('setValues({ ...EMPTY })');
    const failure = save.indexOf('setFailure(result.code)');

    expect(reset).toBeGreaterThan(0);
    expect(reset).toBeLessThan(failure);
  });

  /* Un campo vacío no viaja: guardaría una versión sin valor en el almacén de secretos. */
  it('no manda los campos que quedaron vacíos', () => {
    expect(FORM).toContain('values.publicKey.length > 0');
    expect(FORM).toContain('values.privateKey.length > 0');
    expect(FORM).toContain('values.eventsSecret.length > 0');
    expect(FORM).toContain('values.integritySecret.length > 0');
  });

  /* Ningún valor entra en el mensaje de error: lo que se enseña es el código traducido del BFF. */
  it('no pone valores en los mensajes de error', () => {
    expect(FORM).toContain('describeOrderFailure(failure)');
    expect(FORM).not.toMatch(/setFailure\([^)]*values\./);
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
