/**
 * Mensajes en español para los fallos del catálogo, tal como los ve la persona.
 *
 * Se traducen desde el código estable del BFF o del cliente del backend. Nunca se muestra el
 * mensaje original: puede llevar identificadores internos y su forma cambia sin aviso.
 */

import type { BackendFailureCode } from '@/lib/api/errors';

export const CATALOG_MESSAGES: Readonly<Record<string, string>> = {
  invalid_request: 'Revisa los datos: el backend los rechazó por no cumplir el contrato.',
  session_required: 'Tu sesión administrativa caducó. Vuelve a iniciar sesión.',
  admin_role_required: 'Tu rol no permite esta acción.',
  not_found: 'Ese producto ya no existe.',
  version_conflict:
    'Alguien modificó este producto mientras lo editabas. Recarga para ver la versión actual y vuelve a intentarlo.',
  admin_surface_disabled: 'La superficie administrativa no está disponible en este despliegue.',
  too_many_requests: 'Demasiadas peticiones seguidas. Espera unos segundos.',
  service_unavailable: 'El servicio de catálogo no responde ahora mismo.',
  /*
   * El backend aceptó el cambio pero la imagen no volvió como principal.
   *
   * No es un error de red ni de permisos: es una respuesta que no dice lo que se pidió. Se trata
   * como fallo —y no como éxito silencioso— porque «Portada actualizada» es una afirmación sobre
   * lo que verá la tienda.
   */
  cover_not_applied:
    'La imagen se subió, pero el backend no la devolvió como portada. Recarga el producto para ver cómo quedó antes de reintentarlo.',
};

export const GENERIC_CATALOG_MESSAGE =
  'No pudimos completar la operación. Inténtalo de nuevo en unos momentos.';

export function describeCatalogFailure(code: string): string {
  return CATALOG_MESSAGES[code] ?? GENERIC_CATALOG_MESSAGE;
}

/** Traduce un fallo del cliente server-only al mensaje que se pinta en una pantalla. */
export function describeBackendFailure(code: BackendFailureCode): string {
  switch (code) {
    case 'backend_unauthorized':
      return CATALOG_MESSAGES.session_required ?? GENERIC_CATALOG_MESSAGE;
    case 'backend_forbidden':
      return CATALOG_MESSAGES.admin_role_required ?? GENERIC_CATALOG_MESSAGE;
    case 'backend_not_found':
      return CATALOG_MESSAGES.not_found ?? GENERIC_CATALOG_MESSAGE;
    case 'backend_conflict':
      return CATALOG_MESSAGES.version_conflict ?? GENERIC_CATALOG_MESSAGE;
    case 'backend_invalid_request':
      return CATALOG_MESSAGES.invalid_request ?? GENERIC_CATALOG_MESSAGE;
    case 'backend_surface_disabled':
      return CATALOG_MESSAGES.admin_surface_disabled ?? GENERIC_CATALOG_MESSAGE;
    case 'backend_rate_limited':
      return CATALOG_MESSAGES.too_many_requests ?? GENERIC_CATALOG_MESSAGE;
    case 'backend_unavailable':
      return CATALOG_MESSAGES.service_unavailable ?? GENERIC_CATALOG_MESSAGE;
    default:
      return GENERIC_CATALOG_MESSAGE;
  }
}
