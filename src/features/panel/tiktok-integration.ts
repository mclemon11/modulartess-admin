/**
 * TikTok en el panel: lo que la pantalla y la tarjeta necesitan decidir sin red.
 *
 * Módulo puro. Las mismas tres reglas que Addi, comprobadas aquí y no en el componente:
 *
 * - **El token no se re-muestra.** Se enseña la pista que publica el backend (últimos cuatro) o
 *   «Sin configurar». Nada de lo escrito vuelve a pintarse.
 * - **Conservar es no enviar.** Un token vacío no viaja: significa «conserva el guardado».
 * - **Activar es otra operación**, con su confirmación. Este módulo nunca mezcla configuración y el
 *   interruptor en el mismo cuerpo.
 */

import type { IntegrationHealth } from './integration-labels';

import type { TikTokIntegration, UpdateTikTokIntegrationRequest } from '@/lib/api/integrations';

/** Qué se dice del token guardado. Nunca su valor; a lo sumo la pista del backend. */
export function describeTikTokToken(integration: TikTokIntegration): string {
  if (!integration.accessTokenConfigured) return 'Sin configurar';

  const hint = integration.accessTokenHint;

  return hint === null ? 'Guardado' : `Guardado · termina en ${hint.replace(/^…/, '')}`;
}

/** El formulario, tal como lo tiene el componente. */
export interface TikTokFormState {
  readonly pixelId: string;
  readonly accessToken: string;
}

export type TikTokUpdateBuild =
  | { readonly ok: true; readonly body: UpdateTikTokIntegrationRequest }
  | { readonly ok: false; readonly message: string; readonly fields: readonly string[] };

/**
 * El cuerpo del `PATCH`, o por qué no se puede enviar.
 *
 * - El Pixel ID solo viaja si cambió.
 * - El token solo viaja si se escribió; vacío conserva el guardado.
 * - Sin ningún cambio, no hay llamada.
 */
export function buildTikTokUpdate(
  integration: TikTokIntegration,
  form: TikTokFormState,
): TikTokUpdateBuild {
  const body: UpdateTikTokIntegrationRequest = { expectedVersion: integration.version };
  const pixelId = form.pixelId.trim();
  const accessToken = form.accessToken.trim();

  if (pixelId !== '' && pixelId !== integration.pixelId) {
    if (/\s/.test(pixelId)) {
      return {
        ok: false,
        message: 'El Pixel ID no lleva espacios. Cópialo de nuevo desde TikTok.',
        fields: ['pixelId'],
      };
    }
    body.pixelId = pixelId;
  }

  if (accessToken !== '') {
    if (/\s/.test(accessToken)) {
      return {
        ok: false,
        message: 'El token no lleva espacios. Cópialo de nuevo desde TikTok.',
        fields: ['accessToken'],
      };
    }
    body.accessToken = accessToken;
  }

  if (Object.keys(body).length === 1) {
    return { ok: false, message: 'No hay cambios que guardar.', fields: [] };
  }

  return { ok: true, body };
}

/**
 * Estado operativo de TikTok, en una palabra y con su tono.
 *
 * «Activa» solo se dice cuando el backend informa `active`: lo guardado (`enabled`) no basta.
 */
export function tiktokHealth(integration: TikTokIntegration): {
  readonly health: IntegrationHealth;
  readonly label: string;
} {
  if (integration.active) return { health: 'enabled', label: 'Activa' };
  if (!integration.configured) return { health: 'incomplete', label: 'Incompleta' };

  return { health: 'configured', label: 'Configurada, apagada' };
}

const MISSING_LABELS: Readonly<Record<string, string>> = {
  pixelId: 'el Pixel ID',
  accessToken: 'el token de Events API',
};

/** Qué impide activar TikTok ahora, en palabras. `null` si se puede intentar. */
export function tiktokActivationBlocker(integration: TikTokIntegration): string | null {
  if (!integration.configured) {
    const named = integration.missing.map((field) => MISSING_LABELS[field] ?? field);

    return named.length === 0
      ? 'Faltan datos: el Pixel ID y el token de Events API.'
      : `Faltan datos: ${named.join(' y ')}.`;
  }
  if (integration.lastTestStatus !== 'passed') {
    return 'Envía una compra de prueba con la configuración actual antes de activar.';
  }

  return null;
}

/** El cuerpo de activación. `confirm` va siempre literal: no hay otra forma de construirlo. */
export function tiktokActivationRequest(
  version: number,
  enabled: boolean,
): { expectedVersion: number; enabled: boolean; confirm: true } {
  return { expectedVersion: version, enabled, confirm: true };
}

/** Frase que hay que escribir para activar TikTok. */
export const TIKTOK_CONFIRMATION_PHRASE = 'ACTIVAR TIKTOK';

export function isTikTokConfirmation(value: string): boolean {
  return value.trim().toUpperCase() === TIKTOK_CONFIRMATION_PHRASE;
}

/**
 * Último error, tal como lo informa el backend.
 *
 * El contrato lo declara como un código cerrado de su propio vocabulario, pero no publica la
 * lista: el panel lo muestra como código en lugar de inventar una traducción.
 */
export function describeTikTokError(code: string | null): string | null {
  return code === null ? null : `Código ${code}`;
}

/** Mensaje de un fallo del BFF al guardar, probar o activar TikTok. Nunca el texto del backend. */
const FAILURE_TEXTS: Readonly<Record<string, string>> = {
  tiktok_configuration_invalid:
    'Algún dato de TikTok no tiene un formato válido. Revisa los campos y cópialos de nuevo.',
  tiktok_configuration_incomplete:
    'Para activar TikTok hacen falta el Pixel ID y el token de Events API.',
  tiktok_connection_test_required:
    'Antes de activar TikTok, envía una compra de prueba con la configuración actual.',
  integration_conflict:
    'La configuración cambió mientras la editabas. Recargamos para mostrar la versión actual.',
  integration_invalid: 'La petición no es válida o no hay cambios que guardar.',
  invalid_request: 'La petición no es válida o no hay cambios que guardar.',
  provider_unavailable: 'TikTok o el almacén de secretos no respondieron. Inténtalo de nuevo.',
  admin_role_required: 'Tu rol no puede cambiar la configuración de TikTok.',
  session_required: 'Tu sesión administrativa caducó. Vuelve a iniciar sesión.',
};

export const TIKTOK_FAILURE_GENERIC =
  'No pudimos completar la operación. Inténtalo de nuevo en unos momentos.';

export function describeTikTokFailure(code: string): string {
  return FAILURE_TEXTS[code] ?? TIKTOK_FAILURE_GENERIC;
}
