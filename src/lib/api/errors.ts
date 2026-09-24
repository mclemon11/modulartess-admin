/**
 * Taxonomía de fallos del BFF.
 *
 * Todo lo que pueda ir mal —red, IAM, contrato, configuración— se traduce a uno de estos códigos
 * **estables**. Nunca se propaga el `message` de la excepción original, ni el cuerpo crudo del
 * backend, ni un detalle de Firebase o de Google: esos textos pueden llevar UID, correos, la
 * audiencia o fragmentos de token.
 */

export const BACKEND_FAILURE_CODES = [
  /** El entorno server-only está ausente o mal formado. */
  'backend_misconfigured',
  /** 401 del backend: sesión o token inválido, caducado o revocado. */
  'backend_unauthorized',
  /** 403 del backend: identidad válida sin el rol administrativo. */
  'backend_forbidden',
  /** 404 en la superficie de sesión: el despliegue no tiene la superficie administrativa. */
  'backend_surface_disabled',
  /** 404 en un recurso: el producto no existe. */
  'backend_not_found',
  /** 400 del backend: el cuerpo no cumple el contrato. */
  'backend_invalid_request',
  /** 409 del backend: `expectedVersion` obsoleto o recurso duplicado. */
  'backend_conflict',
  /**
   * 409 `order_cancellation_requires_refund`.
   *
   * Se separa del conflicto genérico porque el panel tiene algo concreto que decir: no es que la
   * versión esté obsoleta, es que cancelar un pedido pagado exigiría devolver el dinero y el flujo
   * de reembolso todavía no existe. Ofrecer «recargar» ante esto sería un consejo inútil.
   */
  'backend_refund_required',
  /**
   * 409 `order_payment_transition_invalid`.
   *
   * El resultado de pago no cabe desde el estado actual del pago —por ejemplo, aprobar dos veces—.
   * No es un `expectedVersion` obsoleto: recargar no lo convierte en válido, así que el panel lo
   * dice con sus palabras en lugar de ofrecer un botón que no arregla nada.
   */
  'backend_payment_transition_invalid',
  /**
   * 409 `order_payment_conflict`.
   *
   * El mismo `eventId` se reutilizó con otro resultado. Es exactamente lo que la idempotencia tiene
   * que impedir, y merece un texto propio: repetir la petición no lo resuelve.
   */
  'backend_payment_conflict',
  /**
   * 404 del simulador: este despliegue no lo tiene encendido.
   *
   * El contrato dice que la ruta responde «as if it did not exist» cuando el simulador está
   * apagado, con el código `not_found` en vez de `order_not_found`. Confundirlo con «ese pedido no
   * existe» mandaría a alguien a buscar un pedido que sí está.
   */
  'backend_simulator_disabled',
  /**
   * 400 `dashboard_query_invalid`.
   *
   * El período pedido no existe, la fecha está mal formada, el rango está invertido o es más largo
   * del máximo, o llegaron `from`/`to` con un período que no es `custom`. Se separa del `400`
   * genérico porque tiene una salida concreta: volver al período de 30 días.
   */
  'backend_dashboard_query_invalid',
  /**
   * 503 `dashboard_unavailable`.
   *
   * El resumen no se pudo calcular. Se separa del `503` genérico para poder decir de qué se trata:
   * el resto del panel puede seguir funcionando.
   */
  'backend_dashboard_unavailable',
  /**
   * 400 `payment_integration_invalid`.
   *
   * La configuración de la pasarela no cumple el contrato: prefijo de credencial
   * equivocado, mezcla de ambientes, configuración incompleta al encender. Se
   * separa del `400` genérico porque tiene una salida concreta —corregir el
   * campo— y porque su motivo **nunca** puede llevar el valor que se rechazó.
   */
  'backend_payment_integration_invalid',
  /**
   * 409 `payment_integration_conflict`.
   *
   * Alguien cambió la configuración, o la incidencia, entre la lectura y la
   * escritura. Se resuelve releyendo, y por eso se distingue del resto.
   */
  'backend_payment_integration_conflict',
  /**
   * 409 `wompi_live_payments_not_enabled`.
   *
   * Producción está bloqueada **por código**, no por configuración. Merece un
   * texto propio: quien lo recibe no tiene ninguna casilla que marcar, y
   * tratarlo como un conflicto normal lo mandaría a buscarla.
   */
  'backend_live_payments_not_enabled',
  /**
   * 400 `wompi_credentials_environment_mismatch`.
   *
   * Las llaves son válidas pero del otro ambiente, o están mezcladas entre sí.
   * Es **el error frecuente**: el panel de Wompi enseña las de producción por
   * omisión. Merece un texto propio porque se arregla cambiando el selector, no
   * volviendo a copiar nada.
   */
  'backend_wompi_credentials_environment_mismatch',
  /** 400 `wompi_credential_prefix_invalid`: no son llaves de Wompi. */
  'backend_wompi_credential_prefix_invalid',
  /** 400 `wompi_credentials_incomplete`: falta alguna de las cuatro, o llegó en blanco. */
  'backend_wompi_credentials_incomplete',
  /** 404 `payment_incident_not_found`: esa incidencia ya no existe. */
  'backend_payment_incident_not_found',
  /**
   * 503 `payment_provider_unavailable`.
   *
   * El proveedor no respondió, o el almacén de secretos no se pudo escribir. El
   * resto del panel sigue funcionando, así que se dice de qué se trata.
   */
  'backend_payment_provider_unavailable',
  /**
   * 409 `product_sku_conflict` y `product_slug_conflict`.
   *
   * El SKU o el slug ya están reservados, **también por productos archivados**: el backend no los
   * libera nunca. No tienen nada que ver con la versión, y tratarlos como «alguien modificó este
   * producto» mandaba a recargar un producto que ni siquiera se llegó a crear.
   */
  'backend_product_sku_conflict',
  'backend_product_slug_conflict',
  /** 409 `product_variant_sku_conflict`: el SKU de la variante ya está reservado. */
  'backend_product_variant_sku_conflict',
  /** 409 `product_variant_combination_conflict`: ya hay una variante con esa combinación. */
  'backend_product_variant_combination_conflict',
  /** 409 `product_image_limit`: el producto ya tiene el máximo de imágenes activas. */
  'backend_product_image_limit',
  /** 409 `idempotency_conflict`: la misma clave llegó con otro cuerpo. */
  'backend_idempotency_conflict',
  /**
   * `product_category_not_found` y `product_category_archived` al asignar una categoría.
   *
   * El contrato publica el primero en el catálogo de categorías; el segundo es el rechazo que
   * corresponde a asignar una archivada. Se traducen aquí para que lleguen con su texto si el
   * backend los devuelve desde el producto, en lugar de caer en un conflicto genérico.
   */
  'backend_product_category_not_found',
  'backend_product_category_archived',
  /** 409 `product_category_name_conflict`: el nombre ya existe, sin distinguir tildes ni mayúsculas. */
  'backend_product_category_name_conflict',
  /** 409 `product_category_slug_conflict`: el slug ya existe. Un slug nunca se libera. */
  'backend_product_category_slug_conflict',
  /** 409 `product_category_version_conflict`: la categoría cambió entre la lectura y el envío. */
  'backend_product_category_version_conflict',
  /** 400 `product_category_invalid`: nombre o slug con una forma que el contrato no admite. */
  'backend_product_category_invalid',
  /**
   * 409 con un código que el panel no conoce, o sin código.
   *
   * **No se convierte en conflicto de versión.** Esa traducción genérica es la que hacía decir
   * «alguien modificó este producto» ante un SKU repetido. El código original viaja aparte, en
   * `BackendFailure.reference`, para poder diagnosticarlo.
   */
  'backend_conflict_unrecognized',
  /** 429 del backend: el intercambio está limitado por tasa. */
  'backend_rate_limited',
  /** 503, red, DNS o expiración del temporizador. */
  'backend_unavailable',
  /** El backend respondió bien, pero incumplió el contrato (falta el encabezado, expiración inválida). */
  'backend_contract_violation',
  /** Cualquier otra cosa. */
  'backend_unexpected',
] as const;

