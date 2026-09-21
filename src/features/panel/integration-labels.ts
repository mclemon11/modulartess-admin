/**
 * Vocabulario de la superficie de integraciones.
 *
 * Aquí se decide cómo se **nombra** cada cosa en pantalla, y hay tres decisiones que no son de
 * estilo:
 *
 * 1. **Los tres relojes se llaman distinto.** «Intento de webhook» no es «webhook verificado», y
 *    ninguno de los dos es «reconciliación». Si las tres fechas compartieran etiqueta, una
 *    integración con la firma rota se leería como una integración sana: algo llega a la ruta, la
 *    fecha se mueve, y nadie se entera de que ningún evento pasó la verificación.
 * 2. **«Configurado» no es «verificado».** El contrato solo puede probar la llave pública; de las
 *    otras tres sabe únicamente que hay una versión guardada. Decir «verificado» de un secreto que
 *    nadie comprobó es la clase de afirmación que hace perder una tarde cuando el pago falla.
 * 3. **Los códigos de error son nuestros.** Ninguno lleva texto del proveedor, y los que el panel
 *    no sabe traducir se resumen sin enseñar el código en crudo.
 *
 * Módulo puro.
 */

import type { WompiEnvironmentConfig, WompiIntegration } from '@/lib/api/integrations';
import type {
  PaymentIncidentPage,
  PaymentIncidentReason,
  PaymentIncidentStatus,
  PaymentResolutionCode,
} from '@/lib/api/payment-incidents';

type ActiveEnvironment = WompiIntegration['activeEnvironment'];

const ACTIVE_ENVIRONMENTS: Readonly<Record<ActiveEnvironment, string>> = {
  disabled: 'Sin ambiente activo',
  sandbox: 'Pruebas (sandbox)',
  production: 'Producción',
};

export function describeActiveEnvironment(value: string): string {
  return Object.hasOwn(ACTIVE_ENVIRONMENTS, value)
    ? ACTIVE_ENVIRONMENTS[value as ActiveEnvironment]
    : value;
}

/**
 * En qué punto está un ambiente, resumido en una palabra.
 *
 * Se deriva de dos campos del contrato y no de uno: `configured` dice si están las cuatro
 * credenciales y `enabledForNewPayments` si se abren checkouts. Las combinaciones importan —
 * configurado y apagado es un estado normal y deliberado, no un error— y aplanarlas en un único
 * booleano haría que «apagado a propósito» y «le falta algo» se leyeran igual.
 */
export type IntegrationHealth = 'enabled' | 'configured' | 'incomplete' | 'blocked';

export type IntegrationHealthReading = {
  readonly health: IntegrationHealth;
  readonly label: string;
  /** Una línea que dice qué significa y, cuando procede, qué falta. */
  readonly detail: string;
};

export function readEnvironmentHealth(
  config: WompiEnvironmentConfig,
  options: { readonly blocked: boolean },
): IntegrationHealthReading {
  if (options.blocked) {
    return {
      health: 'blocked',
      label: 'Bloqueado',
      detail:
        'Los pagos reales están bloqueados en este despliegue. Guardar credenciales aquí no habilita ningún cobro.',
    };
  }

  if (!config.configured) {
    return {
      health: 'incomplete',
      label: 'Incompleto',
      detail: 'Faltan credenciales. Hacen falta las cuatro para poder encender el ambiente.',
    };
  }

  return config.enabledForNewPayments
    ? {
        health: 'enabled',
        label: 'Activo',
        detail: 'Se abren checkouts nuevos con este ambiente.',
      }
    : {
        health: 'configured',
        label: 'Configurado, apagado',
        detail:
          'Las credenciales están guardadas y no se abren checkouts nuevos. Los pagos ya iniciados se siguen cerrando con normalidad.',
      };
}

/**
 * Cuántas incidencias abiertas hay, y **hasta dónde lo sabemos**.
 *
 * El contrato no publica un total: la bandeja pagina por cursor opaco, así que una sola consulta
 * devuelve como mucho una página. El panel pide una, y eso deja dos respuestas posibles que **no
 * son la misma**:
 *
 * - si el backend no devolvió cursor, esa página es todo lo que hay y el número es **exacto**;
 * - si devolvió cursor, quedan más y el número es un **mínimo**.
 *
 * Presentar el segundo caso como si fuera el primero es lo que corrige este tipo: «50» dicho de
 * una bandeja con 137 incidencias abiertas no es una aproximación, es una cifra falsa, y quien la
 * lee decide con ella. La alternativa —recorrer todas las páginas para dar un total— convertiría
 * una tarjeta de resumen en tantas llamadas como páginas haya, que es exactamente lo que la
 * paginación por cursor existe para evitar.
 *
 * `unavailable` es el tercer caso y tampoco se confunde con cero: la consulta falló, así que no se
 * sabe si hay incidencias o no.
 */
