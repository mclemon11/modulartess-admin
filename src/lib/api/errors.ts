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
   * 400 `order_shipment_invalid`: marcar enviado exige transportadora, número de guía y un enlace
   * HTTPS de seguimiento válidos, y ninguna otra transición los acepta.
   */
  'backend_order_shipment_invalid',
  /**
   * Edición de pedidos (ADR 0028 del backend). `order_edit_blocked` lleva su motivo de una lista
   * cerrada en `reference`; las líneas rechazadas por el catálogo llevan el código del backend.
   */
  'backend_order_edit_blocked',
  'backend_order_line_rejected',
  /**
   * 400 `order_reconciliation_invalid` (ADR 0029 del backend): la conciliación está incompleta o mal
   * escrita. Su motivo, de una lista cerrada, viaja en `reference`.
   */
  'backend_order_reconciliation_invalid',
  'backend_order_transition_invalid',
  /**
   * 409 `order_status_reminder_not_allowed`: el pedido está cancelado y no admite un recordatorio
   * de estado. Recargar no lo cambia, así que tiene su propio texto.
   */
  'backend_status_reminder_not_allowed',
  /**
   * 503 `notifications_unavailable`: la entrega de correo está apagada en este despliegue y el
   * backend **no escribió nada**. No es una caída genérica: no hay recordatorio pendiente.
   */
  'backend_notifications_unavailable',
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
  /**
   * Addi (ADR 0030 del backend; ADR 0015 del panel). Cuatro códigos propios porque llevan a
   * acciones distintas:
   *
   * - 400 `addi_configuration_invalid`: algún campo no tiene forma válida; volver a copiarlo.
   * - 409 `addi_configuration_incomplete`: faltan el slug o alguna credencial para activar.
   * - 409 `addi_connection_test_required`: hay que superar la prueba de autenticación antes.
   * - 409 `addi_live_payments_not_enabled`: lo bloquea el despliegue, no una casilla del panel.
   */
  'backend_addi_configuration_invalid',
  'backend_addi_configuration_incomplete',
  'backend_addi_connection_test_required',
  'backend_addi_live_payments_not_enabled',
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
  /**
   * 409 `product_attribute_option_in_use`: se intentó retirar un color o acabado que usan variantes
   * activas. No se arregla recargando: hay que archivar antes esas variantes.
   */
  'backend_product_attribute_option_in_use',
  /** 409 `product_image_limit`: el producto ya tiene el máximo de imágenes activas. */
  'backend_product_image_limit',
  /**
   * Galería multimedia (ADR 0026 del backend). `product_video_invalid` lleva un motivo de una lista
   * cerrada —tamaño, tipo, contenedor, póster…—, que viaja en `BackendFailure.reference` para que el
   * panel diga exactamente qué falló.
   */
  'backend_product_video_invalid',
  'backend_product_video_not_found',
  'backend_product_video_limit',
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
   * Administración de cuentas (ADR 0019 del backend), uno por código publicado.
   *
   * - `admin_user_email_taken`: el correo ya es de una cuenta administrativa o de otra identidad.
   * - `admin_user_last_super_admin`: dejaría el sistema sin ningún `super_admin` activo.
   * - `admin_user_self_change`: nadie se deshabilita ni se cambia el rol a sí mismo.
   * - `admin_user_state_conflict`: la acción no vale para el estado actual de la cuenta.
   * - `admin_user_invitation_recently_sent`: la última invitación salió hace menos de un minuto.
   * - `admin_user_sync_pending` (503): el cambio quedó registrado y la cuenta ya no puede entrar,
   *   pero Firebase aún no lo refleja. Repetir la misma petición lo termina.
   */
  'backend_admin_user_email_taken',
  'backend_admin_user_last_super_admin',
  'backend_admin_user_self_change',
  'backend_admin_user_state_conflict',
  'backend_admin_user_invitation_recently_sent',
  'backend_admin_user_sync_pending',
  /**
   * 409 con un código que el panel no conoce, o sin código.
   *
   * **No se convierte en conflicto de versión.** Esa traducción genérica es la que hacía decir
   * «alguien modificó este producto» ante un SKU repetido. El código original viaja aparte, en
   * `BackendFailure.reference`, para poder diagnosticarlo.
   */
  /** 409 `conversation_state_conflict`: la acción no cabe en el estado de la conversación. */
  'backend_conversation_state_conflict',
  /** 409 `attachment_unavailable`: el adjunto se rechazó, está retenido o aún no se guardó. */
  'backend_attachment_unavailable',
  /** 503 `communications_reply_unavailable`: este despliegue no tiene clave de envío para responder. */
  'backend_reply_unavailable',
  'backend_conflict_unrecognized',
  /**
   * Zonas de envío (ADR 0025 del backend), uno por código publicado.
   *
   * - `shipping_zone_not_found` / `shipping_rule_not_found` (404).
   * - `shipping_invalid` (400): el cuerpo no cumple el contrato —tarifa, cobertura, vigencia—.
   * - `shipping_transition_invalid` (409): la acción no cabe en el estado actual —una zona
   *   archivada, una copia que no está lista—. Recargar enseña el estado, no lo arregla.
   * - `shipping_zone_ambiguous` (409): otra zona activa con la misma prioridad cubre un municipio
   *   al mismo nivel. Se arregla cambiando prioridad o cobertura, no recargando.
   * - `shipping_ruleset_changed` (409): la configuración cambió durante la comprobación; repetir.
   * - `geography_department_not_found` (404): el código DIVIPOLA no existe.
   */
  'backend_shipping_zone_not_found',
  'backend_shipping_rule_not_found',
  'backend_shipping_invalid',
  'backend_shipping_transition_invalid',
  'backend_shipping_zone_ambiguous',
  'backend_shipping_ruleset_changed',
  'backend_geography_department_not_found',
  /** 404 `shipping_copy_operation_not_found`: esa operación de copia no existe. */
  'backend_shipping_copy_operation_not_found',
  /** 404 `shipping_product_not_found`: el producto no existe para envíos. */
  'backend_shipping_product_not_found',
  /**
   * 400 a una lectura paginada que llevaba cursor: el cursor está alterado, caducó o es de otros
   * filtros (el contrato lo ata a ellos). Se arregla volviendo a la primera página.
   */
  'backend_cursor_invalid',
  /**
   * 503 a una lectura con búsqueda o filtros: la consulta del backend todavía no se puede resolver
   * —típicamente, falta desplegar su índice—. Sin filtros el listado sigue funcionando.
   */
  'backend_query_unavailable',
  /**
   * Rechazos de producto en la vista previa (`order_*`): el contrato dice que la vista previa
   * valida los productos como un pedido. Cada uno tiene una salida distinta.
   */
  'backend_preview_product_unavailable',
  'backend_preview_variant_required',
  'backend_preview_variant_unavailable',
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
  product_attribute_option_in_use: 'backend_product_attribute_option_in_use',
  product_image_limit: 'backend_product_image_limit',
  product_video_not_found: 'backend_product_video_not_found',
  product_video_limit: 'backend_product_video_limit',
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

  // El motivo se valida como identificador, igual que cualquier referencia: nunca un texto libre.
  if (code === 'product_video_invalid') {
    const reason =
      typeof error === 'object' && error !== null && 'reason' in error
        ? safeErrorReference((error as { reason: unknown }).reason)
        : null;

    return new BackendFailure('backend_product_video_invalid', reason);
  }

  if (code !== null && Object.hasOwn(CATALOG_CODES, code)) {
    return new BackendFailure(CATALOG_CODES[code] as BackendFailureCode);
  }

  if (status === 409) {
    return new BackendFailure('backend_conflict_unrecognized', code);
  }

  return new BackendFailure(failureCodeFromStatus(status, options));
}

