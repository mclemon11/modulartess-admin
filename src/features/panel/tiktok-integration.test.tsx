import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { parseTikTokActivation, parseTikTokTest, parseTikTokUpdate } from './integration-input';
import {
  buildTikTokUpdate,
  describeTikTokFailure,
  describeTikTokToken,
  isTikTokConfirmation,
  tiktokActivationBlocker,
  tiktokActivationRequest,
  tiktokHealth,
} from './tiktok-integration';

import type { TikTokIntegration } from '@/lib/api/integrations';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
}));

const { TikTokSettings } = await import('./tiktok-settings');
const { TikTokProviderCard } = await import('./integration-cards');

/** TikTok en el panel. Valores con aspecto de credencial: inventados. */
const TOKEN = 'TOKEN-PRUEBA-NUNCA-DEVUELTO-9fA2';

function integration(overrides: Partial<TikTokIntegration> = {}): TikTokIntegration {
  return {
    provider: 'tiktok',
    version: 4,
    enabled: false,
    active: false,
    configured: true,
    missing: [],
    pixelId: 'PIXELPRUEBA0000000000',
    accessTokenConfigured: true,
    accessTokenHint: '…9fA2',
    feedUrl: 'https://api.example.invalid/v1/feeds/tiktok.csv',
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
    expect(describeTikTokToken(integration())).toBe('Guardado · termina en 9fA2');
    expect(describeTikTokToken(integration({ accessTokenHint: null }))).toBe('Guardado');
    expect(describeTikTokToken(UNCONFIGURED)).toBe('Sin configurar');
  });

  it('la pantalla no re-muestra el token y usa un campo de contraseña vacío', () => {
    const html = renderToStaticMarkup(<TikTokSettings canManage integration={integration()} />);

    expect(html).not.toContain(TOKEN);
    expect(html.match(/type="password"/g)).toHaveLength(1);
    expect(html.toLowerCase()).toContain('autocomplete="new-password"');
    expect(html).not.toMatch(/type="password"[^>]*value="[^"]+"/);
    expect(html).toContain('termina en 9fA2');
    expect(html).toContain('Déjalo vacío para conservar');
    // El Pixel ID no es un secreto: se precarga.
    expect(html).toContain('value="PIXELPRUEBA0000000000"');
  });

  it('enseña la URL del feed con su instrucción', () => {
    const html = renderToStaticMarkup(<TikTokSettings canManage integration={integration()} />);

    expect(html).toContain('https://api.example.invalid/v1/feeds/tiktok.csv');
    expect(html).toContain('Carga programada (CSV)');
  });

  it('explica dónde sale el código de eventos de prueba', () => {
    const html = renderToStaticMarkup(<TikTokSettings canManage integration={integration()} />);

    expect(html).toContain('Código de eventos de prueba');
    expect(html).toContain('Eventos de prueba');
    expect(html).toContain('no cuenta como conversión');
  });
});

describe('conservar o reemplazar', () => {
  it('lo vacío no viaja: solo el token escrito y el Pixel ID cambiado', () => {
    expect(
      buildTikTokUpdate(integration(), {
        pixelId: 'PIXELPRUEBA0000000000',
        accessToken: ' nuevo ',
      }),
    ).toEqual({ ok: true, body: { expectedVersion: 4, accessToken: 'nuevo' } });
    expect(buildTikTokUpdate(integration(), { pixelId: 'OTROPIXEL', accessToken: '' })).toEqual({
      ok: true,
      body: { expectedVersion: 4, pixelId: 'OTROPIXEL' },
    });
  });

  it('sin cambios no hay llamada', () => {
    expect(
      buildTikTokUpdate(integration(), { pixelId: 'PIXELPRUEBA0000000000', accessToken: '' }),
    ).toMatchObject({ ok: false, fields: [] });
  });

  it('un espacio en medio se señala en su campo', () => {
    expect(
      buildTikTokUpdate(integration(), { pixelId: 'PIXEL CON ESPACIO', accessToken: '' }),
    ).toMatchObject({ ok: false, fields: ['pixelId'] });
  });

  it('el BFF tampoco deja pasar campos fuera del contrato', () => {
    expect(
      parseTikTokUpdate({ expectedVersion: 2, accessToken: 'a', enabled: true, x: 1 }),
    ).toEqual({ expectedVersion: 2, accessToken: 'a' });
    expect(parseTikTokUpdate({ expectedVersion: 2, accessToken: '   ' })).toBeNull();
    expect(parseTikTokUpdate({ expectedVersion: 2, pixelId: 'x'.repeat(201) })).toBeNull();
  });

  it('la prueba exige el código y no acepta nada más', () => {
    expect(parseTikTokTest({ testEventCode: ' TEST123 ', accessToken: TOKEN })).toEqual({
      testEventCode: 'TEST123',
    });
    expect(parseTikTokTest({ testEventCode: '' })).toBeNull();
    expect(parseTikTokTest({ testEventCode: 'x'.repeat(65) })).toBeNull();
    expect(parseTikTokTest({})).toBeNull();
  });
});

