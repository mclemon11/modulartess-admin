/**
 * Presentación del **proveedor** y del **medio** de un pago.
 *
 * Todo sale del contrato y nada se deduce: ni del estado, ni del ambiente, ni de la referencia, ni
 * de ningún texto. Las etiquetas —«Wompi», «Tarjeta», «Visa», «PSE»…— las pone el backend; aquí solo
 * se decide **qué** filas se enseñan y en qué orden, y se omiten las que no traen dato.
 *
 * Reglas que importan:
 *
 * - Un medio `null` con transacción es «No informado por Wompi». Nunca se adivina.
 * - Una tarjeta es «Tarjeta». Crédito o débito aparece **solo** si el backend publica `cardType`,
 *   porque el proveedor no siempre permite distinguirlo.
 * - El simulador tiene su propio proveedor y no dice Wompi en ningún sitio.
 * - La terminación se enseña como `•••• 1234` y se lee como «terminada en 1234».
 *
 * Módulo puro.
 */

import type {
  AdminPaymentAttempt,
  AdminPaymentMethod,
  AdminPaymentProvider,
  AdminPaymentSummary,
} from '@/lib/api/orders';

export interface PaymentFact {
  readonly label: string;
  readonly value: string;
  /** Lectura para lectores de pantalla cuando el texto visible no se lee bien. */
  readonly spokenValue?: string;
}

/** «•••• 1234», para ver; «terminada en 1234», para oír. */
export function maskedLastFour(lastFour: string): {
  readonly visible: string;
  readonly spoken: string;
} {
  return { visible: `•••• ${lastFour}`, spoken: `terminada en ${lastFour}` };
}

/** Qué se dice cuando el proveedor no informó el medio. */
export function notReportedBy(provider: AdminPaymentProvider): string {
  return `No informado por ${provider.label}`;
}

/**
 * Las filas del medio de pago, **solo** las que traen dato.
 *
 * `null` → una sola fila «No informado por …». El resto, en el orden de lectura natural: medio,
 * franquicia, terminación, tipo y cuotas.
 */
export function paymentMethodFacts(
  provider: AdminPaymentProvider,
  method: AdminPaymentMethod | null,
): readonly PaymentFact[] {
  if (method === null) {
    return [{ label: 'Medio de pago', value: notReportedBy(provider) }];
  }

  const facts: PaymentFact[] = [{ label: 'Medio de pago', value: method.label }];
  const card = method.card;

  if (card !== null) {
    if (card.brandLabel !== null) {
      facts.push({ label: 'Franquicia', value: card.brandLabel });
    }

    if (card.lastFour !== null) {
      const masked = maskedLastFour(card.lastFour);
      facts.push({ label: 'Terminación', value: masked.visible, spokenValue: masked.spoken });
    }

    if (card.cardTypeLabel !== null) {
      facts.push({ label: 'Tipo de tarjeta', value: card.cardTypeLabel });
    }

    if (card.installments !== null) {
      facts.push({ label: 'Cuotas', value: String(card.installments) });
    }
  }

  return facts;
}

/**
 * Proveedor y medio de **un intento**.
 *
 * Sin transacción no hay medio que contar: nadie pagó todavía con ese checkout, así que la fila del
 * medio se omite en lugar de decir «no informado».
 */
export function attemptPaymentFacts(attempt: AdminPaymentAttempt): readonly PaymentFact[] {
  const provider: PaymentFact = { label: 'Proveedor', value: attempt.provider.label };

  if (!attempt.hasTransactionId && attempt.paymentMethod === null) {
    return [provider];
  }

  return [provider, ...paymentMethodFacts(attempt.provider, attempt.paymentMethod)];
}

/**
 * Qué resumen enseña la tarjeta «Información de pago».
 *
 * El del pago aprobado cuando existe. Si no, el del intento más reciente **con transacción**: un
 * rechazo también se hizo con un medio. Un checkout sin transacción no aporta nada.
 */
export function paymentCardSummary(
  summary: AdminPaymentSummary | null,
  attempts: readonly AdminPaymentAttempt[],
): { readonly provider: AdminPaymentProvider; readonly method: AdminPaymentMethod | null } | null {
  if (summary !== null) {
    return { provider: summary.provider, method: summary.paymentMethod };
  }

  const latest = attempts[0];

  if (latest === undefined || !latest.hasTransactionId) {
    return null;
  }

  return { provider: latest.provider, method: latest.paymentMethod };
}

/**
 * Resumen de una línea para el listado: «Wompi · Visa •••• 1234», «Wompi · PSE»,
 * «Wompi · Medio no informado». `spoken` es la misma frase para lectores de pantalla.
 */
export function compactPaymentSummary(summary: AdminPaymentSummary): {
  readonly visible: string;
  readonly spoken: string;
} {
  const provider = summary.provider.label;
  const method = summary.paymentMethod;

  if (summary.provider.code === 'simulator') {
    return { visible: provider, spoken: `Pago con ${provider}` };
  }

  if (method === null) {
    return {
      visible: `${provider} · Medio no informado`,
      spoken: `${provider}, medio no informado`,
    };
  }

  const card = method.card;

  if (card !== null && (card.brandLabel !== null || card.lastFour !== null)) {
    const name = card.brandLabel ?? method.label;

    if (card.lastFour === null) {
      return { visible: `${provider} · ${name}`, spoken: `${provider}, ${name}` };
    }

    const masked = maskedLastFour(card.lastFour);

    return {
      visible: `${provider} · ${name} ${masked.visible}`,
      spoken: `${provider}, ${name} ${masked.spoken}`,
    };
  }

  return { visible: `${provider} · ${method.label}`, spoken: `${provider}, ${method.label}` };
}
