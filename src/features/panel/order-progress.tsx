import { formatDateTime } from './format';
import { buildOrderJourney } from './order-journey';
import styles from './orders.module.css';

import type { AdminPaymentEvent, OrderTimelineEntry } from '@/lib/api/orders';

/**
 * Recorrido del pedido, como el stepper de las referencias: siete hitos.
 *
 * Lo que marca un hito como alcanzado es el **historial** —el del pedido o el del pago, según el
 * hito—, no el estado actual: si no hay entrada de ese paso, el paso no se pinta como hecho aunque
 * el pedido esté más adelante. El historial es la verdad de por dónde pasó.
 *
 * Un pedido antiguo puede tener `preparing → shipped` sin `ready_to_ship`, porque ese estado no
 * existía cuando se procesó. Ese hueco **no** se rellena: se marca como «no registrado», que es una
 * afirmación distinta de «está pendiente» y distinta de «ocurrió». La diferencia se ve —el paso
 * queda con borde discontinuo— y se oye, porque va escrita para el lector de pantalla.
 *
 * Un pedido cancelado **conserva** los hitos que llegó a alcanzar: cancelar es salirse del
 * recorrido, no borrarlo. La cancelación se cuenta aparte, con su fecha, porque no es un paso más.
 */
export function OrderProgress({
  status,
  timeline,
  paymentEvents,
}: {
  readonly status: string;
  readonly timeline: readonly OrderTimelineEntry[];
  readonly paymentEvents: readonly AdminPaymentEvent[];
}) {
  const journey = buildOrderJourney({ status, timeline, paymentEvents });
  const cancelled = journey.cancelledAt !== null || status === 'cancelled';
  const anyNotRecorded = journey.milestones.some((milestone) => milestone.notRecorded);

  return (
    <>
      <ol className={styles.progress}>
        {journey.milestones.map((milestone) => (
          <li
            className={
              milestone.reached
                ? `${styles.progressStep} ${styles.progressStepDone}`
                : styles.progressStep
            }
            key={milestone.key}
          >
            <span
              aria-hidden="true"
              className={
                milestone.current
                  ? styles.progressMarkCurrent
                  : milestone.reached
                    ? styles.progressMarkDone
                    : milestone.notRecorded
                      ? styles.progressMarkSkipped
                      : styles.progressMark
              }
            >
              {milestone.notRecorded ? '–' : '✓'}
            </span>
            <span className={milestone.reached ? styles.progressLabelDone : styles.progressLabel}>
              {milestone.label}
            </span>
            {/*
             * El estado no depende del color ni del icono: cada paso dice en texto en qué situación
             * está. Cuando se alcanzó, la fecha ya lo cuenta; cuando no, hace falta decirlo, y ese
             * texto se reserva a los lectores de pantalla para no llenar el stepper de «Pendiente».
             *
             * «No registrado» y «Pendiente» **no** son lo mismo, y el matiz importa: el primero dice
             * que el pedido siguió adelante sin dejar constancia de ese paso, no que ocurriera.
             */}
            {milestone.at === null ? (
              <span className="sr-only">
                {milestone.notRecorded
                  ? 'No registrado: el pedido avanzó sin dejar constancia de este paso.'
                  : cancelled
                    ? 'No se alcanzó: el pedido se canceló antes.'
                    : 'Pendiente'}
              </span>
            ) : (
              <span className={styles.progressAt}>{formatDateTime(milestone.at)}</span>
            )}
          </li>
        ))}
      </ol>

      {anyNotRecorded ? (
        <p className={styles.journeyNote}>
          Los pasos con guion no quedaron registrados en el historial. El pedido avanzó sin ellos
          —son anteriores a que ese paso existiera—, así que el panel no afirma que ocurrieran.
        </p>
      ) : null}

      {cancelled ? (
        <p className={styles.journeyNote}>
          {/* La fecha formateada ya termina en punto —«a. m.»—, así que la frase no añade otro. */}
          {journey.cancelledAt === null
            ? 'El pedido se canceló.'
            : `El pedido se canceló el ${formatDateTime(journey.cancelledAt)}`}{' '}
          Los hitos que alcanzó se conservan; los que no, ya no llegarán.
        </p>
      ) : null}
    </>
  );
}
