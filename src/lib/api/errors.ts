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
  /** 404 del backend: la superficie administrativa está desactivada en ese despliegue. */
  'backend_surface_disabled',
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

/** Traduce el estado HTTP del backend a un código interno estable. */
export function failureCodeFromStatus(status: number): BackendFailureCode {
  switch (status) {
    case 401:
      return 'backend_unauthorized';
    case 403:
      return 'backend_forbidden';
    case 404:
      return 'backend_surface_disabled';
    case 429:
      return 'backend_rate_limited';
    case 503:
      return 'backend_unavailable';
    default:
      return status >= 500 ? 'backend_unavailable' : 'backend_unexpected';
  }
}
