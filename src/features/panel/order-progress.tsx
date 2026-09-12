import { formatDateTime } from './format';
import styles from './orders.module.css';
import { describeOrderStatus, ORDER_PROGRESS } from './order-status';

import type { OrderTimelineEntry } from '@/lib/api/orders';

/**
 * Recorrido del pedido, como el stepper de las referencias.
 *
 * Los cinco pasos son los del contrato, y lo que marca cada uno como alcanzado es el **historial**,
 * no una suposición: si `timeline` no tiene una entrada de ese estado, el paso no se pinta como
 * hecho aunque el pedido esté más adelante. El historial es la verdad de por dónde pasó.
 *
 * Un pedido cancelado no enseña pasos pendientes: cancelar no es ir hacia atrás en el recorrido, es
 * salirse de él, y dibujar cuatro círculos vacíos sugeriría que todavía puede avanzar.
 */
export function OrderProgress({
  status,
  timeline,
}: {
  readonly status: string;
  readonly timeline: readonly OrderTimelineEntry[];
}) {
  if (status === 'cancelled') {
    const cancelledAt = timeline.find((entry) => entry.status === 'cancelled');

    return (
      <p className={styles.cancelledNote}>
        El pedido se canceló
        {cancelledAt === undefined ? '' : ` el ${formatDateTime(cancelledAt.at)}`}. Los pedidos
        cancelados no avanzan ni se eliminan.
      </p>
    );
  }

  const reachedAt = new Map(timeline.map((entry) => [entry.status, entry.at]));

  return (
    <ol className={styles.progress}>
      {ORDER_PROGRESS.map((step) => {
        const at = reachedAt.get(step);
        const done = at !== undefined;
        const current = step === status;

        return (
          <li
            className={
              done ? `${styles.progressStep} ${styles.progressStepDone}` : styles.progressStep
            }
            key={step}
          >
            <span
              aria-hidden="true"
              className={
                current
                  ? styles.progressMarkCurrent
                  : done
                    ? styles.progressMarkDone
                    : styles.progressMark
              }
            >
              ✓
            </span>
            <span className={done ? styles.progressLabelDone : styles.progressLabel}>
              {describeOrderStatus(step)}
            </span>
            {at === undefined ? null : (
              <span className={styles.progressAt}>{formatDateTime(at)}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
