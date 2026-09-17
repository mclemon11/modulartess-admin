'use client';

import { useId } from 'react';

import { FEATURE_MAX_LENGTH, FEATURES_MAX_ITEMS } from '@/lib/api/variant-limits';

import styles from './catalog.module.css';
import {
  addFeatureRow,
  counterLabel,
  moveFeatureRow,
  removeFeatureRow,
  setFeatureRow,
  submittedFeatures,
  type FeatureProblems,
} from './product-content';

/**
 * Editor de las características destacadas.
 *
 * Son la franja de beneficios de la ficha pública: hasta cinco frases cortas, en el orden en el que
 * se van a leer. Por eso el editor es una fila por característica con añadir, quitar y mover, y no
 * un área de texto con saltos de línea: el orden es un dato que se manipula, no un efecto de dónde
 * cayó el cursor, y cada fila necesita su propio contador y su propio error.
 *
 * Lo que viaja sigue siendo `string[]`, tal cual lo publica el contrato. Las filas vacías son filas
 * todavía sin escribir: no se envían y no se marcan como error.
 *
 * Aquí no van colores, medidas, políticas ni textos de garantía. Los colores y las medidas
 * seleccionables son variantes —cada combinación con su SKU, su precio y su inventario—, y la
 * garantía y los cuidados tienen su propio campo en «Detalles adicionales».
 */
export function FeaturesEditor({
  features,
  problems,
  disabled,
  onChange,
}: {
  readonly features: readonly string[];
  readonly problems: FeatureProblems;
  readonly disabled: boolean;
  readonly onChange: (features: readonly string[]) => void;
}) {
  const id = useId();
  const listHintId = `${id}-ayuda`;
  const countId = `${id}-cuenta`;
  const generalId = `${id}-error`;
  const written = submittedFeatures(features);
  const atLimit = features.length >= FEATURES_MAX_ITEMS;

  return (
    <div className={styles.field}>
      <p className={styles.label} id={`${id}-titulo`}>
        Características destacadas <span className={styles.hint}>(Opcional)</span>
      </p>
      <span className={styles.hint} id={listHintId}>
        Frases cortas que aparecerán en la franja de beneficios de la ficha.
      </span>
      <span className={problems.general === null ? styles.hint : styles.fieldError} id={countId}>
        {counterLabel(written.length, FEATURES_MAX_ITEMS)}
      </span>
      {problems.general === null ? null : (
        <span className={styles.fieldError} id={generalId} role="alert">
          {problems.general}
        </span>
      )}

      {features.length === 0 ? (
        <p className={styles.hint}>
          Todavía no hay características. El producto se publica igual sin ninguna.
        </p>
      ) : (
        <ul aria-labelledby={`${id}-titulo`} className={styles.featureList}>
          {features.map((feature, index) => {
            const rowId = `${id}-fila-${index}`;
            const rowCounterId = `${rowId}-contador`;
            const rowErrorId = `${rowId}-error`;
            const rowProblem = problems.byRow[index] ?? null;
            const over = feature.trim().length > FEATURE_MAX_LENGTH;

            return (
              // La posición es la identidad: mover una fila cambia el orden que se envía, y una
              // clave por contenido haría que dos filas iguales compartieran clave.
              <li className={styles.featureItem} key={index}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor={rowId}>
                    Característica {index + 1}
                  </label>
                  <input
                    aria-describedby={[
                      listHintId,
                      rowCounterId,
                      rowProblem === null ? null : rowErrorId,
                    ]
                      .filter((entry): entry is string => entry !== null)
                      .join(' ')}
                    className={rowProblem === null && !over ? styles.input : styles.inputInvalid}
                    disabled={disabled}
                    id={rowId}
                    maxLength={FEATURE_MAX_LENGTH}
                    onChange={(event) =>
                      onChange(setFeatureRow(features, index, event.target.value))
                    }
                    placeholder="Herrajes con cierre suave"
                    type="text"
                    value={feature}
                    {...(rowProblem === null ? {} : { 'aria-invalid': true })}
                  />
                  <span className={over ? styles.fieldError : styles.hint} id={rowCounterId}>
                    {counterLabel(feature.trim().length, FEATURE_MAX_LENGTH)}
                  </span>
                  {rowProblem === null ? null : (
                    <span className={styles.fieldError} id={rowErrorId} role="alert">
                      {rowProblem}
                    </span>
                  )}
                </div>
                <div className={styles.imageTileActions}>
                  <button
                    className={styles.iconButton}
                    disabled={disabled || index === 0}
                    onClick={() => onChange(moveFeatureRow(features, index, -1))}
                    type="button"
                  >
                    Subir
                  </button>
                  <button
                    className={styles.iconButton}
                    disabled={disabled || index === features.length - 1}
                    onClick={() => onChange(moveFeatureRow(features, index, 1))}
                    type="button"
                  >
                    Bajar
                  </button>
                  <button
                    className={styles.iconButton}
                    disabled={disabled}
                    onClick={() => onChange(removeFeatureRow(features, index))}
                    type="button"
                  >
                    Quitar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className={styles.imageTileActions}>
        <button
          className={styles.iconButton}
          disabled={disabled || atLimit}
          onClick={() => onChange(addFeatureRow(features))}
          type="button"
        >
          Añadir característica
        </button>
      </div>

      {atLimit ? (
        <p className={styles.hint}>
          Has llegado al límite de {FEATURES_MAX_ITEMS} características.
        </p>
      ) : null}

      {written.length === 0 ? null : (
        <div className={styles.featurePreview}>
          <p className={styles.hint}>Así se leerán, en este orden:</p>
          <ul className={styles.featureStrip}>
            {written.map((feature, index) => (
              <li key={index}>{feature}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
