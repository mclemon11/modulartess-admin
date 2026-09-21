'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import catalog from './catalog.module.css';
import { isFinalOrderStatus, orderActions, type OrderAction } from './order-actions';
import { describeOrderFailure, offersReload } from './order-errors';
import { cancelOrder, changeOrderStatus } from './orders-client';
import styles from './orders.module.css';

import type { AdminOrder } from '@/lib/api/orders';

/**
 * Acciones logísticas del detalle del pedido.
 *
 * Pinta **botones concretos** —«Marcar listo para envío»— y no un selector de estados: un
 * desplegable con los siete valores dejaría elegir transiciones que el backend rechaza, y el error
 * llegaría después de pulsar. Qué botones hay lo decide `orderActions`, que es una función pura y
 * tiene su propia prueba; como mucho ofrece la **siguiente** transición válida.
 *
 * Aquí no se aprueba ningún pago. `pending_payment → paid` lo aplica el desenlace del pago, en la
 * misma transacción que lo confirma.
 *
 * Toda mutación envía `expectedVersion`, y la respuesta autoritativa **sustituye** el estado local:
 * el pedido que se pinta después es el que devolvió el backend, no una versión adivinada sumando
 * uno.
 */
export function OrderActionsBar({
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
  /*
   * Candado síncrono: se toma antes del primer `await`. `busy` es solo para la representación
   * visual, y el estado de React no llega a tiempo para excluir un segundo clic.
   */
  const running = useRef(false);

  const actions = orderActions(role, {
    status: order.status,
    paymentStatus: order.payment.status,
  });

  async function run(action: OrderAction): Promise<void> {
    if (running.current) {
      return;
    }

    running.current = true;
    setBusy(true);
    setFailure(null);

    const result =
      action.kind === 'cancel'
        ? await cancelOrder(order.id, order.version)
        : await changeOrderStatus(order.id, action.to, order.version);

    if (result.ok) {
      onUpdated(result.data);
    } else {
      setFailure(result.code);
    }

    running.current = false;
    setBusy(false);
  }

  return (
    <>
      <div className={styles.detailActions}>
        {actions.map((action) => (
          <button
            className={action.kind === 'cancel' ? catalog.buttonDanger : catalog.buttonPrimary}
            disabled={busy}
            key={action.kind === 'cancel' ? 'cancel' : action.to}
            onClick={() => void run(action)}
            type="button"
          >
            {action.label}
          </button>
        ))}
      </div>

      {actions.length === 0 ? <NoActions order={order} role={role} /> : null}

      {failure === null ? null : (
        <p className={catalog.error} role="alert">
          {describeOrderFailure(failure)}
          {offersReload(failure) ? (
            <span className={styles.conflictActions}>
              <button
                className={catalog.buttonSecondary}
                onClick={() => {
                  router.refresh();
                }}
                type="button"
              >
                Recargar pedido
              </button>
            </span>
          ) : null}
        </p>
      )}
    </>
  );
}

/**
 * Por qué no hay nada que hacer.
 *
 * Un estado final, un pago en curso y un permiso que falta se parecen desde fuera —no hay botones—
 * y significan cosas muy distintas. Decirlo evita que alguien crea que la pantalla se rompió.
 */
function NoActions({ order, role }: { readonly order: AdminOrder; readonly role: string }) {
  if (isFinalOrderStatus(order.status)) {
    return (
      <p className={catalog.hint}>
        {order.statusLabel} es un estado final: el pedido no avanza más.
      </p>
    );
  }

  if (order.status === 'pending_payment') {
    return (
      <p className={catalog.hint}>
        {order.payment.status === 'processing'
          ? 'Hay un intento de pago en curso. Mientras esté abierto no se ofrece cancelar: podría aprobarse justo después de pulsar.'
          : 'Este pedido espera el pago. Confirmarlo es cosa del desenlace del pago, no de las acciones logísticas.'}
        {role === 'moderator' ? ' Tu rol tampoco permite cancelarlo.' : ''}
      </p>
    );
  }

  return <p className={catalog.hint}>Tu rol no permite mover este pedido.</p>;
}
