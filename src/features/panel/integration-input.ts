/**
 * Validación de los cuerpos que el BFF acepta para las integraciones.
 *
 * Estrecha lo que llega del navegador antes de tocar el backend. **No duplica la validación de
 * credenciales**: qué prefijo tiene que llevar una llave, qué mezcla de ambientes se rechaza y qué
 * pasa al encender un ambiente incompleto lo decide el backend, que es quien las guarda. El
 * formulario comprueba los prefijos antes de enviar para poder explicarlos donde se pegaron, pero
 * eso es ayuda, no autoridad: una petición fabricada a mano la sigue juzgando el backend. Una
 * segunda implementación aquí acabaría discrepando, y lo haría en el sitio donde discrepar
 * significa rechazar una credencial buena o aceptar una mala.
 *
 * Lo que sí se hace es no gastar una llamada con un cuerpo que no tiene forma, y **no dejar pasar
 * ningún campo que el contrato no publique**: un `PATCH` con propiedades de más viajaría entero al
 * backend, y en esta superficie las propiedades de más son credenciales.
 *
 * Módulo puro. **No registra nada**, y no puede: sus parámetros son las cuatro credenciales en
 * claro.
 */

import type {
  SetAddiActivationRequest,
  SetMetaActivationRequest,
  SetTikTokActivationRequest,
  TestMetaIntegrationRequest,
  TestTikTokIntegrationRequest,
  UpdateAddiIntegrationRequest,
  UpdateMetaIntegrationRequest,
  UpdateTikTokIntegrationRequest,
  UpdateWompiIntegrationRequest,
  WompiEnvironment,
} from '@/lib/api/integrations';
import type {
  PaymentResolutionCode,
  ResolvePaymentIncidentRequest,
} from '@/lib/api/payment-incidents';

function record(raw: unknown): Record<string, unknown> | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

/** `expectedVersion`: entero mayor o igual que uno. Sin él no hay control de concurrencia. */
function expectedVersion(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 ? raw : null;
}

/** Los dos ambientes del contrato. `disabled` no es uno: es el estado derivado de apagarlos. */
const ENVIRONMENTS: readonly WompiEnvironment[] = ['sandbox', 'production'];

/**
 * Tope de longitud de una credencial.
 *
 * El backend tiene el suyo y es el que manda. Este existe para que un campo pegado con un
 * documento entero no viaje: no es una validación de negocio, es no mandar un megabyte.
 */
const CREDENTIAL_MAX_LENGTH = 400;

/**
 * Una credencial tal como llega del formulario.
 *
 * **Un campo vacío no es una credencial**: significa «conserva la actual», que es la semántica que
 * declara el contrato para los campos `writeOnly`. Por eso devuelve `undefined` y no una cadena
 * vacía; mandarla vacía guardaría una versión sin valor en el almacén de secretos.
 *
 * Se recortan **solo los extremos**, igual que hace el backend antes de validar: copiar una llave
 * del panel de Wompi arrastra un espacio o un salto de línea con muchísima frecuencia. El interior
 * no se toca nunca —un espacio en medio es otra cadena, no un descuido del portapapeles— y el
 * backend, que es la autoridad, lo rechaza.
 */
function credential(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  if (raw.length > CREDENTIAL_MAX_LENGTH) return undefined;

  const value = raw.trim();

  return value.length === 0 ? undefined : value;
}

function boolean(raw: unknown): boolean | undefined {
  return typeof raw === 'boolean' ? raw : undefined;
}

/**
 * Cuerpo del `PATCH` de la integración.
 *
 * Se construye **campo a campo** en lugar de reenviar lo que llegó. Copiar el objeto del navegador
 * dejaría viajar cualquier propiedad que alguien añadiera, y aquí las propiedades que alguien
 * podría añadir son credenciales de producción.
 */
export function parseWompiUpdate(raw: unknown): UpdateWompiIntegrationRequest | null {
  const body = record(raw);
  if (body === null) return null;

  const version = expectedVersion(body.expectedVersion);
  const environment =
    typeof body.environment === 'string' &&
    (ENVIRONMENTS as readonly string[]).includes(body.environment)
      ? (body.environment as WompiEnvironment)
      : null;

  if (version === null || environment === null) return null;

  const parsed: UpdateWompiIntegrationRequest = {
    expectedVersion: version,
    environment,
  };

  const publicKey = credential(body.publicKey);
  const privateKey = credential(body.privateKey);
  const eventsSecret = credential(body.eventsSecret);
  const integritySecret = credential(body.integritySecret);
  const enabled = boolean(body.enabledForNewPayments);
  const revoke = boolean(body.revokeRetiredEventsSecrets);

  if (publicKey !== undefined) parsed.publicKey = publicKey;
  if (privateKey !== undefined) parsed.privateKey = privateKey;
  if (eventsSecret !== undefined) parsed.eventsSecret = eventsSecret;
  if (integritySecret !== undefined) parsed.integritySecret = integritySecret;
  if (enabled !== undefined) parsed.enabledForNewPayments = enabled;
  if (revoke !== undefined) parsed.revokeRetiredEventsSecrets = revoke;

  return parsed;
}

