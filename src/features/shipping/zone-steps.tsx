import Link from 'next/link';

import { STEPS, stepHref, type StepId } from './zone-form-model';
import styles from './shipping.module.css';

/**
 * Los cinco pasos de una zona.
 *
 * Son enlaces, no pestañas de un formulario: cada paso guarda lo suyo contra el backend —la zona
 * nace como borrador en el primero— y se puede volver a cualquiera. Antes de crear la zona solo
 * existe el primero; los demás se anuncian, pero no llevan a ningún sitio todavía.
 */
export function ZoneSteps({
  zoneId,
  current,
}: {
  readonly zoneId: string | null;
  readonly current: StepId;
}) {
  return (
    <nav aria-label="Pasos de la zona">
      <ol className={styles.steps}>
        {STEPS.map((step, index) => (
          <li key={step.id}>
            {zoneId === null && step.id !== 'informacion' ? (
              <span aria-disabled="true" className={styles.stepLink}>
                <span aria-hidden="true" className={styles.stepNumber}>
                  {index + 1}
                </span>
                {step.label}
                <span className="sr-only"> (disponible al guardar la información)</span>
              </span>
            ) : (
              <Link
                aria-current={step.id === current ? 'step' : undefined}
                className={styles.stepLink}
                href={zoneId === null ? '/panel/envios/nueva' : stepHref(zoneId, step.id)}
              >
                <span aria-hidden="true" className={styles.stepNumber}>
                  {index + 1}
                </span>
                {step.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
