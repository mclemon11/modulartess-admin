/**
 * Presentación del estado del **pago**.
 *
 * El pago y el pedido son dos lecturas distintas: una dice si el dinero llegó y la otra por dónde
 * va el trabajo. El contrato las publica por separado —`payment.status` y `order.status`— y el
 * panel no las mezcla.
 *
 * Aquí sí vive una tabla de textos, y no contradice la regla de consumir la etiqueta autoritativa:
 * `AdminOrderSummaryDto` publica `paymentStatus` **sin** etiqueta, porque una fila del listado no
 * trae la ficha de pago. Sin este mapa la columna «Pago» tendría que pedir cada pedido por
 * separado, que es justo lo que el contrato evita. Donde sí hay etiqueta —el detalle, con
 * `payment.statusLabel`, y cada evento con su `label`— se usa la del backend.
 *
 * Módulo puro.
 */

import type { PaymentSimulationEvent, PaymentStatus } from '@/lib/api/orders';

/** Los siete estados de pago del contrato. */
const LABELS: Readonly<Record<PaymentStatus, string>> = {
  pending: 'Pendiente',
  processing: 'Procesando',
  approved: 'Pagado',
  declined: 'Rechazado',
  /*
   * «Anulado», y no «Rechazado» ni «Devuelto». Wompi publica `VOIDED` como un
   * estado propio: la transacción quedó sin efecto antes de cobrarse. No la
   * rechazó nadie y no hay dinero que devolver, así que cualquiera de las otras
   * dos palabras contaría un hecho que no ocurrió.
   */
  voided: 'Anulado',
  expired: 'Vencido',
  error: 'Error técnico',
};

/**
 * Variante visual de un estado de pago.
 *
 * Se deriva del tipo generado en vez de enumerarse otra vez: cuando el contrato
 * añadió `voided`, una lista escrita a mano se habría quedado corta en silencio y el estado nuevo
 * habría caído en `unknown` —gris— sin que nada avisara. Derivándola, lo que falla es la
 * compilación, que es donde tiene que fallar.
 */
export type PaymentStatusVariant = PaymentStatus | 'unknown';

function isPaymentStatus(value: string): value is PaymentStatus {
  return Object.hasOwn(LABELS, value);
}

/**
 * Nombre del estado de pago para el listado.
 *
 * Un estado que el panel no conozca se muestra con su valor técnico en vez de romper la fila: si el
 * backend añade uno, la tabla sigue siendo legible mientras el panel se pone al día.
 */
export function describePaymentStatus(status: string): string {
  return isPaymentStatus(status) ? LABELS[status] : status;
}

export function paymentStatusVariant(status: string): PaymentStatusVariant {
  return isPaymentStatus(status) ? status : 'unknown';
}

/**
 * Etiquetas de los botones del simulador.
 *
 * Qué resultados se ofrecen **no** se decide aquí: sale de `order.availableSimulationEvents`, que
 * es el backend diciendo qué cabe desde el estado actual del pago. Este mapa solo pone el texto.
 */
const SIMULATION_LABELS: Readonly<Record<PaymentSimulationEvent, string>> = {
  processing: 'Simular procesamiento',
  approved: 'Simular aprobación',
  declined: 'Simular rechazo',
  voided: 'Simular anulación',
  expired: 'Simular vencimiento',
  error: 'Simular error técnico',
};

export function describeSimulationEvent(event: string): string {
  return Object.hasOwn(SIMULATION_LABELS, event)
    ? SIMULATION_LABELS[event as PaymentSimulationEvent]
    : event;
}

/**
 * Resultados que cambian el desenlace del pago y por tanto piden confirmación.
 *
 * `processing` no está: abre un intento, no lo cierra. Los cuatro que sí están dejan el pago en un
 * estado del que no se vuelve, y uno de ellos mueve el pedido a `paid`.
 */
export function needsSimulationConfirmation(event: string): boolean {
  return event !== 'processing';
}

/**
 * Códigos de motivo con una traducción cerrada y útil.
 *
 * El contrato dice que `reasonCode` es «stable, bounded», pero no publica el conjunto de valores.
 * Por eso solo se muestran los que tienen una lectura que aporta algo; un código sin traducir no se
 * pinta, porque un valor interno en pantalla se lee como un error del panel.
 */
const REASON_CODES: Readonly<Record<string, string>> = {
  insufficient_funds: 'Fondos insuficientes',
  card_declined: 'La entidad rechazó el pago',
  expired_card: 'Medio de pago vencido',
  timeout: 'El intento caducó sin respuesta',
  cancelled_by_customer: 'La persona abandonó el pago',
};

/** Motivo legible, o `null` cuando no hay traducción aprobada para ese código. */
export function describeReasonCode(code: string | null): string | null {
  if (code === null) {
    return null;
  }

  return REASON_CODES[code] ?? null;
}

/** Entorno del pago. `sandbox` significa que no hubo cobro real, y hay que decirlo. */
export function isSandbox(environment: string): boolean {
  return environment === 'sandbox';
}
