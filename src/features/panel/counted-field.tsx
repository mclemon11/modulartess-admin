'use client';

import { useId } from 'react';

import styles from './catalog.module.css';
import { counterLabel } from './product-content';

/**
 * Campo de texto con tope, contador y ayuda, todo atado a su propia etiqueta.
 *
 * Existe para que los tres formularios editoriales —descripción corta, descripción detallada y los
 * cuatro detalles adicionales— se comporten igual: mismo contador, misma forma de decir «Opcional»
 * y mismo cableado de accesibilidad.
 *
 * Sobre ese cableado:
 *
 *   - La ayuda, el contador y el error viajan en `aria-describedby`, así que un lector de pantalla
 *     los lee al entrar en el campo en lugar de dejarlos como texto suelto al lado.
 *   - El contador **no** es una región viva: anunciarlo en cada pulsación taparía lo que se está
 *     escribiendo. El error sí es `role="alert"`, porque aparece de golpe y hay que enterarse.
 *   - `maxLength` frena al llegar al tope, pero no sustituye a la validación: un texto que ya venía
 *     largo del backend —el contrato admite registros anteriores a estos topes— entra igualmente y
 *     hay que poder verlo marcado en rojo en vez de que se recorte solo.
 */
export function CountedTextarea({
  label,
  value,
  max,
  hint,
  error,
  disabled,
  requirement,
  rows,
  name,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly max: number;
  readonly hint: string;
  readonly error?: string | undefined;
  readonly disabled: boolean;
  /** Qué se dice junto a la etiqueta: lo que la publicación exige o lo que puede quedarse vacío. */
  readonly requirement: 'necesaria' | 'opcional';
  readonly rows: number;
  /** Nombre del campo cuando el formulario también se lee como `FormData`. */
  readonly name?: string | undefined;
  readonly onChange: (value: string) => void;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const counterId = `${id}-contador`;
  const errorId = `${id}-error`;
  const over = value.trim().length > max;
  const described = [hintId, counterId, error === undefined ? null : errorId]
    .filter((entry): entry is string => entry !== null)
    .join(' ');

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}{' '}
        <span className={styles.hint}>
          {requirement === 'necesaria' ? '(necesaria para publicar)' : '(Opcional)'}
        </span>
      </label>
      <textarea
        className={error === undefined && !over ? styles.textarea : styles.textareaInvalid}
        disabled={disabled}
        id={id}
        maxLength={max}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        value={value}
        {...(name === undefined ? {} : { name })}
        {...(error === undefined ? {} : { 'aria-invalid': true })}
        aria-describedby={described}
      />
      <span className={styles.hint} id={hintId}>
        {hint}
      </span>
      <span className={over ? styles.fieldError : styles.hint} id={counterId}>
        {counterLabel(value.trim().length, max)}
      </span>
      {error === undefined ? null : (
        <span className={styles.fieldError} id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
