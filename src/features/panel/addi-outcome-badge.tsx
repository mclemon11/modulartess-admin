import catalog from './catalog.module.css';
import styles from './orders.module.css';

import type { AdminAddiOutcome } from './addi-payment';

const CLASS_BY_TONE: Readonly<Record<string, string | undefined>> = {
  success: styles.badgeAddiSuccess,
  info: styles.badgeAddiInfo,
  warning: styles.badgeAddiWarning,
  danger: styles.badgeAddiDanger,
  neutral: styles.badgeAddiNeutral,
};

/**
 * Pastilla del resultado de Addi: «Abandonado por el cliente», «Aprobado por Addi»…
 *
 * Es una tercera lectura, aparte del pago y del pedido. El texto lo pone el backend y siempre se
 * lee; el punto y el color solo lo refuerzan. Un tono desconocido cae al neutro.
 */
export function AddiOutcomeBadge({ outcome }: { readonly outcome: AdminAddiOutcome }) {
  return (
    <span
      className={`${catalog.badge} ${CLASS_BY_TONE[outcome.tone] ?? styles.badgeAddiNeutral}`}
      data-addi-outcome={outcome.outcome}
    >
      <span aria-hidden="true" className={catalog.dot} />
      <span className="sr-only">Addi: </span>
      {outcome.label}
    </span>
  );
}
