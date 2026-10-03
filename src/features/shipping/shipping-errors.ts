/**
 * Fallos de envíos en español, uno por código estable del BFF.
 *
 * Se traduce desde el **código**, nunca desde el mensaje del backend. No hay trazas, rutas internas
 * ni identificadores: como mucho, la referencia de un código que el panel aún no conoce, que es un
 * identificador validado en `snake_case`.
 */

import type { ShippingTargetItemResult } from '@/lib/api/shipping';

const MESSAGES: Readonly<Record<string, string>> = {
  version_conflict:
    'Otro administrador modificó esta zona mientras la editabas. No se guardó nada: recarga la versión actual y vuelve a aplicar tu cambio.',
  shipping_zone_not_found: 'Esa zona de envío no existe. Puede que la hayan descartado.',
  shipping_rule_not_found: 'Esa regla de envío no existe.',
  shipping_zone_ambiguous:
    'Cobertura ambigua: otra zona activa con la misma prioridad cubre un municipio al mismo nivel. Cambia la prioridad o la cobertura; no se aplicó nada.',
  shipping_invalid:
    'El backend rechazó los datos: revisa la tarifa, la cobertura, la prioridad o la vigencia. No se guardó nada.',
  shipping_transition_invalid:
    'Esa acción no aplica a la zona en su estado actual: una zona archivada no se edita (se restaura como borrador), solo una archivada se restaura, y una copia que no está lista no se edita, ni se activa, ni se restaura. Recarga para ver cómo está.',
  shipping_ruleset_changed:
    'La configuración de envíos cambió mientras se comprobaba. Vuelve a intentarlo; no se aplicó nada.',
  copy_operation_not_found: 'Esa operación de copia no existe.',
  shipping_product_not_found: 'Ese producto no existe para envíos.',
  cursor_invalid:
    'La página pedida ya no es válida para estos filtros: el cursor está alterado o es de otra búsqueda. Vuelve a la primera página.',
  query_unavailable:
    'Esa búsqueda o ese filtro todavía no están disponibles en el backend (puede faltar desplegar su índice). Sin filtros, el listado sigue funcionando.',
  idempotency_conflict:
    'Esa operación ya se envió con otros datos (clave de idempotencia repetida). No se aplicó nada nuevo.',
  geography_department_not_found: 'Ese departamento no existe en la división oficial.',
  preview_product_unavailable:
    'Uno de los productos no está disponible: puede estar archivado o sin publicar. Quítalo de la vista previa.',
  preview_variant_required: 'Uno de los productos tiene variantes: elige cuál.',
  preview_variant_unavailable: 'Una de las variantes elegidas no está disponible.',
  admin_role_required:
    'Permiso insuficiente: tu rol no puede hacer ese cambio en envíos. No se cambió nada.',
  session_required: 'Tu sesión terminó. Vuelve a iniciar sesión.',
  invalid_origin: 'La petición no proviene de un origen autorizado.',
  invalid_request: 'La petición no tiene el formato esperado. Revisa los campos marcados.',
  not_found: 'No encontramos ese recurso.',
  too_many_requests: 'Demasiados intentos seguidos. Espera un minuto.',
  service_unavailable: 'El servicio de envíos no respondió. Inténtalo de nuevo en unos momentos.',
  internal_error: 'No pudimos completar la operación. Inténtalo de nuevo en unos momentos.',
};

export function describeShippingFailure(code: string, reference?: string): string {
  const message = MESSAGES[code];

  if (message !== undefined) return message;
  if (code === 'conflict_unrecognized' && reference !== undefined) {
    return `El backend rechazó la operación (${reference}). No se aplicó nada.`;
  }

  return 'No pudimos completar la operación. No se aplicó nada nuevo.';
}

/** Solo el conflicto de versión y un estado que ya no es el que se veía ofrecen recargar. */
export function offersReload(code: string): boolean {
  return (
    code === 'version_conflict' ||
    code === 'shipping_transition_invalid' ||
    code === 'shipping_zone_not_found'
  );
}

/**
 * ¿Se conserva la clave de idempotencia para reintentar?
 *
 * Sí cuando el desenlace es incierto o quedó a medias: red, 5xx y la copia fallida. Repetir con la
 * misma clave termina **esa** operación en el backend en lugar de lanzar otra.
 */
export function keepsKey(code: string): boolean {
  return (
    code === 'service_unavailable' || code === 'internal_error' || code === 'too_many_requests'
  );
}

/** Motivo de un elemento que no se pudo asignar o retirar. */
export const TARGET_FAILURE_LABELS: Readonly<
  Record<NonNullable<ShippingTargetItemResult['code']>, string>
> = {
  target_taken: 'Ya lo tiene otra regla activa de esta zona.',
  product_not_found: 'El producto no existe.',
  category_not_found: 'La categoría no existe.',
};

export const TARGET_OUTCOME_LABELS: Readonly<Record<ShippingTargetItemResult['outcome'], string>> =
  {
    added: 'Asignado',
    removed: 'Retirado',
    unchanged: 'Sin cambios',
    failed: 'No aplicado',
  };
