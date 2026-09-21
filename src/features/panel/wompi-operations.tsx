'use client';

import { useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import catalog from './catalog.module.css';
import styles from './integrations.module.css';
import { updateWompiIntegration } from './integrations-client';
import { describeSaveFailure, requiresReload } from './wompi-credential-check';

import type { WompiIntegration } from '@/lib/api/integrations';

/**
 * Abrir o cerrar los checkouts de **Pruebas**.
 *
 * Está separado de «Guardar llaves», y la separación es de fondo, no de maquetación: guardar una
 * credencial no mueve dinero —la escribe en el almacén de secretos y mueve un puntero—, mientras
 * que activar un ambiente es lo que hace posible que se abra un checkout. El backend las trata
 * como dos operaciones distintas y el panel también, para que nadie active pagos creyendo que solo
 * estaba pegando unas llaves.
 *
 * Desactivar **no borra nada**: ni pedidos, ni intentos, ni eventos, ni secretos. El webhook sigue
 * cerrando los pagos que ya estaban en vuelo, que es justo lo que haría falta si alguien lo apagara
 * con una transacción a medias. Es la diferencia entre «quitar Wompi» y «dejar de abrir checkouts
 * nuevos», y solo la segunda es reversible.
 *
 * **Solo Pruebas.** Para Producción no hay control equivalente y no es un olvido: los cobros reales
 * están bloqueados por una constante del backend, no por una casilla, y un botón que solo puede
 * devolver `wompi_live_payments_not_enabled` prometería algo que no va a ocurrir. Lo que se enseña
 * ahí es una línea que explica que las llaves sí quedan guardadas.
 *
 * Mientras Sandbox esté incompleto, **no se pinta nada**. Un botón deshabilitado invita a pulsarlo
 * para averiguar por qué; lo que falta ya lo dice la insignia de credenciales, justo encima.
 */
export function SandboxPaymentsToggle({
  integration,
  environment,
  canManage,
}: {
  readonly integration: WompiIntegration;
  /** El ambiente que está seleccionado en el formulario. */
  readonly environment: 'sandbox' | 'production';
  readonly canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  /*
   * Candado síncrono, tomado antes del primer `await`. `busy` es solo para la representación
   * visual: el estado de React no llega a tiempo de excluir un segundo clic, y dos peticiones con
   * la misma `expectedVersion` acabarían en un conflicto que nadie provocó a propósito.
   */
  const running = useRef(false);

  const sandbox = integration.sandbox;

  /*
   * Producción no tiene control, y lo que se dice ahí lo decide el **backend**, no una constante
   * de esta pantalla: `livePaymentsEnabled` llega en la respuesta. Escribir aquí «están
   * bloqueados» sin mirarlo haría que el panel siguiera afirmándolo el día que dejara de ser
   * cierto.
   */
  if (environment === 'production') {
    return (
      <p className={catalog.hint}>
        {integration.livePaymentsEnabled
          ? 'Los cobros reales están habilitados en el backend. Esta pantalla solo guarda las llaves; abrirlos o cerrarlos no se hace desde aquí.'
          : 'Los cobros reales siguen bloqueados en este despliegue. Las llaves de Producción sí se guardan; activarlos no depende del panel.'}
      </p>
    );
  }

  // Sin las cuatro llaves no hay nada que activar, y el backend lo rechazaría.
  if (!sandbox.configured) return null;

  const enabled = sandbox.enabledForNewPayments;

  async function toggle(): Promise<void> {
    if (running.current) return;

    running.current = true;
    setBusy(true);
    setFailure(null);

    /*
     * El cuerpo lleva **solo** el interruptor. Ninguna credencial viaja aquí: esta operación no
     * las toca, y mandarlas «por si acaso» escribiría una versión nueva en el almacén de secretos
     * cada vez que alguien enciende o apaga.
     */
    const result = await updateWompiIntegration({
      expectedVersion: integration.version,
      environment: 'sandbox',
      enabledForNewPayments: !enabled,
    });

    if (result.ok) {
      // El estado autoritativo llega releyendo el Server Component: aquí no se guarda copia ni se
      // adelanta el resultado.
      router.refresh();
    } else {
      setFailure(describeSaveFailure(result.code));
      // Un conflicto de versión se resuelve releyendo: la siguiente pulsación parte de la nueva.
      if (requiresReload(result.code)) router.refresh();
    }

    running.current = false;
    setBusy(false);
  }

  return (
    <div className={styles.paymentsToggle}>
      <div className={styles.paymentsState}>
        {enabled ? (
          <span className={styles.stateActive} data-state="active">
            Pagos de prueba activos
          </span>
        ) : (
          <span className={styles.statePending} data-state="inactive">
            Pagos de prueba desactivados
          </span>
        )}

        {canManage ? (
          <button
            className={enabled ? catalog.buttonSecondary : catalog.buttonPrimary}
            disabled={busy}
            onClick={() => void toggle()}
            type="button"
          >
            {busy
              ? 'Aplicando…'
              : enabled
                ? 'Desactivar pagos de prueba'
                : 'Activar pagos de prueba'}
          </button>
        ) : null}
      </div>

      <p className={catalog.hint}>
        {enabled
          ? 'Se pueden abrir checkouts de prueba. Desactivarlo no borra nada: los pagos en vuelo se siguen cerrando.'
          : 'Las llaves están guardadas. Activar es una decisión aparte de guardarlas.'}
      </p>

      <div aria-live="assertive">
        {failure === null ? null : (
          <p className={catalog.error} role="alert">
            {failure}
          </p>
        )}
      </div>
    </div>
  );
}