/**
 * Los cinco motivos de cierre que publica el contrato.
 *
 * Se declara con el tipo generado, así que si el backend añade uno, esta lista deja de compilar.
 * **No hay texto libre** y no se acepta ninguno fuera de la lista: una nota acabaría guardando el
 * correo de quien pagó.
 */
const RESOLUTION_CODES: readonly PaymentResolutionCode[] = [
  'provider_confirmed_discrepancy',
  'not_our_transaction',
  'configuration_corrected',
  'resolved_by_reconciliation',
  'no_action_needed',
];

export function parseIncidentResolution(raw: unknown): ResolvePaymentIncidentRequest | null {
  const body = record(raw);
  if (body === null) return null;

  const version = expectedVersion(body.expectedVersion);
  const resolutionCode =
    typeof body.resolutionCode === 'string' &&
    (RESOLUTION_CODES as readonly string[]).includes(body.resolutionCode)
      ? (body.resolutionCode as PaymentResolutionCode)
      : null;

  if (version === null || resolutionCode === null) return null;

  return { expectedVersion: version, resolutionCode };
}

/** Los cuatro campos secretos de Addi, con el nombre que publica el contrato. */
export const ADDI_SECRET_FIELDS = [
  'clientId',
  'clientSecret',
  'callbackUsername',
  'callbackSecret',
] as const;
export type AddiSecretField = (typeof ADDI_SECRET_FIELDS)[number];

/** `allySlug`: minúsculas, dígitos y guiones. El backend vuelve a validarlo. */
function allySlug(raw: unknown): string | undefined | null {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string') return null;

  const value = raw.trim();

  if (value.length === 0) return undefined;

  return /^[a-z0-9-]{3,80}$/.test(value) ? value : null;
}

/**
 * Cuerpo del `PATCH` de Addi, campo a campo.
 *
 * Igual que Wompi: un campo vacío **conserva** el valor guardado y no viaja, y ninguna propiedad
 * fuera del contrato pasa. Un cuerpo sin ningún cambio no llama al backend.
 */
export function parseAddiUpdate(raw: unknown): UpdateAddiIntegrationRequest | null {
  const body = record(raw);
  if (body === null) return null;

  const version = expectedVersion(body.expectedVersion);
  if (version === null) return null;

  const slug = allySlug(body.allySlug);
  if (slug === null) return null;

  const parsed: UpdateAddiIntegrationRequest = { expectedVersion: version };

  if (slug !== undefined) parsed.allySlug = slug;

  for (const field of ADDI_SECRET_FIELDS) {
    const value = credential(body[field]);
    if (value !== undefined) parsed[field] = value;
  }

  return Object.keys(parsed).length > 1 ? parsed : null;
}

/**
 * Activar o desactivar Addi. Exige `confirm: true` **literal**: sin él no se llama al backend, que
 * de todos modos lo rechazaría.
 */
export function parseAddiActivation(raw: unknown): SetAddiActivationRequest | null {
  const body = record(raw);
  if (body === null) return null;

  const version = expectedVersion(body.expectedVersion);
  const enabled = boolean(body.enabledForNewPayments);

  if (version === null || enabled === undefined || body.confirm !== true) return null;

  return { expectedVersion: version, enabledForNewPayments: enabled, confirm: true };
}

/* ──────────────────────── TikTok (píxel y Events API) ──────────────────────── */

/** Topes del contrato: `pixelId` hasta 200, `accessToken` hasta 2048, `testEventCode` hasta 64. */
const TIKTOK_PIXEL_MAX_LENGTH = 200;
const TIKTOK_TOKEN_MAX_LENGTH = 2048;
const TIKTOK_TEST_CODE_MAX_LENGTH = 64;

/**
 * Un texto opcional de los formularios de TikTok y Meta: vacío **conserva** lo guardado y no viaja; demasiado
 * largo o con espacios en medio es un cuerpo sin forma. Se recortan solo los extremos.
 */
function adsText(raw: unknown, max: number): string | undefined | null {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string' || raw.length > max) return null;

  const value = raw.trim();

  if (value.length === 0) return undefined;

  return /\s/.test(value) ? null : value;
}

