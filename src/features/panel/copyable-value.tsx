'use client';

import { useId, useState } from 'react';

import catalog from './catalog.module.css';
import styles from './integrations.module.css';

/**
 * Un valor de solo lectura con botón de copiar.
 *
 * Se usa para las URL que **deriva el backend** —la de eventos y la de retorno— y por eso es un
 * `input` deshabilitado y no un campo editable: lo que se escribiera ahí no se guardaría en
 * ninguna parte, y un campo con aspecto editable invita a escribir en él.
 *
 * Es un Client Component porque copiar al portapapeles necesita una API del navegador. Es lo único
 * que hace: no lee, no escribe y no manda nada a ningún sitio.
 *
 * El resultado de copiar se anuncia con `aria-live`, no solo con un cambio de color del botón:
 * quien no ve el botón necesita saber igual que el valor ya está en el portapapeles.
 */
export function CopyableValue({
  label,
  value,
  hint,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string | undefined;
}) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      /*
       * El portapapeles puede estar bloqueado —contexto no seguro, permiso denegado—. No es un
       * error que merezca una alerta: el valor está a la vista y se puede seleccionar a mano, así
       * que lo único que se hace es no afirmar que se copió.
       */
      setCopied(false);
    }
  }

  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={inputId}>
        {label}
      </label>
      <div className={styles.copyRow}>
        <input
          aria-describedby={hint === undefined ? undefined : hintId}
          className={styles.copyValue}
          id={inputId}
          readOnly
          value={value}
        />
        <button className={catalog.buttonSecondary} onClick={() => void copy()} type="button">
          Copiar
        </button>
        <span aria-live="polite" className={catalog.hint}>
          {copied ? 'Copiada' : ''}
        </span>
      </div>
      {hint === undefined ? null : (
        <p className={styles.fieldHint} id={hintId}>
          {hint}
        </p>
      )}
    </div>
  );
}
