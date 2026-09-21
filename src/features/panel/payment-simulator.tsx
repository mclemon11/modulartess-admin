'use client';

import { useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import catalog from './catalog.module.css';
import { describeOrderFailure, offersReload } from './order-errors';
import {
  NO_PENDING_EVENT_IDS,
  settleEventId,
  takeEventId,
  type PendingEventIds,
} from './payment-idempotency';
import { simulateOrderPayment } from './orders-client';
import { describeSimulationEvent, needsSimulationConfirmation } from './payment-status';
import styles from './orders.module.css';
import { SectionHeading } from './section-icon';

import type { AdminOrder } from '@/lib/api/orders';

import { can } from '@/features/session/permissions';

/**
 * Simulador de pago. **Solo staging, y no es una pasarela.**
 *
 * Se pinta **solo** si se cumplen las tres condiciones a la vez: el pedido declara
 * `paymentSimulationEnabled`, trae al menos un resultado en `availableSimulationEvents`, y el rol
 * tiene `payments.simulate` —que el contrato reserva a `super_admin`—. Las tres salen del backend o
 * de la matriz explícita de permisos; ninguna se deduce aquí.
 *
 * Los botones son exactamente los de `availableSimulationEvents`. El panel **no** reimplementa la
 * máquina de estados del pago: el contrato dice que esa lista es «outcomes that can be applied from
 * the current payment state… so the panel renders these instead of reimplementing the state
 * machine», y deducirla localmente acabaría ofreciendo transiciones que el backend rechaza.
 *
 * El `eventId` es lo delicado de esta pantalla, y por eso vive en una referencia y no en el estado
 * de React: se genera **una vez por operación lógica** y se conserva si hay que reintentar la misma
 * operación tras un resultado de red ambiguo. Generar uno nuevo después de una respuesta que no se
 * llegó a leer sería aplicar el resultado dos veces, porque el primero pudo haberse aplicado. No se
 * guarda en `localStorage`, ni en `sessionStorage`, ni en una cookie, ni en la URL: vive en memoria
 * mientras la pantalla está abierta y desaparece con ella.
 */
export function PaymentSimulator({
  order,
  role,
  onUpdated,
}: {
  readonly order: AdminOrder;
  readonly role: string;
  readonly onUpdated: (order: AdminOrder) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  /** Resultado que quedó en el aire, con su `eventId`, para poder repetir la **misma** petición. */
  const [retryable, setRetryable] = useState<string | null>(null);
  /*
   * Candado síncrono: se toma antes del primer `await`. `busy` es solo para la representación
   * visual, y el estado de React no llega a tiempo para excluir un segundo clic.
   */
  const running = useRef(false);
  /**
   * Los `eventId` en vuelo, por resultado.
   *
   * En una referencia y no en el estado de React: hay que leerlo y escribirlo **antes** del primer
   * `await`, en el mismo turno en que se toma el candado. Las reglas viven en
   * `./payment-idempotency`, que es puro y tiene sus propias pruebas.
   */
  const eventIds = useRef<PendingEventIds>(NO_PENDING_EVENT_IDS);

  if (
    !order.paymentSimulationEnabled ||
    order.availableSimulationEvents.length === 0 ||
    !can(role, 'payments.simulate')
  ) {
    return null;
  }

  async function apply(event: string): Promise<void> {
    if (running.current) {
      return;
    }

    running.current = true;
    setBusy(true);
    setFailure(null);
    setPending(null);

    // Se resuelve antes del primer `await`: si ya había uno en vuelo para este resultado, es el
    // mismo, porque esta es la misma operación y no otra.
    const taken = takeEventId(eventIds.current, event, () => crypto.randomUUID());

    eventIds.current = taken.pending;

    const result = await simulateOrderPayment(order.id, event, order.version, taken.eventId);

    if (result.ok) {
      eventIds.current = settleEventId(eventIds.current, event, 'applied');
      setRetryable(null);
      onUpdated(result.data);
    } else if (result.ambiguous) {
      // No se sabe si llegó a aplicarse. El identificador **se conserva**: repetir la misma
      // petición con él no puede duplicar nada, y generar uno nuevo sí.
      eventIds.current = settleEventId(eventIds.current, event, 'ambiguous');
      setRetryable(event);
      setFailure(result.code);
    } else {
      // Rechazo definitivo del contrato: ese intento no existe y el identificador se descarta.
      eventIds.current = settleEventId(eventIds.current, event, 'rejected');
      setRetryable(null);
      setFailure(result.code);
    }

    running.current = false;
    setBusy(false);
  }

  return (
    <section className={`${catalog.card} ${catalog.cardPad} ${styles.simulator}`}>
      <SectionHeading
        hint="Solo en el entorno de pruebas. No es una pasarela y no cobra nada."
        icon="simulador"
        title="Simulador de pago"
      />

      <p className={styles.sandboxNote}>
        Entorno de pruebas. No se realiza un cobro real. Cada resultado queda registrado en el
        historial del pago y genera los avisos correspondientes.
      </p>

      <div className={styles.detailActions}>
        {order.availableSimulationEvents.map((event) => (
          <button
            className={catalog.buttonSecondary}
            disabled={busy}
            key={event}
            onClick={() => {
              if (needsSimulationConfirmation(event)) {
                setFailure(null);
                setPending(event);

                return;
              }

              void apply(event);
            }}
            type="button"
          >
            {describeSimulationEvent(event)}
          </button>
        ))}
      </div>

      {pending === null ? null : (
        <SimulationConfirmation
          busy={busy}
          event={pending}
          onCancel={() => {
            setPending(null);
          }}
          onConfirm={() => {
            setPending(null);
            void apply(pending);
          }}
          publicId={order.publicId}
        />
      )}

      {failure === null ? null : (
        <p className={catalog.error} role="alert">
          {retryable === null
            ? describeOrderFailure(failure)
            : 'No recibimos respuesta del servicio. El resultado pudo haberse aplicado, así que no podemos darlo por fallido.'}
          <span className={styles.conflictActions}>
            {retryable === null ? null : (
              <button
                className={catalog.buttonSecondary}
                disabled={busy}
                onClick={() => {
                  void apply(retryable);
                }}
                type="button"
              >
                Reintentar la misma operación
              </button>
            )}
            {retryable !== null || offersReload(failure) ? (
              <button
                className={catalog.buttonSecondary}
                onClick={() => {
                  router.refresh();
                }}
                type="button"
              >
                Recargar pedido
              </button>
            ) : null}
          </span>
        </p>
      )}
    </section>
  );
}

/**
 * Confirmación antes de cerrar el desenlace del pago.
 *
 * Aparece para `approved`, `declined`, `expired` y `error`: los cuatro dejan el pago en un estado
 * del que no se vuelve, y uno de ellos mueve el pedido a `paid`. Dice de qué pedido se trata —por
 * su `publicId`, que es el número que la persona conoce—, qué se va a aplicar, que no hay cobro y
 * qué más se va a mover con ello.
 *
 * Es un bloque en la propia pantalla y **no** un `confirm()` del navegador: un diálogo modal nativo
 * bloquea el documento entero y no se puede leer con calma.
 */
function SimulationConfirmation({
  event,
  publicId,
  busy,
  onConfirm,
  onCancel,
}: {
  readonly event: string;
  readonly publicId: string;
  readonly busy: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <div className={styles.confirmation} role="group">
      <h3 className={styles.confirmationTitle}>
        {describeSimulationEvent(event)} en el pedido {publicId}
      </h3>
      <p className={styles.confirmationText}>
        Es una simulación en el entorno de pruebas: <strong>no se realiza ningún cobro</strong>. El
        resultado se registra en el historial del pago, puede mover el estado del pedido y genera
        avisos en vista previa o suprimidos, según la configuración del entorno.
      </p>
      <div className={styles.detailActions}>
        <button className={catalog.buttonPrimary} disabled={busy} onClick={onConfirm} type="button">
          Confirmar
        </button>
        <button
          className={catalog.buttonSecondary}
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
