/**
 * Addi en el panel (ADR 0015): lo que la pantalla y la tarjeta necesitan decidir sin red.
 *
 * Módulo puro. Tres reglas que se comprueban aquí y no en el componente:
 *
 * - **Ningún secreto se re-muestra.** Del Client ID y del usuario de notificación se enseña la pista
 *   que publica el backend (últimos cuatro); del Client Secret y de la contraseña, solo si están
 *   guardados. Nada de lo escrito vuelve a pintarse.
 * - **Conservar es no enviar.** Un secreto que no se marca para reemplazar no viaja en el cuerpo;
 *   uno marcado y vacío es un error de formulario, no «borrar».
 * - **Activar es otra operación**, con su confirmación. Este módulo nunca mezcla credenciales y el
 *   interruptor en el mismo cuerpo.
 */

import { ADDI_SECRET_FIELDS, type AddiSecretField } from './integration-input';
import type { IntegrationHealth } from './integration-labels';

import type { AddiIntegration, UpdateAddiIntegrationRequest } from '@/lib/api/integrations';

export { ADDI_SECRET_FIELDS, type AddiSecretField };

export const ADDI_FIELD_LABELS: Readonly<Record<AddiSecretField, string>> = {
  clientId: 'Client ID',
  clientSecret: 'Client Secret',
  callbackUsername: 'Usuario de notificación',
  callbackSecret: 'Contraseña de notificación',
};

/** Qué se dice de una credencial guardada. Nunca su valor; a lo sumo la pista del backend. */
export function describeAddiCredential(
  integration: AddiIntegration,
  field: AddiSecretField,
): string {
  switch (field) {
    case 'clientId':
      return guardado(integration.clientIdConfigured, integration.clientIdHint);
    case 'clientSecret':
      return guardado(integration.clientSecretConfigured, null);
    case 'callbackUsername':
      return guardado(integration.callbackUsernameConfigured, integration.callbackUsernameHint);
    case 'callbackSecret':
      return guardado(integration.callbackSecretConfigured, null);
  }
}

function guardado(configured: boolean, hint: string | null): string {
  if (!configured) return 'Sin configurar';

  return hint === null ? 'Guardado' : `Guardado · termina en ${hint.replace(/^…/, '')}`;
}

/** El formulario, tal como lo tiene el componente. `replace[field]` decide si el campo viaja. */
export interface AddiFormState {
  readonly allySlug: string;
  readonly replace: Readonly<Record<AddiSecretField, boolean>>;
  readonly values: Readonly<Record<AddiSecretField, string>>;
}

export const EMPTY_ADDI_SECRETS: Readonly<Record<AddiSecretField, string>> = {
  clientId: '',
  clientSecret: '',
  callbackUsername: '',
  callbackSecret: '',
};

export type AddiUpdateBuild =
  | { readonly ok: true; readonly body: UpdateAddiIntegrationRequest }
  | { readonly ok: false; readonly message: string; readonly fields: readonly string[] };

/**
 * El cuerpo del `PATCH`, o por qué no se puede enviar.
 *
 * - Un secreto **sin configurar** se trata como «a reemplazar»: no hay nada que conservar.
 * - Un secreto marcado para reemplazar y vacío se rechaza: un campo en blanco no es un valor.
 * - El slug solo viaja si cambió.
 * - Sin ningún cambio, no hay llamada.
 */
export function buildAddiUpdate(
  integration: AddiIntegration,
  form: AddiFormState,
): AddiUpdateBuild {
  const body: UpdateAddiIntegrationRequest = { expectedVersion: integration.version };
  const missing: string[] = [];
  const slug = form.allySlug.trim();

  if (slug !== '' && slug !== integration.allySlug) {
    if (!/^[a-z0-9-]{3,80}$/.test(slug)) {
      return {
        ok: false,
        message: 'El identificador del comercio solo admite minúsculas, dígitos y guiones.',
        fields: ['allySlug'],
      };
    }
    body.allySlug = slug;
  }

  for (const field of ADDI_SECRET_FIELDS) {
    if (!replacing(integration, form, field)) continue;

    const value = form.values[field].trim();

    if (value === '') {
      if (form.replace[field]) missing.push(field);
      continue;
    }
    body[field] = value;
  }

  if (missing.length > 0) {
    return {
      ok: false,
      message: 'Escribe el valor nuevo o marca «Conservar» en los campos señalados.',
      fields: missing,
    };
  }

  if (Object.keys(body).length === 1) {
    return { ok: false, message: 'No hay cambios que guardar.', fields: [] };
  }

  return { ok: true, body };
}

/** ¿Se edita este campo? Si no hay nada guardado, siempre; si lo hay, solo marcándolo. */
export function replacing(
  integration: AddiIntegration,
  form: Pick<AddiFormState, 'replace'>,
  field: AddiSecretField,
): boolean {
  return !isConfigured(integration, field) || form.replace[field];
}

function isConfigured(integration: AddiIntegration, field: AddiSecretField): boolean {
  switch (field) {
    case 'clientId':
      return integration.clientIdConfigured;
    case 'clientSecret':
      return integration.clientSecretConfigured;
    case 'callbackUsername':
      return integration.callbackUsernameConfigured;
    case 'callbackSecret':
      return integration.callbackSecretConfigured;
  }
}