export type OpenIncidentCount =
  | { readonly kind: 'exact'; readonly value: number }
  | { readonly kind: 'atLeast'; readonly value: number }
  | { readonly kind: 'unavailable' };

/** La lectura falló. No es cero: es que no se sabe. */
export const OPEN_INCIDENTS_UNAVAILABLE: OpenIncidentCount = { kind: 'unavailable' };

/**
 * Lee el contador de una página de incidencias.
 *
 * El cursor es lo único que decide: su presencia significa «hay más», y su ausencia, «esto es
 * todo». No se mira si la página vino llena, porque el tamaño de página lo elige quien consulta y
 * una página llena sin cursor sigue siendo un total exacto.
 */
export function readOpenIncidentCount(page: PaymentIncidentPage): OpenIncidentCount {
  return page.nextPageToken === null
    ? { kind: 'exact', value: page.items.length }
    : { kind: 'atLeast', value: page.items.length };
}

export function describeOpenIncidentCount(count: OpenIncidentCount): string {
  if (count.kind === 'unavailable') return 'No disponible';
  return count.kind === 'exact' ? String(count.value) : `${count.value} o más`;
}

/**
 * Cómo se llama cada credencial.
 *
 * La llave pública se nombra aparte del resto a propósito: **no es un secreto** —viaja en el
 * formulario del checkout— y es la única que el contrato devuelve, enmascarada.
 */
export const CREDENTIAL_LABELS = {
  publicKey: 'Llave pública',
  privateKey: 'Llave privada',
  eventsSecret: 'Secreto de Eventos',
  integritySecret: 'Secreto de Integridad',
} as const;

/**
 * Los tres relojes operativos, con su nombre y su matiz.
 *
 * El matiz es la parte que importa. Está tomado de la descripción del propio contrato, que se
 * molesta en distinguirlos, y sin él las tres fechas se leerían como tres formas de decir «la
 * integración funciona» cuando solo una lo dice.
 */
export const OPERATIONAL_CLOCKS = [
  {
    key: 'lastWebhookAttemptAt',
    label: 'Último intento de webhook',
    hint: 'Algo llegó a la ruta. No afirma que el evento fuera auténtico: una firma rechazada también mueve esta fecha.',
  },
  {
    key: 'lastVerifiedWebhookAt',
    label: 'Último webhook verificado',
    hint: 'El último evento que llegó con firma válida. Esta es la fecha que dice que la integración funciona.',
  },
  {
    key: 'lastReconciledAt',
    label: 'Última reconciliación',
    hint: 'La última vez que preguntamos nosotros al proveedor. No es un webhook: si los eventos estuvieran rotos, esto seguiría funcionando.',
  },
] as const satisfies readonly {
  readonly key: keyof WompiEnvironmentConfig;
  readonly label: string;
  readonly hint: string;
}[];

/** Motivo de una incidencia. Vocabulario cerrado del contrato. */
const INCIDENT_REASONS: Readonly<Record<PaymentIncidentReason, string>> = {
  reference_unknown: 'Referencia desconocida',
  provider_mismatch: 'Proveedor distinto',
  environment_mismatch: 'Ambiente distinto',
  currency_mismatch: 'Moneda distinta',
  amount_mismatch: 'Monto distinto',
  attempt_bound_to_other_transaction: 'El intento ya tenía otra transacción',
  transaction_bound_to_other_attempt: 'La transacción ya tenía otro intento',
  order_unknown: 'Pedido desconocido',
  live_disabled: 'Evento de producción con cobros bloqueados',
};

export function describeIncidentReason(reason: string): string {
  return Object.hasOwn(INCIDENT_REASONS, reason)
    ? INCIDENT_REASONS[reason as PaymentIncidentReason]
    : reason;
}

