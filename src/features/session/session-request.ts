/**
 * Validación del cuerpo de `POST /api/admin/auth/session`.
 *
 * Módulo puro. Los límites replican el contrato OpenAPI (`AdminSessionRequestDto`: `idToken`
 * obligatorio, entre 32 y 4096 caracteres, sin campos adicionales). Validar aquí evita gastar una
 * llamada al backend y un identity token en un cuerpo que ya se sabe inválido.
 *
 * El cuerpo **nunca** se registra: contiene un ID token de Firebase.
 */

/** Del contrato: `AdminSessionRequestDto.idToken.minLength`. */
export const ID_TOKEN_MIN_LENGTH = 32;

/** Del contrato: `AdminSessionRequestDto.idToken.maxLength`. */
export const ID_TOKEN_MAX_LENGTH = 4096;

/** Corte del cuerpo crudo antes de intentar interpretarlo, con holgura sobre el token. */
export const MAX_REQUEST_BODY_BYTES = 8192;

const ENCODER = new TextEncoder();

/**
 * Longitud del cuerpo en **bytes UTF-8**.
 *
 * `String.length` cuenta unidades UTF-16, no bytes: un cuerpo lleno de caracteres multibyte puede
 * tener menos caracteres que el límite y aun así pesar bastante más. El corte tiene que medir lo
 * que de verdad se recibió.
 */
export function utf8ByteLength(value: string): number {
  return ENCODER.encode(value).byteLength;
}

/** Comprobación definitiva del tamaño, en bytes. */
export function exceedsBodyByteLimit(value: string): boolean {
  return utf8ByteLength(value) > MAX_REQUEST_BODY_BYTES;
}

export const REQUIRED_CONTENT_TYPE = 'application/json';

export type SessionRequestParse =
  { readonly ok: true; readonly idToken: string } | { readonly ok: false };

/** Acepta `application/json`, con o sin parámetros (`; charset=utf-8`). Nada más. */
export function hasJsonContentType(contentType: string | null): boolean {
  if (contentType === null) {
    return false;
  }

  const [mediaType] = contentType.split(';');

  return mediaType?.trim().toLowerCase() === REQUIRED_CONTENT_TYPE;
}

/**
 * Acepta **exactamente** `{ idToken: string }`.
 *
 * Un campo adicional se rechaza en lugar de ignorarse: el contrato del backend también lo rechaza
 * (`invalid_request`), y aceptarlo aquí escondería una discrepancia entre las dos capas.
 */
export function parseSessionRequest(value: unknown): SessionRequestParse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false };
  }

  const keys = Object.keys(value);

  if (keys.length !== 1 || keys[0] !== 'idToken') {
    return { ok: false };
  }

  const { idToken } = value as { idToken: unknown };

  if (
    typeof idToken !== 'string' ||
    idToken.length < ID_TOKEN_MIN_LENGTH ||
    idToken.length > ID_TOKEN_MAX_LENGTH
  ) {
    return { ok: false };
  }

  return { ok: true, idToken };
}
