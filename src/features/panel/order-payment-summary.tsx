import { compactPaymentSummary } from './payment-method';
import styles from './orders.module.css';

import type { AdminPaymentSummary } from '@/lib/api/orders';

/**
 * Cómo se cobró un pedido, en una línea: «Wompi · Visa •••• 1234».
 *
 * Es texto, no un icono: se entiende sin color y sin imagen. El lector de pantalla oye la misma
 * frase sin los puntos de la máscara. Sin pago aprobado no hay resumen y se dice, sin un hueco.
 */
export function OrderPaymentSummary({ summary }: { readonly summary: AdminPaymentSummary | null }) {
  if (summary === null) {
    return (
      <span className={styles.paymentSummaryEmpty}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">Sin pago aprobado</span>
      </span>
    );
  }

  const text = compactPaymentSummary(summary);

  return (
    <span className={styles.paymentSummary}>
      <span aria-hidden="true">{text.visible}</span>
      <span className="sr-only">{text.spoken}</span>
    </span>
  );
}
