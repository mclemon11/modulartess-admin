/**
 * Llamadas del navegador al BFF de integraciones.
 *
 * Solo conoce rutas locales. No sabe la URL del backend, no tiene identidad IAM, no puede leer la
 * cookie de sesión y **no habla con Wompi**: quien llama al proveedor es el backend, con su llave
 * privada, desde el servidor. Un navegador que consultara Wompi directamente necesitaría esa llave.
 *
 * Cada respuesta se reduce a un resultado cerrado con el código estable del BFF. No se propaga
 * ningún texto del backend.
 *
 * **Nada se guarda.** Ni en `localStorage`, ni en `sessionStorage`, ni en una cookie, ni en la URL:
 * las credenciales que pasan por aquí viven en el estado del formulario mientras la pantalla está
 * abierta y desaparecen con ella.
 */

import type { UpdateWompiIntegrationRequest, WompiConnectionTest } from '@/lib/api/integrations';
import type { PaymentIncident, ResolvePaymentIncidentRequest } from '@/lib/api/payment-incidents';

export type IntegrationResult<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly code: string };

async function send<T>(
  url: string,
  method: 'POST' | 'PATCH',
  body: unknown,
): Promise<IntegrationResult<T>> {
  let response: Response;

  try {
    response = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    return { ok: false, code: 'service_unavailable' };
  }

  if (response.status === 200) {
    try {
      return { ok: true, data: (await response.json()) as T };
    } catch {
      return { ok: false, code: 'internal_error' };
    }
  }

  try {
    const payload: unknown = await response.json();

    if (typeof payload === 'object' && payload !== null && 'code' in payload) {
      const { code } = payload as { code: unknown };

      if (typeof code === 'string' && code.length > 0) {
        return { ok: false, code };
      }
    }
  } catch {
    // Cuerpo ilegible: cae al código genérico.
  }

  return { ok: false, code: 'internal_error' };
}

/**
 * Guarda credenciales, enciende el ambiente o rota un secreto.
 *
 * La respuesta **no se usa para pintar**: el formulario recarga el Server Component para leer el
 * estado autoritativo. Devolver el cuerpo aquí y guardarlo en estado de React crearía una segunda
 * copia de la configuración que podría quedarse vieja.
 */
export function updateWompiIntegration(
  body: UpdateWompiIntegrationRequest,
): Promise<IntegrationResult<unknown>> {
  return send('/api/admin/integrations/wompi', 'PATCH', body);
}

/**
 * Prueba la conexión con el proveedor.
 *
 * El cuerpo va vacío a propósito: qué llave se prueba lo decide el backend, que es quien la
 * guarda. Aceptar una llave desde el navegador significaría que el navegador la tiene.
 */
export function testWompiConnection(): Promise<IntegrationResult<WompiConnectionTest>> {
  return send('/api/admin/integrations/wompi/test', 'POST', {});
}

/** Cierra una incidencia. `expectedVersion` viaja siempre. */
export function resolvePaymentIncident(
  incidentId: string,
  body: ResolvePaymentIncidentRequest,
): Promise<IntegrationResult<PaymentIncident>> {
  return send(
    `/api/admin/payment-incidents/${encodeURIComponent(incidentId)}/resolve`,
    'PATCH',
    body,
  );
}
