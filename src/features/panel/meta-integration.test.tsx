import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { parseMetaActivation, parseMetaTest, parseMetaUpdate } from './integration-input';
import {
  buildMetaUpdate,
  describeMetaError,
  describeMetaFailure,
  describeMetaToken,
  isMetaConfirmation,
  metaActivationBlocker,
  metaActivationRequest,
  metaHealth,
  normalizeMetaTestCode,
} from './meta-integration';

import type { MetaIntegration } from '@/lib/api/integrations';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
}));

const { MetaSettings } = await import('./meta-settings');
const { MetaProviderCard } = await import('./integration-cards');

/** Meta en el panel. Valores con aspecto de credencial: inventados. */
const TOKEN = 'TOKEN-PRUEBA-NUNCA-DEVUELTO-9fA2';

function integration(overrides: Partial<MetaIntegration> = {}): MetaIntegration {
  return {
    provider: 'meta',
    version: 4,
    enabled: false,
    active: false,
    configured: true,
    missing: [],
    pixelId: '1234567890123456',
    accessTokenConfigured: true,
    accessTokenHint: '…9fA2',
    feedUrl: 'https://api.example.invalid/v1/feeds/google-merchant.xml',
    lastTestedAt: '2026-11-18T12:00:00.000Z',
    lastTestStatus: 'passed',
    lastEventAt: null,
    lastErrorCode: null,
    lastErrorAt: null,
    ...overrides,
  };
}

const UNCONFIGURED = integration({
  configured: false,
  missing: ['pixelId', 'accessToken'],
  pixelId: null,
  accessTokenConfigured: false,
  accessTokenHint: null,
  lastTestedAt: null,
  lastTestStatus: null,
});

describe('token de solo escritura', () => {
  it('solo enseña la pista del backend o «Sin configurar»', () => {
    expect(describeMetaToken(integration())).toBe('Guardado · termina en 9fA2');
    expect(describeMetaToken(integration({ accessTokenHint: null }))).toBe('Guardado');
    expect(describeMetaToken(UNCONFIGURED)).toBe('Sin configurar');
  });

  it('la pantalla no re-muestra el token y usa un campo de contraseña vacío', () => {
    const html = renderToStaticMarkup(<MetaSettings canManage integration={integration()} />);

    expect(html).not.toContain(TOKEN);
    expect(html.match(/type="password"/g)).toHaveLength(1);
    expect(html.toLowerCase()).toContain('autocomplete="new-password"');
    expect(html).not.toMatch(/type="password"[^>]*value="[^"]+"/);
    expect(html).toContain('termina en 9fA2');
    expect(html).toContain('Déjalo vacío para conservar');
    // El ID del conjunto de datos no es un secreto: se precarga.
    expect(html).toContain('id="meta-pixel-id"');
    expect(html).toContain('id="meta-access-token"');
    expect(html).toContain('solo números');
    expect(html).toContain('Generar token de acceso');
    expect(html).toContain('value="1234567890123456"');
  });

  it('enseña la URL del feed del catálogo con su instrucción', () => {
    const html = renderToStaticMarkup(<MetaSettings canManage integration={integration()} />);

    expect(html).toContain('https://api.example.invalid/v1/feeds/google-merchant.xml');
    expect(html).toContain('«Modulartess Web»');
  });

  it('explica dónde sale el código de eventos de prueba', () => {
    const html = renderToStaticMarkup(<MetaSettings canManage integration={integration()} />);

    expect(html).toContain('Código de eventos de prueba');
    expect(html).toContain('id="meta-test-event-code"');
    expect(html).toContain('«Probar eventos»');
    expect(html).toContain('no cuenta como conversión');
  });
});