/**
 * Estado operativo de Addi, en una palabra y con su tono.
 *
 * El orden importa: lo que bloquea el despliegue manda sobre lo que decide el panel, y «Activo»
 * solo se dice cuando el backend informa `acceptingNewPayments`.
 */
export function addiHealth(integration: AddiIntegration): {
  readonly health: IntegrationHealth;
  readonly label: string;
} {
  if (integration.acceptingNewPayments) return { health: 'enabled', label: 'Activo' };
  if (!integration.configured) return { health: 'incomplete', label: 'Sin configurar' };
  if (!integration.livePaymentsEnabled) return { health: 'blocked', label: 'Bloqueado' };

  return { health: 'configured', label: 'Desactivado' };
}

/** Qué impide activar Addi ahora, en palabras. `null` si se puede intentar. */
export function addiActivationBlocker(integration: AddiIntegration): string | null {
  if (!integration.livePaymentsEnabled) {
    return 'Este despliegue bloquea los pagos con Addi. No se levanta desde el panel.';
  }
  if (!integration.configured) {
    return 'Faltan datos: el identificador del comercio y las cuatro credenciales.';
  }
  if (integration.lastTestStatus !== 'passed') {
    return 'Ejecuta la prueba de autenticación con la configuración actual antes de activar.';
  }

  return null;
}

/** El cuerpo de activación. `confirm` va siempre literal: no hay otra forma de construirlo. */
export function addiActivationRequest(
  version: number,
  enabledForNewPayments: boolean,
): { expectedVersion: number; enabledForNewPayments: boolean; confirm: true } {
  return { expectedVersion: version, enabledForNewPayments, confirm: true };
}

/** Frase que hay que escribir para activar pagos reales con Addi. */
export const ADDI_CONFIRMATION_PHRASE = 'ACTIVAR ADDI';

export function isAddiConfirmation(value: string): boolean {
  return value.trim().toUpperCase() === ADDI_CONFIRMATION_PHRASE;
}

/** Último error, traducido. Nunca el código crudo si hay una frase mejor. */
const ERROR_TEXTS: Readonly<Record<string, string>> = {
  addi_auth_rejected: 'Addi rechazó las credenciales de operación.',
  addi_auth_unavailable: 'Addi no respondió a la autenticación.',
  addi_auth_unavailable_timeout: 'Addi tardó demasiado en responder a la autenticación.',
  addi_auth_response_invalid: 'Addi respondió algo inesperado a la autenticación.',
  addi_redirect_missing: 'Addi respondió sin la redirección esperada. El intento se conserva.',
  addi_redirect_unverified:
    'Addi redirigió a un origen todavía no autorizado. El intento se conserva y no se envió a nadie a esa dirección.',
  addi_application_unavailable: 'Addi no respondió al crear una solicitud.',
  addi_application_unavailable_timeout: 'Addi tardó demasiado en crear una solicitud.',
  addi_status_unknown: 'Llegó un callback con un estado que Addi no documenta.',
  credentials_missing: 'Faltan el Client ID o el Client Secret.',
  credential_version_unavailable: 'No se pudo leer una credencial del almacén de secretos.',
};

export function describeAddiError(code: string | null): string | null {
  if (code === null) return null;
  if (Object.hasOwn(ERROR_TEXTS, code)) return ERROR_TEXTS[code] ?? code;
  if (code.startsWith('addi_application_rejected_'))
    return 'Addi rechazó los datos de una solicitud.';
  if (code.startsWith('addi_callback_')) return 'Un callback de Addi no cuadró con su intento.';

  return `Código ${code}`;
}

/** Incidencias abiertas: el backend cuenta hasta 50, y «50» puede ser «50 o más». */
export function describeAddiIncidents(count: number): string {
  if (count === 0) return 'Ninguna';
  if (count >= 50) return '50 o más';

  return String(count);
}

/** Mensaje de un fallo del BFF al guardar, probar o activar Addi. Nunca el texto del backend. */
const FAILURE_TEXTS: Readonly<Record<string, string>> = {
  addi_configuration_invalid:
    'Algún dato de Addi no tiene un formato válido. Revisa los campos y cópialos de nuevo.',
  addi_configuration_incomplete:
    'Para activar Addi hacen falta el identificador del comercio y las cuatro credenciales.',
  addi_connection_test_required:
    'Antes de activar Addi, ejecuta la prueba de autenticación con la configuración actual.',
  addi_live_payments_not_enabled:
    'Los pagos con Addi están bloqueados en este despliegue. No se levanta desde el panel.',
  integration_conflict:
    'La configuración cambió mientras la editabas. Recargamos para mostrar la versión actual.',
  integration_invalid: 'La petición no es válida o no hay cambios que guardar.',
  invalid_request: 'La petición no es válida o no hay cambios que guardar.',
  provider_unavailable: 'Addi o el almacén de secretos no respondieron. Inténtalo de nuevo.',
  admin_role_required: 'Tu rol no puede cambiar la configuración de Addi.',
  session_required: 'Tu sesión administrativa caducó. Vuelve a iniciar sesión.',
};

export const ADDI_FAILURE_GENERIC =
  'No pudimos completar la operación. Inténtalo de nuevo en unos momentos.';

export function describeAddiFailure(code: string): string {
  return FAILURE_TEXTS[code] ?? ADDI_FAILURE_GENERIC;
}