/**
 * Cuerpo del `PATCH` de TikTok, campo a campo.
 *
 * El Pixel ID no es un secreto —la tienda lo incrusta—, pero el token sí: igual que Addi, un campo
 * vacío **conserva** el guardado y ninguna propiedad fuera del contrato pasa. Sin cambios no hay
 * llamada.
 */
export function parseTikTokUpdate(raw: unknown): UpdateTikTokIntegrationRequest | null {
  const body = record(raw);
  if (body === null) return null;

  const version = expectedVersion(body.expectedVersion);
  if (version === null) return null;

  const pixelId = adsText(body.pixelId, TIKTOK_PIXEL_MAX_LENGTH);
  const accessToken = adsText(body.accessToken, TIKTOK_TOKEN_MAX_LENGTH);

  if (pixelId === null || accessToken === null) return null;

  const parsed: UpdateTikTokIntegrationRequest = { expectedVersion: version };

  if (pixelId !== undefined) parsed.pixelId = pixelId;
  if (accessToken !== undefined) parsed.accessToken = accessToken;

  return Object.keys(parsed).length > 1 ? parsed : null;
}

/** Activar o desactivar TikTok. Exige `confirm: true` **literal**, igual que Addi. */
export function parseTikTokActivation(raw: unknown): SetTikTokActivationRequest | null {
  const body = record(raw);
  if (body === null) return null;

  const version = expectedVersion(body.expectedVersion);
  const enabled = boolean(body.enabled);

  if (version === null || enabled === undefined || body.confirm !== true) return null;

  return { expectedVersion: version, enabled, confirm: true };
}

/**
 * Cuerpo de la compra de prueba: solo el código de «Eventos de prueba». Es obligatorio; sin él,
 * TikTok contaría la compra como real.
 */
export function parseTikTokTest(raw: unknown): TestTikTokIntegrationRequest | null {
  const body = record(raw);
  if (body === null) return null;

  const code = adsText(body.testEventCode, TIKTOK_TEST_CODE_MAX_LENGTH);

  return code === null || code === undefined ? null : { testEventCode: code };
}

/* ──────────────────────── Meta (píxel y API de conversiones) ──────────────────────── */

/** Topes del contrato: `pixelId` hasta 200, `accessToken` hasta 2048, `testEventCode` hasta 64. */
const META_PIXEL_MAX_LENGTH = 200;
const META_TOKEN_MAX_LENGTH = 2048;
const META_TEST_CODE_MAX_LENGTH = 64;

/**
 * Cuerpo del `PATCH` de Meta, campo a campo.
 *
 * Mismas reglas que TikTok: el ID del conjunto de datos no es un secreto, el token sí; un campo
 * vacío **conserva** el guardado y ninguna propiedad fuera del contrato pasa. El ID de Meta es
 * siempre numérico, así que algo que no sean dígitos es un cuerpo sin forma. Sin cambios no hay
 * llamada. La longitud exacta y el resto de reglas las decide el backend.
 */
export function parseMetaUpdate(raw: unknown): UpdateMetaIntegrationRequest | null {
  const body = record(raw);
  if (body === null) return null;

  const version = expectedVersion(body.expectedVersion);
  if (version === null) return null;

  const pixelId = adsText(body.pixelId, META_PIXEL_MAX_LENGTH);
  const accessToken = adsText(body.accessToken, META_TOKEN_MAX_LENGTH);

  if (pixelId === null || accessToken === null) return null;
  if (pixelId !== undefined && !/^\d+$/.test(pixelId)) return null;

  const parsed: UpdateMetaIntegrationRequest = { expectedVersion: version };

  if (pixelId !== undefined) parsed.pixelId = pixelId;
  if (accessToken !== undefined) parsed.accessToken = accessToken;

  return Object.keys(parsed).length > 1 ? parsed : null;
}

/** Activar o desactivar Meta. Exige `confirm: true` **literal**, igual que TikTok. */
export function parseMetaActivation(raw: unknown): SetMetaActivationRequest | null {
  const body = record(raw);
  if (body === null) return null;

  const version = expectedVersion(body.expectedVersion);
  const enabled = boolean(body.enabled);

  if (version === null || enabled === undefined || body.confirm !== true) return null;

  return { expectedVersion: version, enabled, confirm: true };
}

/**
 * Cuerpo de la compra de prueba: solo el código de «Probar eventos», en mayúsculas como lo muestra
 * Meta. Es obligatorio; sin él, Meta contaría la compra como real.
 */
export function parseMetaTest(raw: unknown): TestMetaIntegrationRequest | null {
  const body = record(raw);
  if (body === null) return null;

  const code = adsText(body.testEventCode, META_TEST_CODE_MAX_LENGTH);

  return code === null || code === undefined ? null : { testEventCode: code.toUpperCase() };
}
