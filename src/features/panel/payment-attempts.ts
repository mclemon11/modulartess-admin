/**
 * Presentación de los **intentos** de pago de un pedido.
 *
 * Tres cosas distintas que no hay que confundir:
 *
 * - el **pedido**, que tiene un único pago cuyo estado definitivo es `payment.status`;
 * - el **intento**, que es cada checkout abierto sobre ese pedido (`paymentAttempts`);
 * - la **transacción**, que solo existe cuando Wompi la crea y la ata a un intento
 *   (`hasTransactionId`). El identificador nunca se publica.
 *
 * Un intento puede quedarse en `created` aunque su enlace ya haya vencido: el backend todavía no
 * normaliza de forma persistente los vencidos. Por eso el vencimiento se calcula aquí desde
 * `expiresAt` contra un reloj que se **inyecta**. Nada en este módulo lee la hora por su cuenta: el
 * mismo intento tiene que pintarse igual en el servidor y en el navegador hasta que el cliente
 * aporte su reloj, y las pruebas fijan esa hora.
 *
 * `now === null` significa «todavía no hay reloj» (render de servidor o primer render del cliente).
 * En ese caso lo que depende de la hora se declara pendiente en lugar de adivinarse.
 *
 * Módulo puro.
 */

import type { AdminPaymentAttempt, PaymentStatus } from '@/lib/api/orders';

export type AttemptTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

export type AttemptStateKind =
  | 'not_started'
  | 'checkout_open'
  | 'checkout_expired'
  | 'checkout_unknown'
  | 'transaction_pending'
  | 'declined'
  | 'voided'
  | 'error'
  | 'approved';

export interface AttemptPresentation {
  readonly kind: AttemptStateKind;
  readonly title: string;
  readonly text: string | null;
  readonly tone: AttemptTone;
}

export interface CheckoutState extends AttemptPresentation {
  /**
   * El intento más reciente dice `approved` y el pago del pedido no. No se presenta como pagado:
   * `payment.status` es la autoridad final, y una discrepancia se enseña, no se resuelve en el panel.
   */
  readonly inconsistent: boolean;
}

const EXPIRED_TEXT =
  'El checkout venció antes de que Wompi creara una transacción. El cliente puede reintentar sobre el mismo pedido.';

/** Si el enlace ya venció. `null` cuando no hay reloj o `expiresAt` no se puede leer. */
function hasExpired(expiresAt: string, now: number | null): boolean | null {
  const expiry = Date.parse(expiresAt);

  if (now === null || Number.isNaN(expiry)) {
    return null;
  }

  return expiry <= now;
}

/** El estado presentado de **un** intento, sin mirar el pago del pedido. */
export function presentAttempt(
  attempt: AdminPaymentAttempt,
  now: number | null,
): AttemptPresentation {
  switch (attempt.status) {
    case 'declined':
      return { kind: 'declined', title: 'Pago rechazado', text: null, tone: 'danger' };
    case 'voided':
      return { kind: 'voided', title: 'Pago anulado', text: null, tone: 'neutral' };
    case 'error':
      return { kind: 'error', title: 'Error de pago', text: null, tone: 'danger' };
    case 'approved':
      return { kind: 'approved', title: 'Pago aprobado', text: null, tone: 'success' };
    case 'processing':
      return transactionPending();
    case 'expired':
      if (attempt.hasTransactionId) {
        return {
          kind: 'checkout_expired',
          title: 'Intento vencido',
          text: 'El intento venció con una transacción registrada. El estado definitivo es el del pago del pedido.',
          tone: 'warning',
        };
      }

      return {
        kind: 'checkout_expired',
        title: 'Checkout vencido',
        text: EXPIRED_TEXT,
        tone: 'warning',
      };
    case 'created': {
      if (attempt.hasTransactionId) {
        return transactionPending();
      }

      const expired = hasExpired(attempt.expiresAt, now);

      if (expired === null) {
        return {
          kind: 'checkout_unknown',
          title: 'Checkout sin transacción',
          text: 'Comprobando la vigencia del enlace de pago.',
          tone: 'neutral',
        };
      }

      return expired
        ? {
            kind: 'checkout_expired',
            title: 'Checkout vencido',
            text: EXPIRED_TEXT,
            tone: 'warning',
          }
        : {
            kind: 'checkout_open',
            title: 'Checkout abierto',
            text: 'El enlace de pago sigue vigente; todavía no existe una transacción en Wompi.',
            tone: 'info',
          };
    }
  }
}

function transactionPending(): AttemptPresentation {
  return {
    kind: 'transaction_pending',
    title: 'Transacción pendiente',
    text: 'Wompi registró una transacción y todavía no hay un resultado final.',
    tone: 'info',
  };
}

/**
 * El estado efectivo del checkout del pedido: el del intento más reciente, que el contrato entrega
 * **primero**. No se reordena: el orden es del backend.
 */
export function presentCheckoutState(
  attempts: readonly AdminPaymentAttempt[],
  paymentStatus: PaymentStatus,
  now: number | null,
): CheckoutState {
  const latest = attempts[0];

  if (latest === undefined) {
    return {
      kind: 'not_started',
      title: 'Pago no iniciado',
      text: 'Todavía no se ha iniciado un intento de pago.',
      tone: 'neutral',
      inconsistent: false,
    };
  }

  const presented = presentAttempt(latest, now);

  if (presented.kind !== 'approved') {
    return { ...presented, inconsistent: false };
  }

  if (paymentStatus === 'approved') {
    return { kind: 'approved', title: 'Pagado', text: null, tone: 'success', inconsistent: false };
  }

  return {
    kind: 'approved',
    title: 'Inconsistencia de pago',
    text: 'El intento más reciente figura como aprobado, pero el pago del pedido no está aprobado. No se considera pagado hasta que el backend lo confirme.',
    tone: 'danger',
    inconsistent: true,
  };
}

/** Ambiente de un intento, en el vocabulario del proveedor (`sandbox | production`). */
export function describeAttemptEnvironment(
  environment: AdminPaymentAttempt['environment'],
): string {
  return environment === 'production' ? 'Producción' : 'Sandbox';
}

/** Ambiente efectivo del pago del pedido, en el vocabulario del pago (`sandbox | live`). */
export function describePaymentEnvironment(environment: 'sandbox' | 'live'): string {
  return environment === 'live' ? 'Producción' : 'Pruebas (sandbox)';
}

/**
 * Clave de React para un intento.
 *
 * `attemptNumber` **no** es único: hoy puede repetirse en intentos que vencieron sin evento. La
 * clave combina los campos publicados con la posición en la lista del contrato, que es lo único que
 * garantiza unicidad sin suponer nada sobre el número.
 */
export function attemptKey(attempt: AdminPaymentAttempt, index: number): string {
  return `${index}:${attempt.createdAt}:${attempt.expiresAt}:${attempt.environment}:${attempt.attemptNumber}`;
}