/**
 * Códigos de la administración de cuentas, uno a uno.
 *
 * El conflicto de versión es el único que ofrece recargar. `admin_user_invalid` y
 * `admin_user_not_found` no necesitan fila: el estado (400 y 404) ya los traduce bien.
 */
const ACCOUNT_CODES: Readonly<Record<string, BackendFailureCode>> = {
  admin_user_version_conflict: 'backend_conflict',
  admin_user_email_taken: 'backend_admin_user_email_taken',
  admin_user_last_super_admin: 'backend_admin_user_last_super_admin',
  admin_user_self_change: 'backend_admin_user_self_change',
  admin_user_state_conflict: 'backend_admin_user_state_conflict',
  admin_user_invitation_recently_sent: 'backend_admin_user_invitation_recently_sent',
  admin_user_sync_pending: 'backend_admin_user_sync_pending',
  idempotency_conflict: 'backend_idempotency_conflict',
};

/**
 * Traduce un fallo de `/v1/admin/users/*`.
 *
 * Primero el código del cuerpo, nunca el mensaje. Un 409 desconocido no se convierte en conflicto
 * de versión: viaja como `backend_conflict_unrecognized` con su código de referencia.
 */
export function accountFailure(status: number, error: unknown): BackendFailure {
  const code = upstreamErrorCode(error);

  if (code !== null && Object.hasOwn(ACCOUNT_CODES, code)) {
    return new BackendFailure(ACCOUNT_CODES[code] as BackendFailureCode);
  }

  if (status === 409) {
    return new BackendFailure('backend_conflict_unrecognized', code);
  }

  return new BackendFailure(failureCodeFromStatus(status, { notFound: 'backend_not_found' }));
}