describe('conservar o reemplazar', () => {
  it('lo vacío no viaja: solo el token escrito y el ID cambiado', () => {
    expect(
      buildMetaUpdate(integration(), {
        pixelId: '1234567890123456',
        accessToken: ` ${TOKEN} `,
      }),
    ).toEqual({ ok: true, body: { expectedVersion: 4, accessToken: TOKEN } });
    expect(
      buildMetaUpdate(integration(), { pixelId: '6543210987654321', accessToken: '' }),
    ).toEqual({
      ok: true,
      body: { expectedVersion: 4, pixelId: '6543210987654321' },
    });
  });

  it('sin cambios no hay llamada', () => {
    expect(
      buildMetaUpdate(integration(), { pixelId: '1234567890123456', accessToken: '' }),
    ).toMatchObject({ ok: false, fields: [] });
  });

  it('un ID que no sean solo dígitos, o un token sin forma, se señala en su campo', () => {
    for (const pixelId of ['PIXEL123456789', '12345 67890123', '123456789']) {
      expect(buildMetaUpdate(integration(), { pixelId, accessToken: '' })).toMatchObject({
        ok: false,
        fields: ['pixelId'],
      });
    }
    for (const accessToken of ['corto', 'TOKEN CON ESPACIO 0123456789']) {
      expect(
        buildMetaUpdate(integration(), { pixelId: '1234567890123456', accessToken }),
      ).toMatchObject({ ok: false, fields: ['accessToken'] });
    }
  });

  it('el BFF tampoco deja pasar campos fuera del contrato', () => {
    expect(parseMetaUpdate({ expectedVersion: 2, accessToken: 'a', enabled: true, x: 1 })).toEqual({
      expectedVersion: 2,
      accessToken: 'a',
    });
    expect(parseMetaUpdate({ expectedVersion: 2, accessToken: '   ' })).toBeNull();
    expect(parseMetaUpdate({ expectedVersion: 2, pixelId: '1'.repeat(201) })).toBeNull();
    expect(parseMetaUpdate({ expectedVersion: 2, pixelId: 'PIXEL123' })).toBeNull();
    expect(parseMetaUpdate({ expectedVersion: 2, pixelId: ' 1234567890 ' })).toEqual({
      expectedVersion: 2,
      pixelId: '1234567890',
    });
  });

  it('la prueba exige el código y no acepta nada más', () => {
    expect(parseMetaTest({ testEventCode: ' test123 ', accessToken: TOKEN })).toEqual({
      testEventCode: 'TEST123',
    });
    expect(parseMetaTest({ testEventCode: '' })).toBeNull();
    expect(parseMetaTest({ testEventCode: 'x'.repeat(65) })).toBeNull();
    expect(parseMetaTest({})).toBeNull();
  });

  it('el formulario normaliza el código como lo hace el backend', () => {
    expect(normalizeMetaTestCode(' test12345 ')).toBe('TEST12345');
    expect(normalizeMetaTestCode('TE')).toBeNull();
    expect(normalizeMetaTestCode('TEST-123')).toBeNull();
    expect(normalizeMetaTestCode('T'.repeat(33))).toBeNull();
  });
});

describe('activar exige confirmación', () => {
  it('el cuerpo lleva confirm literal y nunca credenciales', () => {
    expect(metaActivationRequest(4, true)).toEqual({
      expectedVersion: 4,
      enabled: true,
      confirm: true,
    });
    expect(parseMetaActivation({ expectedVersion: 4, enabled: true })).toBeNull();
    expect(
      parseMetaActivation({ expectedVersion: 4, enabled: true, confirm: true, accessToken: 'x' }),
    ).toEqual({ expectedVersion: 4, enabled: true, confirm: true });
  });

  it('la frase de confirmación es exacta', () => {
    expect(isMetaConfirmation('activar meta')).toBe(true);
    expect(isMetaConfirmation('ACTIVAR TIKTOK')).toBe(false);
    expect(isMetaConfirmation('ACTIVAR')).toBe(false);
  });

  it('dice qué bloquea la activación', () => {
    expect(metaActivationBlocker(UNCONFIGURED)).toBe(
      'Faltan datos: el ID del conjunto de datos y el token de la API de conversiones.',
    );
    expect(
      metaActivationBlocker(integration({ configured: false, missing: ['accessToken'] })),
    ).toBe('Faltan datos: el token de la API de conversiones.');
    expect(metaActivationBlocker(integration({ lastTestStatus: 'failed' }))).toContain('prueba');
    expect(metaActivationBlocker(integration())).toBeNull();
  });

  it('el botón de activar queda deshabilitado mientras haya un bloqueo', () => {
    const html = renderToStaticMarkup(
      <MetaSettings canManage integration={integration({ lastTestStatus: null })} />,
    );

    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Activar Meta<\/button>/);
  });

  it('el estado activo solo se afirma con active', () => {
    expect(metaHealth(integration({ enabled: true })).label).toBe('Configurada, apagada');
    expect(metaHealth(integration({ enabled: true, active: true })).label).toBe('Activa');
    expect(metaHealth(UNCONFIGURED).label).toBe('Incompleta');
  });
});

