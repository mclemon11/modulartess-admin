'use client';

import { useId, useState } from 'react';

import styles from './catalog.module.css';
import { describeCopProblem, normaliseCopInput, parseCop } from './money';

/**
 * Campo de precio en pesos colombianos.
 *
 * No es `type="number"`: ese control no admite los puntos de miles, y en móvil su rueda cambia el
 * precio por accidente. Es texto con `inputMode="numeric"`, el símbolo `$` como adorno visual —no
 * forma parte del valor— y normalización al perder el foco: lo escrito se vuelve a pintar como
 * `1.450.000`.
 *
 * Lo que viaja al backend lo decide `parseCop`, nunca este componente: el texto formateado no sale
 * de la pantalla.
 */
export function CopField({
  label,
  value,
  disabled,
  hint,
  required,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly disabled: boolean;
  readonly hint?: string;
  readonly required?: boolean;
  readonly onChange: (value: string) => void;
}) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const parsed = parseCop(value);
  // Un campo vacío que todavía no se ha tocado no es un error: es un campo vacío.
  const problem =
    parsed.ok || (!touched && value.trim() === '') ? null : describeCopProblem(parsed.problem);
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const described = [hint === undefined ? null : hintId, problem === null ? null : errorId]
    .filter((entry): entry is string => entry !== null)
    .join(' ');

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {required === true ? ' *' : ''}
      </label>
      <div className={problem === null ? styles.copWrap : styles.copWrapInvalid}>
        <span aria-hidden="true" className={styles.copPrefix}>
          $
        </span>
        <input
          className={styles.copInput}
          disabled={disabled}
          id={id}
          inputMode="numeric"
          onBlur={() => {
            setTouched(true);
            onChange(normaliseCopInput(value));
          }}
          onChange={(event) => onChange(event.target.value)}
          placeholder="1.450.000"
          type="text"
          value={value}
          {...(required === true ? { required: true } : {})}
          {...(problem === null ? {} : { 'aria-invalid': true })}
          {...(described === '' ? {} : { 'aria-describedby': described })}
        />
      </div>
      {hint === undefined ? null : (
        <span className={styles.hint} id={hintId}>
          {hint}
        </span>
      )}
      {problem === null ? null : (
        <span className={styles.fieldError} id={errorId} role="alert">
          {problem}
        </span>
      )}
    </div>
  );
}
