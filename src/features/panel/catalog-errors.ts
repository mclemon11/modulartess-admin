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
  /*
   * Los dos conflictos del alta. **No son conflictos de versión**: el producto ni siquiera llegó a
   * crearse, y «alguien lo modificó» mandaba a recargar algo que no existe. El backend no libera
   * nunca un SKU ni un slug, tampoco los de productos archivados, y eso es lo que hay que decir.
   */
  sku_conflict:
    'Ese SKU ya está reservado, incluso si pertenece a un producto archivado. Usa otro SKU.',
  slug_conflict:
    'Esa URL ya está reservada, incluso si pertenece a un producto archivado. Usa otra.',
  variant_sku_conflict:
    'Ese SKU de variante ya está reservado, incluso si pertenece a una variante archivada. Usa otro.',
  variant_combination_conflict:
    'Ya existe una variante con esa combinación de atributos. Cambia algún valor.',
  image_limit:
    'El producto ya tiene el máximo de imágenes activas. Archiva alguna antes de subir otra.',
  idempotency_conflict:
    'Esa operación ya se había enviado con otros datos. Recarga el producto antes de repetirla.',
  category_not_found:
    'La categoría elegida ya no existe en el catálogo. Elige otra o deja el producto sin categoría.',
  category_archived:
    'La categoría elegida está archivada y no admite nuevas asignaciones. Elige una categoría activa.',
  category_name_conflict:
    'Ya existe una categoría con ese nombre. Se comparan sin tildes ni mayúsculas: «Clósets» y «closets» son el mismo.',
  category_slug_conflict:
    'Ya existe una categoría con ese slug. Un slug no se libera nunca, ni siquiera al archivar: usa otro.',
  category_version_conflict:
    'Alguien modificó esta categoría mientras la mirabas. Se muestra la versión actual: revísala y vuelve a intentarlo.',
  category_invalid:
    'El nombre o el slug no tienen una forma válida. El slug va en minúsculas, con números y guiones.',
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

/**
 * Mensaje para un fallo del catálogo.
 *
 * Un conflicto que el panel no reconoce se dice como tal, con su código para diagnóstico, en lugar
 * de disfrazarlo de conflicto de versión. `reference` ya llega validado como identificador.
 */
export function describeCatalogFailure(code: string, reference?: string): string {
  if (code === 'conflict_unrecognized') {
    return `El backend rechazó la operación por un conflicto que el panel no reconoce (código: ${
      reference ?? 'sin código'
    }). No se aplicó el cambio.`;
  }

  return CATALOG_MESSAGES[code] ?? GENERIC_CATALOG_MESSAGE;
}

/** El campo del producto al que apunta un fallo, para marcarlo y llevar el foco ahí. */
export type ProductFailureField = 'sku' | 'slug' | 'category';

export function productFailureField(code: string): ProductFailureField | null {
  switch (code) {
    case 'sku_conflict':
      return 'sku';
    case 'slug_conflict':
      return 'slug';
    case 'category_not_found':
    case 'category_archived':
      return 'category';
    default:
      return null;
  }
}

/**
 * ¿Este fallo se arregla releyendo?
 *
 * **Solo** el conflicto de versión. Un SKU repetido, un slug reservado o un conflicto sin código
 * conocido no mejoran recargando, y ofrecerlo era el síntoma del error anterior.
 */
export function offersReload(code: string): boolean {
  return code === 'version_conflict';
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
    case 'backend_product_category_invalid':
      return CATALOG_MESSAGES.category_invalid ?? GENERIC_CATALOG_MESSAGE;
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