/**
 * Códigos de la bandeja (`/v1/admin/communications/*`), uno a uno.
 *
 * `conversation_version_conflict` es el único que ofrece recargar. `communications_invalid`,
 * `conversation_not_found` y `communications_unavailable` no necesitan fila: el estado ya los
 * traduce bien.
 */
const COMMUNICATIONS_CODES: Readonly<Record<string, BackendFailureCode>> = {
  conversation_version_conflict: 'backend_conflict',
  conversation_state_conflict: 'backend_conversation_state_conflict',
  attachment_unavailable: 'backend_attachment_unavailable',
  communications_reply_unavailable: 'backend_reply_unavailable',
  idempotency_conflict: 'backend_idempotency_conflict',
};

export function communicationsFailure(status: number, error: unknown): BackendFailure {
  const code = upstreamErrorCode(error);

  if (code !== null && Object.hasOwn(COMMUNICATIONS_CODES, code)) {
    return new BackendFailure(COMMUNICATIONS_CODES[code] as BackendFailureCode);
  }

  if (status === 409) {
    return new BackendFailure('backend_conflict_unrecognized', code);
  }

  return new BackendFailure(failureCodeFromStatus(status, { notFound: 'backend_not_found' }));
}

/**
 * Códigos de las zonas de envío (`/v1/admin/shipping/*` y `/v1/geography/*`), uno a uno.
 *
 * Los dos conflictos de versión —de zona y de regla— son los **únicos** que ofrecen recargar.
 * `shipping_idempotency_conflict` comparte texto con el resto de la idempotencia del panel, y
 * `shipping_unavailable` es un 503 normal. Del cuerpo solo se lee `code`: `message` es informativo
 * y nunca se analiza. Una copia de zona no llega como error: es el recurso tipado de su operación.
 */
