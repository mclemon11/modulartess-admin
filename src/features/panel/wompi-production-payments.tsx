'use client';

import { useEffect, useRef, useState, type Ref } from 'react';

import { useRouter } from 'next/navigation';

import catalog from './catalog.module.css';
import styles from './integrations.module.css';
import { updateWompiIntegration } from './integrations-client';
import {
  describeProductionFailure,
  isLiveConfirmation,
  LIVE_CONFIRMATION_PHRASE,
  productionPaymentsRequest,
  productionPaymentsState,
  productionRequiresReload,
} from './wompi-live-payments';

import type { WompiIntegration } from '@/lib/api/integrations';

/**
 * Activar o desactivar los **cobros reales** de Producción.
 *
 * Es el único sitio del panel que mueve dinero de verdad, así que cada estado dice exactamente lo
 * que hay, y todo sale de la respuesta del backend:
 *
 * - **Sin las cuatro llaves**, no se pinta nada: en pantalla queda solo el formulario de llaves, y
 *   lo que falta ya lo dice la insignia de credenciales.
 * - **Con llaves y el despliegue bloqueando**, se explica que el bloqueo es del despliegue. No hay
 *   botón: solo podría responder `wompi_live_payments_not_enabled`.
 * - **Permitido y apagado**, «Cobros reales desactivados» y un botón visible para activarlos.
 * - **Encendido**, «Cobros reales activos» y un botón para desactivarlos.
 *
 * Activar exige escribir {@link LIVE_CONFIRMATION_PHRASE}. Desactivar no: parar de cobrar es
 * siempre seguro —no borra nada y los pagos en vuelo se siguen cerrando— y ponerle fricción haría
 * más lenta la reacción ante un problema.
 *
 * Tras cualquier respuesta el estado se **relee** del backend con `router.refresh()`. La pantalla
 * no adelanta el resultado ni se guarda una copia.
 */