export type BackendFailureCode = (typeof BACKEND_FAILURE_CODES)[number];

/**
 * Error interno del BFF. El `message` es fijo por código y no incluye nada del origen del fallo,
 * de modo que registrarlo por accidente no filtraría datos.
 */
export class BackendFailure extends Error {
  readonly code: BackendFailureCode;
  /**
   * Código estable que devolvió el backend cuando el panel no lo reconoce, para diagnóstico.
   *
   * Solo llega aquí si pasa {@link safeErrorReference}: un identificador en `snake_case`, nunca un
   * mensaje. `null` en el resto de los casos.
   */
  readonly reference: string | null;

  constructor(code: BackendFailureCode, reference: string | null = null) {
    super(`backend failure: ${code}`);
    this.name = 'BackendFailure';
    this.code = code;
    this.reference = reference;
  }
}

export function isBackendFailure(value: unknown): value is BackendFailure {
  return value instanceof BackendFailure;
}

/**
 * Traduce el estado HTTP del backend a un código interno estable.
 *
 * `notFound` existe porque un `404` significa dos cosas distintas según la superficie: en
 * `/v1/admin/auth/session` es «este despliegue no tiene superficie administrativa», y en
 * `/v1/admin/products/{id}` es «ese producto no existe». Quien llama sabe cuál de las dos aplica;
 * confundirlas mostraría «servicio no disponible» ante un id inexistente.
 */
