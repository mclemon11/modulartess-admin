import 'server-only';

/**
 * Configuración de integraciones de pago. **Solo servidor.**
 *
 * Tres operaciones y ninguna más: leer el estado, escribir credenciales y probar la conexión. Los
 * tipos vienen de `./generated/schema`, así que si el backend cambia la forma de una credencial,
 * lo que deja de compilar es el panel.
 *
 * **Ningún secreto vuelve nunca.** El contrato lo declara en los dos sentidos: los cuatro campos de
 * credencial son `writeOnly` —solo se mandan— y la respuesta trae la llave pública enmascarada y,
 * de las otras tres, únicamente si hay una versión guardada. Este módulo no invierte esa dirección
 * en ningún punto: lo que entra no se devuelve, y lo que sale no se guarda.
 *
 * Nada de lo que pasa por aquí se registra. Un log de la petición de `PATCH` contendría las cuatro
 * credenciales en claro, y un log de la respuesta contendría la URL del webhook y el estado de la
 * pasarela: lo primero es una filtración y lo segundo no aporta nada.
 */

import { backendClient } from './backend-client';
import { BackendFailure, failureCodeFromStatus, type BackendFailureCode } from './errors';
import type { components } from './generated/schema';
import { ADMIN_SESSION_HEADER } from './session-material';

export type WompiIntegration = components['schemas']['WompiIntegrationDto'];
export type WompiEnvironmentConfig = components['schemas']['WompiEnvironmentConfigDto'];
export type UpdateWompiIntegrationRequest =
  components['schemas']['UpdateWompiIntegrationRequestDto'];
export type WompiConnectionTest = components['schemas']['WompiConnectionTestDto'];

/** Los dos ambientes que el contrato admite configurar. */
export type WompiEnvironment = UpdateWompiIntegrationRequest['environment'];

/**
 * Un `404` en esta superficie no puede ser «esa integración no existe»: la configuración de Wompi
 * es un recurso único que el backend materializa vacío. Significa que el despliegue no tiene la
 * superficie administrativa.
 */
const RESOURCE = { notFound: 'backend_surface_disabled' } as const;

function sessionHeaders(sessionMaterial: string): Record<string, string> {
  return { [ADMIN_SESSION_HEADER]: sessionMaterial };
}

/**
 * Código estable del cuerpo del error.
 *
 * Se lee **solo** para comparar contra la lista cerrada del contrato, nunca para propagarlo. El
 * `message` del backend no se mira: su forma cambia sin aviso y en esta superficie puede nombrar
 * campos de credencial.
 */
function backendErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }

  const { code } = error as { code: unknown };

  return typeof code === 'string' ? code : null;
}

/**
 * Traduce la respuesta fallida a un código interno estable.
 *
 * Los dos `409` del contrato significan cosas distintas y llevan a sitios distintos:
 * `payment_integration_conflict` se arregla recargando, y `wompi_live_payments_not_enabled` no se
 * arregla desde el panel en absoluto. Confundirlos mandaría a alguien a buscar una casilla que no
 * existe.
 */
const CREDENTIAL_FAILURES: Readonly<Record<string, BackendFailureCode>> = {
  wompi_credentials_environment_mismatch: 'backend_wompi_credentials_environment_mismatch',
  wompi_credential_prefix_invalid: 'backend_wompi_credential_prefix_invalid',
  wompi_credentials_incomplete: 'backend_wompi_credentials_incomplete',
};

function integrationFailure(status: number, code: string | null): BackendFailure {
  /*
   * Los tres códigos de credencial se distinguen porque llevan a acciones
   * distintas: cambiar el selector de ambiente, volver a copiar las llaves, o
   * rellenar lo que falte. Aplanarlos en «configuración inválida» obligaría a
   * probar las tres cosas.
   */
  if (status === 400 && code !== null && Object.hasOwn(CREDENTIAL_FAILURES, code)) {
    return new BackendFailure(CREDENTIAL_FAILURES[code] as BackendFailureCode);
  }

  if (status === 400 && code === 'payment_integration_invalid') {
    return new BackendFailure('backend_payment_integration_invalid');
  }

  if (status === 409 && code === 'wompi_live_payments_not_enabled') {
    return new BackendFailure('backend_live_payments_not_enabled');
  }

  if (status === 409 && code === 'payment_integration_conflict') {
    return new BackendFailure('backend_payment_integration_conflict');
  }

  if (status === 503 && code === 'payment_provider_unavailable') {
    return new BackendFailure('backend_payment_provider_unavailable');
  }

  return new BackendFailure(failureCodeFromStatus(status, RESOURCE));
}

function toFailure(error: unknown): BackendFailure {
  return error instanceof BackendFailure ? error : new BackendFailure('backend_unavailable');
}

/**
 * Estado de la integración con Wompi.
 *
 * Exige `integrations.read`, que tienen `super_admin` y `master_admin`. Lo que devuelve es estado
 * operativo: qué hay configurado, con qué ambiente, cuándo fue la última señal de cada clase y qué
 * URL hay que copiar en el comercio. **Ni un valor de credencial.**
 */
export async function getWompiIntegration(sessionMaterial: string): Promise<WompiIntegration> {
  let response;

  try {
    response = await backendClient().GET('/v1/admin/integrations/wompi', {
      headers: sessionHeaders(sessionMaterial),
    });
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw integrationFailure(response.response.status, backendErrorCode(response.error));
  }

  return response.data;
}

/**
 * Escribe credenciales, enciende un ambiente o rota un secreto.
 *
 * Exige `integrations.manage`, que solo tiene `super_admin`.
 *
 * `expectedVersion` viaja siempre: dos personas editando la misma configuración se pisarían y la
 * última ganaría en silencio, que en una pasarela significa cobrar con la credencial de otro.
 *
 * Los campos de credencial son **opcionales por diseño del contrato**: mandarlos guarda una versión
 * nueva, omitirlos conserva la actual. El panel nunca manda una cadena vacía para «borrar», porque
 * el contrato no le da ese significado: apagar se hace con `enabledForNewPayments`, y revocar con
 * `revokeRetiredEventsSecrets`.
 */
export async function updateWompiIntegration(
  sessionMaterial: string,
  body: UpdateWompiIntegrationRequest,
): Promise<WompiIntegration> {
  let response;

  try {
    response = await backendClient().PATCH('/v1/admin/integrations/wompi', {
      body,
      headers: sessionHeaders(sessionMaterial),
    });
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw integrationFailure(response.response.status, backendErrorCode(response.error));
  }

  return response.data;
}

/**
 * Prueba la conexión con el proveedor.
 *
 * Exige `integrations.manage` —es una llamada saliente contra el proveedor, no una lectura— y
 * **no mueve dinero**. El contrato es explícito sobre su alcance: comprueba la llave pública y la
 * conectividad, «AND NOTHING ELSE». De las otras tres credenciales informa si hay una versión
 * guardada, y el panel tiene que decirlo con esas palabras en lugar de sugerir que se verificaron.
 */
export async function testWompiConnection(sessionMaterial: string): Promise<WompiConnectionTest> {
  let response;

  try {
    response = await backendClient().POST('/v1/admin/integrations/wompi/test', {
      headers: sessionHeaders(sessionMaterial),
    });
  } catch (error) {
    throw toFailure(error);
  }

  if (response.error !== undefined || response.data === undefined) {
    throw integrationFailure(response.response.status, backendErrorCode(response.error));
  }

  return response.data;
}
