/**
 * Mensajes de la superficie de integraciones, tal como los ve la persona.
 *
 * Se traducen desde el código estable del cliente server-only. **Nunca se muestra el mensaje
 * original del backend**, y en esta superficie la razón va más allá de la higiene habitual: un
 * error de configuración puede nombrar el campo que se rechazó, y el día que alguien decidiera
 * incluir «recibido» en ese mensaje, medio secreto viajaría en una respuesta HTTP.
 *
 * Tampoco se muestra nunca la respuesta del proveedor. El contrato lo declara —«the remote body is
 * never included»— y el panel no lo reintroduce por la puerta de atrás.
 *
 * Módulo puro.
 */

import type { BackendFailureCode } from '@/lib/api/errors';

export const INTEGRATION_GENERIC_MESSAGE =
  'No pudimos completar la operación. Inténtalo de nuevo en unos momentos.';

const MESSAGES: Readonly<Partial<Record<BackendFailureCode, string>>> = {
  backend_payment_integration_invalid:
    'La configuración no cumple lo que exige la pasarela. Revisa el ambiente y los prefijos de las credenciales.',
  backend_payment_integration_conflict:
    'La configuración cambió mientras la mirabas. Recarga para ver la versión actual.',
  backend_live_payments_not_enabled:
    'Los pagos reales están bloqueados en este despliegue. No es una casilla de configuración: se levanta desde el backend.',
  backend_payment_incident_not_found: 'Esa incidencia ya no existe.',
  backend_payment_provider_unavailable:
    'La pasarela no respondió, o no se pudo escribir el almacén de secretos.',
  backend_unauthorized: 'Tu sesión administrativa caducó. Vuelve a iniciar sesión.',
  backend_forbidden: 'Tu rol no tiene acceso a esta parte de la configuración.',
  backend_surface_disabled: 'La superficie de integraciones no está disponible en este despliegue.',
  backend_invalid_request: 'La petición no tiene el formato que espera el backend.',
  backend_rate_limited: 'Demasiadas peticiones seguidas. Espera unos segundos.',
  backend_unavailable: 'El servicio no responde ahora mismo.',
};

export function describeIntegrationFailure(code: BackendFailureCode): string {
  return MESSAGES[code] ?? INTEGRATION_GENERIC_MESSAGE;
}

/**
 * ¿Este fallo se arregla recargando?
 *
 * Solo el conflicto de versión. Ofrecerlo ante una credencial inválida sería un consejo inútil, y
 * ante el bloqueo de producción, engañoso: recargar no lo levanta.
 */
export function offersIntegrationReload(code: BackendFailureCode): boolean {
  return code === 'backend_payment_integration_conflict';
}