export function failureCodeFromStatus(
  status: number,
  options: { readonly notFound: BackendFailureCode } = { notFound: 'backend_surface_disabled' },
): BackendFailureCode {
  switch (status) {
    case 400:
      return 'backend_invalid_request';
    case 401:
      return 'backend_unauthorized';
    case 403:
      return 'backend_forbidden';
    case 404:
      return options.notFound;
    case 409:
      return 'backend_conflict';
    case 429:
      return 'backend_rate_limited';
    case 503:
      return 'backend_unavailable';
    default:
      return status >= 500 ? 'backend_unavailable' : 'backend_unexpected';
  }
}

/**
 * Un código de error del backend es seguro de mostrar solo si es un identificador.
 *
 * Minúsculas, dígitos y guiones bajos, empezando por letra y con un tope de longitud. Cualquier
 * otra cosa —un mensaje, un correo, un fragmento de token— se descarta: el `message` del backend no
 * se propaga nunca, y un campo `code` con forma de frase tampoco.
 */
const SAFE_REFERENCE = /^[a-z][a-z0-9_]{0,63}$/;

export function safeErrorReference(value: unknown): string | null {
  return typeof value === 'string' && SAFE_REFERENCE.test(value) ? value : null;
}

/**
 * El `code` del cuerpo de error del backend, si tiene forma de identificador.
 *
 * El `message` no se mira: su forma cambia sin aviso y puede nombrar datos.
 */
export function upstreamErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }

  return safeErrorReference((error as { code: unknown }).code);
}

/**
 * Códigos del catálogo que el panel traduce uno a uno, sea cual sea el estado HTTP con el que
 * lleguen.
 *
 * `product_version_conflict` y `product_category_version_conflict` son los **únicos** conflictos de
 * versión: son los que se arreglan releyendo.
 */
const CATALOG_CODES: Readonly<Record<string, BackendFailureCode>> = {
  product_version_conflict: 'backend_conflict',
  product_sku_conflict: 'backend_product_sku_conflict',
  product_slug_conflict: 'backend_product_slug_conflict',
  product_variant_sku_conflict: 'backend_product_variant_sku_conflict',
  product_variant_combination_conflict: 'backend_product_variant_combination_conflict',
  product_image_limit: 'backend_product_image_limit',
  idempotency_conflict: 'backend_idempotency_conflict',
  product_category_not_found: 'backend_product_category_not_found',
  product_category_archived: 'backend_product_category_archived',
  product_category_name_conflict: 'backend_product_category_name_conflict',
  product_category_slug_conflict: 'backend_product_category_slug_conflict',
  product_category_version_conflict: 'backend_product_category_version_conflict',
  product_category_invalid: 'backend_product_category_invalid',
};

/**
 * Traduce una respuesta fallida del catálogo a un fallo estable.
 *
 * Primero el código del cuerpo; si no es uno de los conocidos, el estado HTTP. Un `409` que no se
 * reconoce **no** se convierte en conflicto de versión: se conserva su código como referencia.
 */
export function catalogFailure(
  status: number,
  error: unknown,
  options: { readonly notFound: BackendFailureCode } = { notFound: 'backend_not_found' },
): BackendFailure {
  const code = upstreamErrorCode(error);

  if (code !== null && Object.hasOwn(CATALOG_CODES, code)) {
    return new BackendFailure(CATALOG_CODES[code] as BackendFailureCode);
  }

  if (status === 409) {
    return new BackendFailure('backend_conflict_unrecognized', code);
  }

  return new BackendFailure(failureCodeFromStatus(status, options));
}
