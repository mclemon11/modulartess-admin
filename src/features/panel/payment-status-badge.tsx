import catalog from './catalog.module.css';
import { describePaymentStatus, paymentStatusVariant } from './payment-status';
import styles from './orders.module.css';

const CLASS_BY_VARIANT = {
  pending: styles.badgePaymentPending,
  processing: styles.badgePaymentProcessing,
  approved: styles.badgePaymentApproved,
  declined: styles.badgePaymentDeclined,
  voided: styles.badgePaymentVoided,
  expired: styles.badgePaymentExpired,
  error: styles.badgePaymentError,
  unknown: styles.badgeUnknown,
} as const;

/**
 * Badge del estado del **pago**.
 *
 * Es otra pastilla que la del pedido a propósito: las dos lecturas conviven en la misma fila y en
 * la misma ficha, y confundirlas es el error que hay que evitar. Comparten la forma del catálogo y
 * no comparten ni colores ni vocabulario.
 *
 * `label` existe para el detalle, donde el contrato publica `payment.statusLabel`. En el listado no
 * hay etiqueta —el resumen solo trae `paymentStatus`—, así que ahí se usa el mapa cerrado del
 * panel. El punto de color es decorativo: el estado se lee en el texto.
 */
export function PaymentStatusBadge({
  status,
  label,
}: {
  readonly status: string;
  readonly label?: string | null;
}) {
  return (
    <span className={`${catalog.badge} ${CLASS_BY_VARIANT[paymentStatusVariant(status)]}`}>
      <span aria-hidden="true" className={catalog.dot} />
      {label !== undefined && label !== null && label.length > 0
        ? label
        : describePaymentStatus(status)}
    </span>
  );
}
