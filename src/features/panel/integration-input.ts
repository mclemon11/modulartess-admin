/**
 * Validación de los cuerpos que el BFF acepta para las integraciones.
 *
 * Estrecha lo que llega del navegador antes de tocar el backend. **No duplica la validación de
 * credenciales**: qué prefijo tiene que llevar una llave, qué mezcla de ambientes se rechaza y qué
 * pasa al encender un ambiente incompleto lo decide el backend, que es quien las guarda. Una
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

import type { UpdateWompiIntegrationRequest, WompiEnvironment } from '@/lib/api/integrations';
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
 * No se recorta el valor. El backend rechaza los espacios exteriores en lugar de limpiarlos, y
 * limpiarlos aquí ocultaría el error hasta la siguiente rotación.
 */
function credential(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  if (raw.length === 0 || raw.length > CREDENTIAL_MAX_LENGTH) return undefined;
  return raw;
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