const SHIPPING_CODES: Readonly<Record<string, BackendFailureCode>> = {
  shipping_zone_version_conflict: 'backend_conflict',
  shipping_rule_version_conflict: 'backend_conflict',
  shipping_zone_not_found: 'backend_shipping_zone_not_found',
  shipping_rule_not_found: 'backend_shipping_rule_not_found',
  shipping_invalid: 'backend_shipping_invalid',
  shipping_transition_invalid: 'backend_shipping_transition_invalid',
  shipping_zone_ambiguous: 'backend_shipping_zone_ambiguous',
  shipping_ruleset_changed: 'backend_shipping_ruleset_changed',
  shipping_copy_operation_not_found: 'backend_shipping_copy_operation_not_found',
  shipping_product_not_found: 'backend_shipping_product_not_found',
  shipping_idempotency_conflict: 'backend_idempotency_conflict',
  shipping_unavailable: 'backend_unavailable',
  geography_department_not_found: 'backend_geography_department_not_found',
  order_product_unavailable: 'backend_preview_product_unavailable',
  order_variant_required: 'backend_preview_variant_required',
  order_variant_unavailable: 'backend_preview_variant_unavailable',
};

export function shippingFailure(status: number, error: unknown): BackendFailure {
  const code = upstreamErrorCode(error);

  if (code !== null && Object.hasOwn(SHIPPING_CODES, code)) {
    return new BackendFailure(SHIPPING_CODES[code] as BackendFailureCode);
  }

  if (status === 409) {
    return new BackendFailure('backend_conflict_unrecognized', code);
  }

  return new BackendFailure(failureCodeFromStatus(status, { notFound: 'backend_not_found' }));
}

/**
 * Fallo de una **lectura paginada o filtrada**.
 *
 * Un 400 cuando se mandó cursor es un cursor inválido —el contrato lo ata a los filtros—, y un 503
 * cuando se mandó búsqueda o filtros es una consulta que el backend aún no puede resolver. Lo demás
 * se traduce como cualquier otro fallo de su superficie.
 */
export function listingFailure(
  failure: BackendFailure,
  sent: { readonly cursor: boolean; readonly filtered: boolean },
): BackendFailure {
  if (
    sent.cursor &&
    (failure.code === 'backend_shipping_invalid' || failure.code === 'backend_invalid_request')
  ) {
    return new BackendFailure('backend_cursor_invalid');
  }

  if (sent.filtered && failure.code === 'backend_unavailable') {
    return new BackendFailure('backend_query_unavailable');
  }

  return failure;
}

/** Códigos de línea que el backend usa al resolver productos contra el catálogo. */
const ORDER_LINE_CODES: ReadonlySet<string> = new Set([
  'order_product_unavailable',
  'order_variant_required',
  'order_variant_unavailable',
  'order_out_of_stock',
  'order_shipping_unavailable',
]);

/**
 * Traduce una respuesta fallida de la edición de un pedido a un fallo estable.
 *
 * Distingue lo que el panel tiene que explicar de forma distinta: conflicto de versión (recargar),
 * bloqueo con su motivo, transición inexistente, línea rechazada por el catálogo y datos de envío
 * inválidos. El resto cae al estado HTTP. Ningún texto del backend viaja: solo identificadores.
 */
export function orderEditFailure(status: number, error: unknown): BackendFailure {
  const code = upstreamErrorCode(error);

  if (code === 'order_version_conflict') return new BackendFailure('backend_conflict');
  if (code === 'order_edit_blocked') {
    const reason =
      typeof error === 'object' && error !== null && 'reason' in error
        ? safeErrorReference((error as { reason: unknown }).reason)
        : null;

    return new BackendFailure('backend_order_edit_blocked', reason);
  }
  if (code === 'order_reconciliation_invalid') {
    const reason =
      typeof error === 'object' && error !== null && 'reason' in error
        ? safeErrorReference((error as { reason: unknown }).reason)
        : null;

    return new BackendFailure('backend_order_reconciliation_invalid', reason);
  }
  if (code === 'order_transition_invalid') {
    return new BackendFailure('backend_order_transition_invalid');
  }
  if (code === 'order_shipment_invalid')
    return new BackendFailure('backend_order_shipment_invalid');
  if (code !== null && ORDER_LINE_CODES.has(code)) {
    return new BackendFailure('backend_order_line_rejected', code);
  }

  return new BackendFailure(failureCodeFromStatus(status, { notFound: 'backend_not_found' }), code);
}
