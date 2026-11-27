/**
 * Meta en el panel: lo que la pantalla y la tarjeta necesitan decidir sin red.
 *
 * Módulo puro. Las mismas tres reglas que TikTok, comprobadas aquí y no en el componente:
 *
 * - **El token no se re-muestra.** Se enseña la pista que publica el backend (últimos cuatro) o
 *   «Sin configurar». Nada de lo escrito vuelve a pintarse.
 * - **Conservar es no enviar.** Un token vacío no viaja: significa «conserva el guardado».
 * - **Activar es otra operación**, con su confirmación. Este módulo nunca mezcla configuración y el
 *   interruptor en el mismo cuerpo.
 *
 * Las comprobaciones de forma (solo dígitos, longitudes, código de prueba) son ayuda para explicar
 * el problema junto al campo. La autoridad sigue siendo el backend.
 */

import type { IntegrationHealth } from './integration-labels';

import type { MetaIntegration, UpdateMetaIntegrationRequest } from '@/lib/api/integrations';

/** Qué se dice del token guardado. Nunca su valor; a lo sumo la pista del backend. */
export function describeMetaToken(integration: MetaIntegration): string {
  if (!integration.accessTokenConfigured) return 'Sin configurar';

  const hint = integration.accessTokenHint;

  return hint === null ? 'Guardado' : `Guardado · termina en ${hint.replace(/^…/, '')}`;
}

/** El formulario, tal como lo tiene el componente. */
export interface MetaFormState {
  readonly pixelId: string;
  readonly accessToken: string;
}

export type MetaUpdateBuild =
  | { readonly ok: true; readonly body: UpdateMetaIntegrationRequest }
  | { readonly ok: false; readonly message: string; readonly fields: readonly string[] };

/** Forma que publica el backend: el ID del conjunto de datos son 10 a 20 dígitos. */
const META_PIXEL_PATTERN = /^\d{10,20}$/;
/** El token: 16 a 512 caracteres ASCII imprimibles, sin espacios. */
const META_TOKEN_PATTERN = /^[\x21-\x7e]{16,512}$/;
/** El código de «Probar eventos», ya en mayúsculas. */
const META_TEST_CODE_PATTERN = /^[A-Z0-9]{3,32}$/;

/**
 * El cuerpo del `PATCH`, o por qué no se puede enviar.
 *
 * - El ID del conjunto de datos solo viaja si cambió, y solo con dígitos.
 * - El token solo viaja si se escribió; vacío conserva el guardado.
 * - Sin ningún cambio, no hay llamada.
 */
