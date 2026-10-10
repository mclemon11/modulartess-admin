import { describeAddiError } from './addi-integration';
import { formatDateTime } from './format';
import type { PaymentFact } from './payment-method';
import type { AdminPaymentAttempt } from '@/lib/api/orders';

/**
 * Lo que dijo el proveedor sobre un intento (ADR 0030 del backend): su estado original, el
 * identificador de Addi, las fechas de cierre y verificación y el último fallo saneado.
 *
 * Tolera un backend anterior a estos campos: si no llegan, no se muestra nada inventado. De un fallo
 * de redirección solo se enseña el **origen** que publica el backend, nunca una URL.
 */
export function attemptProviderFacts(attempt: AdminPaymentAttempt): readonly PaymentFact[] {
  const facts: PaymentFact[] = [];
  const raw = attempt as Partial<AdminPaymentAttempt>;

  if (typeof raw.providerStatus === 'string') {
    facts.push({ label: 'Estado en el proveedor', value: raw.providerStatus });
  }
  if (typeof raw.externalId === 'string') {
    facts.push({ label: 'Solicitud en Addi', value: raw.externalId });
  }
  if (typeof raw.completedAt === 'string') {
    facts.push({ label: 'Cerrado', value: formatDateTime(raw.completedAt) });
  }
  if (typeof raw.lastVerifiedAt === 'string') {
    facts.push({ label: 'Última verificación', value: formatDateTime(raw.lastVerifiedAt) });
  }
  const error = raw.lastError ?? null;
  if (error !== null) {
    const description = describeAddiError(error.code) ?? error.code;
    facts.push({
      label: 'Último fallo',
      value: `${description} (${formatDateTime(error.at)})${error.origin === null ? '' : ` · origen ${error.origin}`}`,
    });
  }

  return facts;
}
