/**
 * Cobros reales en Wompi: en qué estado está Producción, qué hay que escribir para activarlos y
 * qué se manda al backend.
 *
 * Guardar las llaves de Producción y cobrar con ellas son **dos decisiones distintas**, y el
 * backend las separa en dos interruptores:
 *
 * - `livePaymentsEnabled` lo fija el **despliegue** del backend. Mientras sea `false`, ninguna
 *   petición del panel puede encender Producción: responde `wompi_live_payments_not_enabled`.
 * - `production.enabledForNewPayments` lo decide **una persona desde este panel**, y solo cuando
 *   el despliegue ya lo permite. Es el que hace que se abran checkouts con dinero real.
 *
 * Todo lo que aquí se decide sale de la respuesta del backend. El panel no deduce si algo cobra:
 * lo lee.
 *
 * Módulo puro. No registra nada y no conoce ninguna credencial.
 */

import type { UpdateWompiIntegrationRequest, WompiIntegration } from '@/lib/api/integrations';

/**
 * Los cuatro estados de Producción, en el orden en que se evalúan.
 *
 * `active` va **primero** a propósito: si Producción está cobrando, lo único que importa es poder
 * apagarlo, aunque el despliegue haya vuelto a bloquear los cobros o falte una llave. El contrato
 * dice que apagar Producción se admite siempre.
 */
export type ProductionPaymentsState = 'active' | 'unconfigured' | 'blocked' | 'inactive';

export function productionPaymentsState(integration: WompiIntegration): ProductionPaymentsState {
  const production = integration.production;

  if (production.enabledForNewPayments) return 'active';
  if (!production.configured) return 'unconfigured';
  if (!integration.livePaymentsEnabled) return 'blocked';

  return 'inactive';
}

/**
 * Lo que hay que escribir para activar los cobros reales.
 *
 * Es una frase y no una casilla porque una casilla se marca sin leer. Escribirla obliga a leer lo
 * que se está a punto de hacer.
 */
export const LIVE_CONFIRMATION_PHRASE = 'ACTIVAR PRODUCCIÓN';

/**
 * ¿Lo escrito es la frase de confirmación?
 *
 * Se comparan mayúsculas y la tilde **tal cual**: «activar produccion» no vale. Solo se perdonan
 * dos cosas que no son decisiones de quien escribe: los espacios de los extremos, y la forma en
 * que el teclado codifica la «Ó» —precompuesta o como «O» más tilde combinante—, que se iguala con
 * `NFC` para que la misma letra no se rechace según el sistema operativo.
 */
export function isLiveConfirmation(text: string): boolean {
  return text.normalize('NFC').trim() === LIVE_CONFIRMATION_PHRASE.normalize('NFC');
}

/**
 * Cuerpo del `PATCH` que enciende o apaga Producción.
 *
 * Lleva el ambiente **escrito**, el interruptor y la versión que el contrato exige para el control
 * optimista. **Nada más**: ni una credencial, ni un campo vacío. Mandar llaves aquí escribiría una
 * versión nueva de cada secreto cada vez que alguien enciende o apaga, y una cadena vacía no
 * significa «conservar» en este contrato.
 */
export function productionPaymentsRequest(
  expectedVersion: number,
  enabledForNewPayments: boolean,
): UpdateWompiIntegrationRequest {
  return { expectedVersion, environment: 'production', enabledForNewPayments };
}

/**
 * Mensajes para un fallo al encender o apagar Producción.
 *
 * No se reutilizan los de «Guardar llaves»: aquí no se guarda ninguna llave, y un mensaje que
 * dijera «las llaves sí quedan guardadas» o «vuelve a guardar» mandaría a hacer otra cosa.
 *
 * Cada uno dice **qué pasó con el dinero**: en todos los casos de error, nada cambió.
 */
const PRODUCTION_MESSAGES: Readonly<Record<string, string>> = {
  live_payments_not_enabled:
    'El backend todavía bloquea los cobros reales en este despliegue. No se activó nada.',
  integration_conflict:
    'La configuración cambió mientras la mirabas. Ya se muestra la versión actual: revísala y vuelve a confirmar.',
  version_conflict:
    'La configuración cambió mientras la mirabas. Ya se muestra la versión actual: revísala y vuelve a confirmar.',
  admin_role_required:
    'Tu rol no puede activar ni desactivar los cobros reales. No se cambió nada.',
  invalid_origin: 'La petición no salió del panel. No se cambió nada.',
  session_required: 'Tu sesión administrativa caducó. Vuelve a iniciar sesión; no se cambió nada.',
  credentials_incomplete:
    'Faltan llaves de Producción. Guarda las cuatro antes de activar los cobros reales.',
  integration_invalid: 'El backend rechazó la configuración de Producción. No se activó nada.',
  invalid_request: 'La petición no tiene el formato esperado. No se cambió nada.',
  provider_unavailable: 'No se pudo aplicar el cambio ahora mismo. No se cambió nada.',
  too_many_requests: 'Demasiados intentos seguidos. Espera unos segundos.',
  service_unavailable: 'El servicio no responde ahora mismo. No se cambió nada.',
};

export const PRODUCTION_GENERIC_MESSAGE =
  'No pudimos aplicar el cambio. Revisa el estado antes de volver a intentarlo.';

export function describeProductionFailure(code: string): string {
  return PRODUCTION_MESSAGES[code] ?? PRODUCTION_GENERIC_MESSAGE;
}

/**
 * ¿Este fallo deja la pantalla con un estado que ya no es el del backend?
 *
 * El conflicto, porque otra persona cambió la configuración. Y el bloqueo, porque si el backend lo
 * responde es que `livePaymentsEnabled` ya no vale lo que la pantalla creía: releer hace que deje
 * de ofrecer el botón.
 */
export function productionRequiresReload(code: string): boolean {
  return (
    code === 'integration_conflict' ||
    code === 'version_conflict' ||
    code === 'live_payments_not_enabled'
  );
}