describe('permisos', () => {
  it('sin integrations.manage no hay campos de token ni botones de guardar, probar o activar', () => {
    const html = renderToStaticMarkup(
      <MetaSettings canManage={false} integration={integration()} />,
    );

    expect(html).not.toContain('type="password"');
    expect(html).not.toContain('Guardar configuración');
    expect(html).not.toContain('Enviar compra de prueba');
    expect(html).not.toContain('Activar Meta');
    expect(html).toContain('Tu rol puede');
  });

  it('la tarjeta enlaza a la configuración según el permiso', () => {
    const card = renderToStaticMarkup(<MetaProviderCard canManage integration={integration()} />);

    expect(card).toContain('Configurar');
    expect(card).toContain('/panel/configuracion/integraciones/meta');
    expect(card).toContain('solo con consentimiento de publicidad');
    expect(card).toContain('/assets/integrations/meta.svg');
    expect(card).not.toContain('9fA2');
    expect(
      renderToStaticMarkup(<MetaProviderCard canManage={false} integration={integration()} />),
    ).toContain('Ver configuración');
    expect(renderToStaticMarkup(<MetaProviderCard canManage integration={null} />)).toContain(
      'Estado no disponible',
    );
  });
});

describe('errores', () => {
  it.each([
    'meta_configuration_invalid',
    'meta_configuration_incomplete',
    'meta_connection_test_required',
    'integration_conflict',
  ])('%s tiene su propio mensaje', (code) => {
    expect(describeMetaFailure(code)).not.toBe(describeMetaFailure('desconocido'));
  });

  it('traduce cada código de error de Meta', () => {
    expect(describeMetaError(null)).toBeNull();
    expect(describeMetaError('meta_token_rejected')).toBe(
      'Meta rechazó el token de acceso. Genera uno nuevo en el Administrador de eventos.',
    );
    expect(describeMetaError('meta_code_190')).toContain('190');
    expect(describeMetaError('meta_http_500')).toContain('HTTP 500');
    for (const code of ['meta_unreachable', 'meta_response_invalid', 'meta_rejected']) {
      expect(describeMetaError(code)).not.toContain(code);
    }
    expect(describeMetaError('otro_codigo')).toBe('Código otro_codigo');
  });

  it('el estado y la activación explican qué se envía a Meta', () => {
    const html = renderToStaticMarkup(
      <MetaSettings
        canManage
        integration={integration({
          lastErrorCode: 'meta_token_rejected',
          lastErrorAt: '2026-11-18T13:00:00.000Z',
        })}
      />,
    );

    expect(html).toContain('SHA-256');
    expect(html).toContain('Última compra enviada');
    expect(html).toContain('Meta rechazó el token de acceso');
  });
});

describe('la lista de integraciones', () => {
  const page = readFileSync('src/app/panel/configuracion/integraciones/page.tsx', 'utf8');

  it('lee Meta aparte, para que su fallo no tumbe la página', () => {
    expect(page).toContain('getMetaIntegration(material)');
    expect(page).toMatch(/try \{\s*meta = await getMetaIntegration\(material\);/);
    expect(page).toContain('<MetaProviderCard');
  });
});

describe('a quién llama el navegador', () => {
  // Sin comentarios: nombrar `localStorage` para decir que no se usa no es usarlo.
  const sources = ['meta-settings.tsx', 'meta-integration.ts', 'integrations-client.ts']
    .map((file) => readFileSync(`src/features/panel/${file}`, 'utf8'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  it('solo rutas locales del BFF, sin almacenamiento ni Meta directo', () => {
    expect(sources).toContain('/api/admin/integrations/meta');
    for (const needle of [
      'graph.facebook.com',
      'connect.facebook.net',
      'localStorage',
      'sessionStorage',
      'console.',
      'NEXT_PUBLIC',
    ]) {
      expect(sources, needle).not.toContain(needle);
    }
  });
});