export function ProductionPaymentsControl({
  integration,
  canManage,
}: {
  readonly integration: WompiIntegration;
  readonly canManage: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  /** Lo escrito en la confirmación. Nunca sobrevive a un intento ni a una cancelación. */
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  /*
   * Candado síncrono, tomado antes del primer `await`. `busy` es solo para la representación
   * visual: un doble clic en «Confirmar» no puede mandar dos peticiones.
   */
  const running = useRef(false);
  const confirmationInput = useRef<HTMLInputElement | null>(null);
  const activateButton = useRef<HTMLButtonElement | null>(null);

  // Al abrir la confirmación, el foco va a donde hay que escribir.
  useEffect(() => {
    if (confirming) confirmationInput.current?.focus();
  }, [confirming]);

  const state = productionPaymentsState(integration);

  if (state === 'unconfigured') return null;

  if (state === 'blocked') {
    return (
      <div className={styles.paymentsToggle} data-production-state="blocked">
        <p className={catalog.hint}>
          Las llaves de Producción están guardadas, pero este despliegue todavía bloquea los cobros
          reales. Mientras siga así no se pueden activar desde el panel.
        </p>
      </div>
    );
  }

  const enabled = state === 'active';

  async function apply(enable: boolean): Promise<void> {
    if (running.current) return;

    running.current = true;
    setBusy(true);
    setFailure(null);

    // Solo el ambiente, el interruptor y la versión. Ninguna credencial viaja aquí.
    const result = await updateWompiIntegration(
      productionPaymentsRequest(integration.version, enable),
    );

    // La frase no se conserva tras ningún intento: la siguiente activación se vuelve a escribir.
    setPhrase('');

    if (result.ok) {
      setConfirming(false);
      router.refresh();
    } else {
      setFailure(describeProductionFailure(result.code));
      if (productionRequiresReload(result.code)) router.refresh();
    }

    running.current = false;
    setBusy(false);
  }

  function cancel(): void {
    setConfirming(false);
    setPhrase('');
    setFailure(null);
    activateButton.current?.focus();
  }

  return (
    <div className={styles.paymentsToggle} data-production-state={state}>
      <div className={styles.paymentsState}>
        {enabled ? (
          <span className={styles.stateActive} data-state="active">
            Cobros reales activos
          </span>
        ) : (
          <span className={styles.statePending} data-state="inactive">
            Cobros reales desactivados
          </span>
        )}

        {!canManage || confirming ? null : enabled ? (
          <button
            className={catalog.buttonSecondary}
            disabled={busy}
            onClick={() => void apply(false)}
            type="button"
          >
            {busy ? 'Aplicando…' : 'Desactivar cobros reales'}
          </button>
        ) : (
          <button
            className={catalog.buttonPrimary}
            onClick={() => {
              setFailure(null);
              setConfirming(true);
            }}
            ref={activateButton}
            type="button"
          >
            Activar cobros reales
          </button>
        )}
      </div>

      <p className={catalog.hint}>
        {enabled
          ? 'Cada checkout nuevo de Producción cobra dinero real. Desactivarlo no borra nada: los pagos en vuelo se siguen cerrando.'
          : 'Las llaves están guardadas y el despliegue ya permite cobrar. No se cobra nada hasta que alguien lo active aquí.'}
      </p>

      {/*
        El ambiente activo lo deriva el backend. Si Producción está encendida pero el backend
        sigue informando otro, se dice: «activos» no puede leerse como «ya se está cobrando» cuando
        los checkouts nuevos todavía no salen por Producción.
      */}
      {enabled && integration.activeEnvironment !== 'production' ? (
        <p className={catalog.hint} data-active-environment={integration.activeEnvironment}>
          {integration.activeEnvironment === 'sandbox'
            ? 'El backend informa que el ambiente activo sigue siendo Pruebas (Sandbox): los pagos de prueba siguen encendidos. Desactívalos para que los checkouts nuevos salgan por Producción.'
            : 'El backend todavía no informa Producción como ambiente activo.'}
        </p>
      ) : null}

      {!canManage ? (
        <p className={catalog.hint}>Tu rol puede ver este estado, pero no cambiarlo.</p>
      ) : null}

      {canManage && confirming && !enabled ? (
        <LivePaymentsConfirmation
          busy={busy}
          inputRef={confirmationInput}
          onCancel={cancel}
          onConfirm={() => void apply(true)}
          onPhraseChange={setPhrase}
          phrase={phrase}
        />
      ) : null}

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

/**
 * La confirmación de activar cobros reales.
 *
 * Es un `<form>` propio —y por eso el formulario de llaves no la envuelve—: pulsar Intro en el
 * campo confirma **esta** acción y nunca envía las llaves. «Confirmar» está deshabilitado mientras
 * lo escrito no sea la frase exacta, y el `submit` lo vuelve a comprobar: un botón deshabilitado
 * no impide que Intro envíe el formulario.
 *
 * Solo presenta. Quién manda qué lo decide {@link ProductionPaymentsControl}.
 */
export function LivePaymentsConfirmation({
  phrase,
  busy,
  onPhraseChange,
  onConfirm,
  onCancel,
  inputRef,
}: {
  readonly phrase: string;
  readonly busy: boolean;
  readonly onPhraseChange: (value: string) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly inputRef?: Ref<HTMLInputElement>;
}) {
  const matches = isLiveConfirmation(phrase);

  return (
    <form
      aria-describedby="wompi-live-warning"
      aria-labelledby="wompi-live-title"
      className={styles.liveConfirm}
      onSubmit={(event) => {
        event.preventDefault();
        if (matches && !busy) onConfirm();
      }}
    >
      <p className={styles.liveConfirmTitle} id="wompi-live-title">
        Vas a activar los cobros reales
      </p>
      <p className={styles.liveConfirmText} id="wompi-live-warning">
        Desde el momento en que confirmes, cada checkout nuevo de la tienda cobrará{' '}
        <strong>dinero real</strong> a quien compra, con la cuenta de Producción de Wompi. No es una
        prueba y no se puede deshacer un cobro ya hecho desactivándolo después.
      </p>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="wompi-live-confirmation">
          Escribe <strong>{LIVE_CONFIRMATION_PHRASE}</strong> para confirmar
        </label>
        <input
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          className={styles.input}
          disabled={busy}
          id="wompi-live-confirmation"
          name="wompi-live-confirmation"
          onChange={(event) => {
            onPhraseChange(event.target.value);
          }}
          ref={inputRef}
          spellCheck={false}
          type="text"
          value={phrase}
        />
      </div>

      <div className={styles.formActions}>
        <button className={catalog.buttonDanger} disabled={!matches || busy} type="submit">
          {busy ? 'Activando…' : 'Confirmar: cobrar dinero real'}
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
    </form>
  );
}