export function buildMetaUpdate(
  integration: MetaIntegration,
  form: MetaFormState,
): MetaUpdateBuild {
  const body: UpdateMetaIntegrationRequest = { expectedVersion: integration.version };
  const pixelId = form.pixelId.trim();
  const accessToken = form.accessToken.trim();

  if (pixelId !== '' && pixelId !== integration.pixelId) {
    if (!META_PIXEL_PATTERN.test(pixelId)) {
      return {
        ok: false,
        message:
          'El ID del conjunto de datos son solo números (entre 10 y 20). Cópialo de nuevo desde el Administrador de eventos.',
        fields: ['pixelId'],
      };
    }
    body.pixelId = pixelId;
  }

  if (accessToken !== '') {
    if (!META_TOKEN_PATTERN.test(accessToken)) {
      return {
        ok: false,
        message:
          'El token no lleva espacios y tiene entre 16 y 512 caracteres. Cópialo de nuevo desde el Administrador de eventos.',
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
 * El código de «Probar eventos» listo para enviar —recortado y en mayúsculas—, o `null` si no
 * tiene la forma que espera Meta.
 */
export function normalizeMetaTestCode(value: string): string | null {
  const code = value.trim().toUpperCase();

  return META_TEST_CODE_PATTERN.test(code) ? code : null;
}

/**
 * Estado operativo de Meta, en una palabra y con su tono.
 *
 * «Activa» solo se dice cuando el backend informa `active`: lo guardado (`enabled`) no basta.
 */
export function metaHealth(integration: MetaIntegration): {
  readonly health: IntegrationHealth;
  readonly label: string;
} {
  if (integration.active) return { health: 'enabled', label: 'Activa' };
  if (!integration.configured) return { health: 'incomplete', label: 'Incompleta' };

  return { health: 'configured', label: 'Configurada, apagada' };
}

const MISSING_LABELS: Readonly<Record<string, string>> = {
  pixelId: 'el ID del conjunto de datos',
  accessToken: 'el token de la API de conversiones',
};

/** Qué impide activar Meta ahora, en palabras. `null` si se puede intentar. */
export function metaActivationBlocker(integration: MetaIntegration): string | null {
  if (!integration.configured) {
    const named = integration.missing.map((field) => MISSING_LABELS[field] ?? field);

    return named.length === 0
      ? 'Faltan datos: el ID del conjunto de datos y el token de la API de conversiones.'
      : `Faltan datos: ${named.join(' y ')}.`;
  }
  if (integration.lastTestStatus !== 'passed') {
    return 'Envía una compra de prueba con la configuración actual antes de activar.';
  }

  return null;
}

/** El cuerpo de activación. `confirm` va siempre literal: no hay otra forma de construirlo. */
export function metaActivationRequest(
  version: number,
  enabled: boolean,
): { expectedVersion: number; enabled: boolean; confirm: true } {
  return { expectedVersion: version, enabled, confirm: true };
}

/** Frase que hay que escribir para activar Meta. */
export const META_CONFIRMATION_PHRASE = 'ACTIVAR META';

export function isMetaConfirmation(value: string): boolean {
  return value.trim().toUpperCase() === META_CONFIRMATION_PHRASE;
}

/** Códigos fijos que el backend publica para una prueba o un envío fallido. */
const ERROR_TEXTS: Readonly<Record<string, string>> = {
  meta_unreachable: 'No pudimos conectar con Meta. Inténtalo de nuevo en unos minutos.',
  meta_token_rejected:
    'Meta rechazó el token de acceso. Genera uno nuevo en el Administrador de eventos.',
  meta_response_invalid: 'Meta respondió algo que no pudimos interpretar.',
  meta_rejected: 'Meta rechazó el evento sin indicar el motivo.',
};

/**
 * Último error (o motivo de una prueba rechazada), en palabras.
 *
 * Los códigos con número —`meta_code_<n>` del API de Meta y `meta_http_<estado>`— conservan el
 * número, que es lo que sirve para buscarlo. Un código desconocido se muestra tal cual en lugar de
 * inventar una traducción.
 */
export function describeMetaError(code: string | null): string | null {
  if (code === null) return null;
  if (Object.hasOwn(ERROR_TEXTS, code)) return ERROR_TEXTS[code] as string;

  const metaCode = /^meta_code_(\d+)$/.exec(code);
  if (metaCode !== null) return `Meta rechazó el evento con el código ${metaCode[1]}.`;

  const http = /^meta_http_(\d{3})$/.exec(code);
  if (http !== null) return `Meta respondió con un error HTTP ${http[1]}.`;

  return `Código ${code}`;
}

/** Mensaje de un fallo del BFF al guardar, probar o activar Meta. Nunca el texto del backend. */
const FAILURE_TEXTS: Readonly<Record<string, string>> = {
  meta_configuration_invalid:
    'Algún dato de Meta no tiene un formato válido. Revisa los campos y cópialos de nuevo.',
  meta_configuration_incomplete:
    'Para activar Meta hacen falta el ID del conjunto de datos y el token de la API de conversiones.',
  meta_connection_test_required:
    'Antes de activar Meta, envía una compra de prueba con la configuración actual.',
  integration_conflict:
    'La configuración cambió mientras la editabas. Recargamos para mostrar la versión actual.',
  integration_invalid: 'La petición no es válida o no hay cambios que guardar.',
  invalid_request: 'La petición no es válida o no hay cambios que guardar.',
  provider_unavailable: 'Meta o el almacén de secretos no respondieron. Inténtalo de nuevo.',
  admin_role_required: 'Tu rol no puede cambiar la configuración de Meta.',
  session_required: 'Tu sesión administrativa caducó. Vuelve a iniciar sesión.',
};

export const META_FAILURE_GENERIC =
  'No pudimos completar la operación. Inténtalo de nuevo en unos momentos.';

export function describeMetaFailure(code: string): string {
  return FAILURE_TEXTS[code] ?? META_FAILURE_GENERIC;
}
