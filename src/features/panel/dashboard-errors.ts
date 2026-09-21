/**
 * Mensajes del Dashboard, tal como los ve la persona.
 *
 * Se traducen desde el código estable del cliente server-only. Nunca se muestra el mensaje original
 * del backend: puede llevar identificadores internos y su forma cambia sin aviso.
 *
 * Los tres que el contrato distingue merecen texto propio porque tienen salidas distintas:
 *
 *   - `dashboard_query_invalid`: el período no vale. Se arregla eligiendo otro, así que la pantalla
 *     ofrece volver a 30 días. Reintentar el mismo rango no lo arreglaría.
 *   - `admin_forbidden`: falta el permiso. No se dice cuál: enumerar permisos a quien no los tiene
 *     no le ayuda y sí describe la matriz de autorización.
 *   - `dashboard_unavailable`: el resumen no se pudo calcular. Reintentar sí tiene sentido, y el
 *     resto del panel sigue funcionando.
 *
 * Módulo puro.
 */

import type { BackendFailureCode } from '@/lib/api/errors';

export const DASHBOARD_GENERIC_MESSAGE =
  'No pudimos cargar el resumen de la tienda. Inténtalo de nuevo en unos momentos.';

const MESSAGES: Readonly<Partial<Record<BackendFailureCode, string>>> = {
  backend_dashboard_query_invalid:
    'El período seleccionado no es válido. Revisa las fechas o vuelve al rango de 30 días.',
  backend_dashboard_unavailable: 'No pudimos cargar el resumen de la tienda.',
  backend_invalid_request:
    'El período seleccionado no es válido. Revisa las fechas o vuelve al rango de 30 días.',
  backend_unauthorized: 'Tu sesión administrativa caducó. Vuelve a iniciar sesión.',
  backend_forbidden: 'Tu rol no tiene acceso al resumen de la tienda.',
  backend_surface_disabled: 'El resumen de la tienda no está disponible en este despliegue.',
  backend_rate_limited: 'Demasiadas consultas seguidas. Espera unos segundos.',
  backend_unavailable: 'No pudimos cargar el resumen de la tienda.',
};

export function describeDashboardFailure(code: BackendFailureCode): string {
  return MESSAGES[code] ?? DASHBOARD_GENERIC_MESSAGE;
}

/**
 * ¿Este fallo se arregla volviendo al período por defecto?
 *
 * Solo el de consulta inválida. Ofrecerlo ante una caída del servicio sería un consejo inútil, y
 * ante una falta de permiso, engañoso: cambiar de rango no concede el permiso.
 */
export function offersDefaultPeriod(code: BackendFailureCode): boolean {
  return code === 'backend_dashboard_query_invalid' || code === 'backend_invalid_request';
}
