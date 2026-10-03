'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';

import catalog from '@/features/panel/catalog.module.css';
import type { ShippingAnalysis, ShippingZone } from '@/lib/api/shipping';

import { FailureNotice } from './failure-notice';
import { query, transitionZone } from './shipping-client';
import styles from './shipping.module.css';
import { useExclusive } from './use-exclusive';

type Failure = { readonly code: string; readonly reference?: string | undefined } | null;

/**
 * «Activar» con validación previa y confirmación explícita.
 *
 * Al abrir, se vuelve a pedir el análisis al backend —solapamientos, empates y municipios sin
 * cobertura de la red activa— para que lo que se confirma sea lo de ahora y no lo de cuando se
 * cargó la página. Activar exige marcar la casilla de confirmación. La autoridad sigue siendo el
 * backend: si la zona empata con otra activa, la rechaza con `shipping_zone_ambiguous` y aquí se
 * explica qué cambiar.
 *
 * Una copia que no está lista o una zona con bloqueos no muestra el botón.
 */
export function ActivateZone({
  zone,
  enabled,
}: {
  readonly zone: ShippingZone;
  readonly enabled: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const dialog = useRef<HTMLDialogElement | null>(null);
  const { busy, run } = useExclusive();
  const [analysis, setAnalysis] = useState<ShippingAnalysis | null>(null);
  const [analysisFailure, setAnalysisFailure] = useState<Failure>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [failure, setFailure] = useState<Failure>(null);

  async function open() {
    setConfirmed(false);
    setFailure(null);
    setAnalysis(null);
    setAnalysisFailure(null);
    dialog.current?.showModal();

    const result = await query<ShippingAnalysis>('/api/admin/shipping/analysis');

    if (result.ok) setAnalysis(result.data);
    else setAnalysisFailure({ code: result.code, reference: result.reference });
  }

  async function activate() {
    const result = await run(() => transitionZone(zone.id, 'activate', zone.version));

    if (result === null) return;
    if (!result.ok) {
      setFailure({ code: result.code, reference: result.reference });

      return;
    }

    dialog.current?.close();
    router.push('/panel/envios');
    router.refresh();
  }

  if (!enabled) {
    return (
      <p className={catalog.hint}>
        {zone.status === 'active'
          ? 'La zona ya está activa.'
          : 'Resuelve los bloqueos de arriba para poder activarla.'}
      </p>
    );
  }

  return (
    <>
      <button className={catalog.buttonPrimary} onClick={() => void open()} type="button">
        Validar y activar
      </button>
      <dialog
        aria-describedby={`${id}-text`}
        aria-labelledby={`${id}-title`}
        className={`${catalog.previewDialog} ${styles.wideDialog}`}
        ref={dialog}
      >
        <div className={catalog.previewDialogBody}>
          <h2 className={catalog.sectionTitle} id={`${id}-title`}>
            ¿Activar «{zone.name}»?
          </h2>
          <p className={catalog.pageLead} id={`${id}-text`}>
            Al activarla empieza a cotizar dentro de su vigencia para los destinos que cubre. El
            backend comprobará que tiene cobertura, al menos una regla activa y que no empata con
            otra zona activa de la misma prioridad.
          </p>

          <div aria-live="polite">
            {analysis === null && analysisFailure === null ? (
              <p className={catalog.hint} role="status">
                Consultando la red de zonas activas…
              </p>
            ) : null}
            {analysisFailure === null ? null : (
              <FailureNotice code={analysisFailure.code} reference={analysisFailure.reference} />
            )}
            {analysis === null ? null : (
              <ul className={styles.warningList}>
                <li className={analysis.conflicts.length === 0 ? styles.ok : styles.warning}>
                  {analysis.conflicts.length === 0
                    ? 'Sin empates entre las zonas activas.'
                    : `${analysis.conflicts.length} empate${analysis.conflicts.length === 1 ? '' : 's'} entre zonas activas: en esos municipios el envío queda no disponible.`}
                </li>
                <li
                  className={
                    analysis.uncoveredMunicipalityCodes.length === 0 ? styles.ok : styles.warning
                  }
                >
                  {analysis.uncoveredMunicipalityCodes.length === 0
                    ? 'Todos los municipios tienen alguna zona activa.'
                    : `${analysis.uncoveredMunicipalityCodes.length} de ${analysis.totalMunicipalityCount} municipios no tienen zona activa: allí el envío es cotización manual o no disponible, nunca gratis.`}
                </li>
              </ul>
            )}
          </div>

          <p className={catalog.hint}>
            ¿Quieres comprobar un destino concreto antes?{' '}
            <Link href={`/panel/envios/vista-previa?borrador=${encodeURIComponent(zone.id)}`}>
              Abrir la vista previa con este borrador
            </Link>
            .
          </p>

          <label className={styles.choice}>
            <input
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              type="checkbox"
            />
            <span className={styles.choiceText}>
              <span className={styles.choiceTitle}>
                Revisé la cobertura, las tarifas y las advertencias
              </span>
              <span className={styles.choiceHint}>
                Entiendo que la zona empezará a cotizar y que los destinos sin cobertura seguirán
                sin envío gratis.
              </span>
            </span>
          </label>

          {failure === null ? null : (
            <FailureNotice code={failure.code} reference={failure.reference} />
          )}

          <div className={catalog.actions}>
            <button
              className={catalog.buttonPrimary}
              disabled={busy || !confirmed}
              onClick={() => void activate()}
              type="button"
            >
              {busy ? 'Activando…' : 'Activar zona'}
            </button>
            <button
              autoFocus
              className={catalog.buttonSecondary}
              disabled={busy}
              onClick={() => dialog.current?.close()}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