describe('activar exige confirmación', () => {
  it('el cuerpo lleva confirm literal y nunca credenciales', () => {
    expect(tiktokActivationRequest(4, true)).toEqual({
      expectedVersion: 4,
      enabled: true,
      confirm: true,
    });
    expect(parseTikTokActivation({ expectedVersion: 4, enabled: true })).toBeNull();
    expect(
      parseTikTokActivation({ expectedVersion: 4, enabled: true, confirm: true, accessToken: 'x' }),
    ).toEqual({ expectedVersion: 4, enabled: true, confirm: true });
  });

  it('la frase de confirmación es exacta', () => {
    expect(isTikTokConfirmation('activar tiktok')).toBe(true);
    expect(isTikTokConfirmation('ACTIVAR')).toBe(false);
  });

  it('dice qué bloquea la activación', () => {
    expect(tiktokActivationBlocker(UNCONFIGURED)).toBe(
      'Faltan datos: el Pixel ID y el token de Events API.',
    );
    expect(
      tiktokActivationBlocker(integration({ configured: false, missing: ['accessToken'] })),
    ).toBe('Faltan datos: el token de Events API.');
    expect(tiktokActivationBlocker(integration({ lastTestStatus: 'failed' }))).toContain('prueba');
    expect(tiktokActivationBlocker(integration())).toBeNull();
  });

  it('el botón de activar queda deshabilitado mientras haya un bloqueo', () => {
    const html = renderToStaticMarkup(
      <TikTokSettings canManage integration={integration({ lastTestStatus: null })} />,
    );

    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Activar TikTok<\/button>/);
  });

  it('el estado activo solo se afirma con active', () => {
    expect(tiktokHealth(integration({ enabled: true })).label).toBe('Configurada, apagada');
    expect(tiktokHealth(integration({ enabled: true, active: true })).label).toBe('Activa');
    expect(tiktokHealth(UNCONFIGURED).label).toBe('Incompleta');
  });
});

describe('permisos', () => {
  it('sin integrations.manage no hay campos de token ni botones de guardar, probar o activar', () => {
    const html = renderToStaticMarkup(
      <TikTokSettings canManage={false} integration={integration()} />,
    );

    expect(html).not.toContain('type="password"');
    expect(html).not.toContain('Guardar configuración');
    expect(html).not.toContain('Enviar compra de prueba');
    expect(html).not.toContain('Activar TikTok');
    expect(html).toContain('Tu rol puede');
  });

  it('la tarjeta enlaza a la configuración según el permiso', () => {
    const card = renderToStaticMarkup(<TikTokProviderCard canManage integration={integration()} />);

    expect(card).toContain('Configurar');
    expect(card).toContain('/panel/configuracion/integraciones/tiktok');
    expect(card).toContain('solo con consentimiento de publicidad');
    expect(card).not.toContain('9fA2');
    expect(
      renderToStaticMarkup(<TikTokProviderCard canManage={false} integration={integration()} />),
    ).toContain('Ver configuración');
    expect(renderToStaticMarkup(<TikTokProviderCard canManage integration={null} />)).toContain(
      'Estado no disponible',
    );
  });
});

describe('errores', () => {
  it.each([
    'tiktok_configuration_invalid',
    'tiktok_configuration_incomplete',
    'tiktok_connection_test_required',
    'integration_conflict',
  ])('%s tiene su propio mensaje', (code) => {
    expect(describeTikTokFailure(code)).not.toBe(describeTikTokFailure('desconocido'));
  });
});

describe('la lista de integraciones', () => {
  const page = readFileSync('src/app/panel/configuracion/integraciones/page.tsx', 'utf8');

  it('lee TikTok aparte, para que su fallo no tumbe la página', () => {
    expect(page).toContain('getTikTokIntegration(material)');
    expect(page).toMatch(/try \{\s*tiktok = await getTikTokIntegration\(material\);/);
    expect(page).toContain('<TikTokProviderCard');
  });
});

describe('a quién llama el navegador', () => {
  // Sin comentarios: nombrar `localStorage` para decir que no se usa no es usarlo.
  const sources = ['tiktok-settings.tsx', 'tiktok-integration.ts', 'integrations-client.ts']
    .map((file) => readFileSync(`src/features/panel/${file}`, 'utf8'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  it('solo rutas locales del BFF, sin almacenamiento ni TikTok directo', () => {
    expect(sources).toContain('/api/admin/integrations/tiktok');
    for (const needle of [
      'business-api.tiktok.com',
      'analytics.tiktok.com',
      'localStorage',
      'sessionStorage',
      'console.',
      'NEXT_PUBLIC',
    ]) {
      expect(sources, needle).not.toContain(needle);
    }
  });
});
