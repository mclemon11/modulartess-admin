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

  constructor(code: BackendFailureCode) {
    super(`backend failure: ${code}`);
    this.name = 'BackendFailure';
    this.code = code;
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
