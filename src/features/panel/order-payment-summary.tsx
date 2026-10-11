import { AddiOutcomeBadge } from './addi-outcome-badge';
import { compactPaymentSummary } from './payment-method';
import { reconciliationRowText } from './payment-reconciliation';
import styles from './orders.module.css';

import type { AdminOrderListItem, AdminPaymentSummary } from '@/lib/api/orders';

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

/**
 * El pago final según la conciliación manual (ADR 0014), en una línea aparte del medio: así una
 * fila distingue el intento de Wompi —que sigue en su estado— del pago que registró el equipo.
 * «Revisión requerida» se dice con texto, no solo con color. Sin conciliación no se pinta nada.
 */
export function OrderReconciliationLine({
  summary,
}: {
  readonly summary: AdminOrderListItem['paymentReconciliation'];
}) {
  const text = reconciliationRowText(summary);

  if (text === null) return null;

  return (
    <span className={text.review ? styles.reconciliationReview : styles.reconciliationLine}>
      {text.visible}
    </span>
  );
}

/**
 * La celda «Medio de pago» de una fila: por dónde se paga el pedido, con o sin pago aprobado.
 *
 * - **Addi Online**: el canal y, debajo, la pastilla del último resultado de Addi —«Abandonado por
 *   el cliente», «Aprobado por Addi»…—, que es una lectura aparte del estado del pago y del pedido.
 * - **Addi Marketplace (manual)**: el canal, dicho así, para que nunca se confunda con el anterior.
 * - El resto: el resumen del cobro aprobado —«Wompi · Visa •••• 1234»— o, sin pago aprobado, el
 *   canal. Con un backend anterior al canal (tras un rollback) queda el resumen de siempre.
 */
export function OrderPaymentChannel({ order }: { readonly order: AdminOrderListItem }) {
  const channel = order.paymentChannel;

  if (channel?.code === 'addi_online') {
    return (
      <span className={styles.addiCell}>
        <span className={styles.addiChannel}>{channel.label}</span>
        {order.addiPayment == null ? (
          <span className={styles.paymentSummaryEmpty}>Sin intento todavía</span>
        ) : (
          <AddiOutcomeBadge outcome={order.addiPayment} />
        )}
      </span>
    );
  }

  if (
    channel === undefined ||
    (channel.code !== 'addi_marketplace' && order.paymentSummary !== null)
  ) {
    return <OrderPaymentSummary summary={order.paymentSummary} />;
  }

  return <span className={styles.paymentSummary}>{channel.label}</span>;
}