/** Qué significa cada motivo, en una línea. Es lo que decide qué mirar primero. */
const INCIDENT_REASON_HINTS: Readonly<Record<PaymentIncidentReason, string>> = {
  reference_unknown: 'Llegó un pago con una referencia que este backend no generó.',
  provider_mismatch: 'El evento dice venir de otro proveedor del que corresponde al intento.',
  environment_mismatch: 'El ambiente del evento no es el del intento al que apunta.',
  currency_mismatch: 'La moneda cobrada no es la del pedido.',
  amount_mismatch: 'El monto cobrado no coincide con el total del pedido.',
  attempt_bound_to_other_transaction:
    'Ese intento ya estaba asociado a otra transacción del proveedor.',
  transaction_bound_to_other_attempt: 'Esa transacción ya estaba asociada a otro intento nuestro.',
  order_unknown: 'El intento no apunta a ningún pedido que exista.',
  live_disabled:
    'Llegó un evento de producción a un despliegue donde los cobros reales están bloqueados por código.',
};

export function incidentReasonHint(reason: string): string | null {
  return Object.hasOwn(INCIDENT_REASON_HINTS, reason)
    ? INCIDENT_REASON_HINTS[reason as PaymentIncidentReason]
    : null;
}

const INCIDENT_STATUSES: Readonly<Record<PaymentIncidentStatus, string>> = {
  open: 'Abierta',
  resolved: 'Resuelta',
};

export function describeIncidentStatus(status: string): string {
  return Object.hasOwn(INCIDENT_STATUSES, status)
    ? INCIDENT_STATUSES[status as PaymentIncidentStatus]
    : status;
}

/**
 * Los cinco motivos de cierre, con su lectura.
 *
 * Es el vocabulario cerrado del contrato, y se enumera entero: el selector no puede ofrecer menos
 * —dejaría cierres imposibles de expresar— ni más —el backend los rechazaría—.
 */
export const RESOLUTION_CODES = [
  {
    code: 'provider_confirmed_discrepancy',
    label: 'El proveedor confirmó la discrepancia',
    hint: 'Se comprobó con el proveedor y la diferencia es real.',
  },
  {
    code: 'not_our_transaction',
    label: 'No es una transacción nuestra',
    hint: 'La transacción no corresponde a este comercio.',
  },
  {
    code: 'configuration_corrected',
    label: 'Se corrigió la configuración',
    hint: 'La causa era la configuración y ya se arregló.',
  },
  {
    code: 'resolved_by_reconciliation',
    label: 'Se resolvió por reconciliación',
    hint: 'La consulta al proveedor dejó el pago en su estado correcto.',
  },
  {
    code: 'no_action_needed',
    label: 'No requiere acción',
    hint: 'Se revisó y no hay nada que corregir.',
  },
] as const satisfies readonly {
  readonly code: PaymentResolutionCode;
  readonly label: string;
  readonly hint: string;
}[];

export function describeResolutionCode(code: string | null): string | null {
  if (code === null) return null;
  const found = RESOLUTION_CODES.find((entry) => entry.code === code);
  return found?.label ?? code;
}

/**
 * Códigos de error de la integración con lectura aprobada.
 *
 * El contrato dice que `lastErrorCode` es «a closed code from our own vocabulary», pero no publica
 * la lista, así que el panel traduce los que conoce y **resume los demás sin enseñarlos**: un
 * código interno en pantalla se lee como una fuga, y peor aún si algún día llevara un fragmento de
 * la respuesta del proveedor.
 */
const ERROR_CODES: Readonly<Record<string, string>> = {
  checksum_mismatch: 'Un evento llegó con una firma que no cuadra.',
  header_checksum_mismatch: 'La firma de la cabecera no coincidía con la del cuerpo.',
  signature_property_missing: 'Un evento no traía una de las propiedades que firma el proveedor.',
  environment_unknown: 'Un evento declaró un ambiente que no reconocemos.',
  merchant_lookup_failed: 'El proveedor no reconoció la llave pública.',
  secret_store_unavailable: 'No se pudo leer el almacén de secretos.',
};

export function describeIntegrationError(code: string | null): string | null {
  if (code === null) return null;

  // Un código puede venir con sufijo —`merchant_lookup_failed:http_401`—: se traduce la raíz y el
  // detalle técnico no se enseña.
  const root = code.split(':')[0] ?? code;

  return (
    ERROR_CODES[root] ?? 'El último intento falló por un motivo que el panel no sabe traducir.'
  );
}
