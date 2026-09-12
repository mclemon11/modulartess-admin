'use client';

import { useId } from 'react';

import { ATTRIBUTE_MAX_AXES, SUGGESTED_AXES } from '@/lib/api/variant-limits';

import styles from './catalog.module.css';
import { emptyAxis, replaceAxis, setValueLabel, type AxisDraft } from './variant-draft';

/**
 * Editor de los ejes de variación del producto.
 *
 * Un eje es un par `key` + `label`: la clave estable con la que el backend identifica el eje y la
 * etiqueta que lee la persona. La lista es **abierta**: el contrato no publica ningún enum de
 * ejes, así que aquí no hay desplegable cerrado. `finish`, `size` y `mirror` se ofrecen como atajo
 * porque son los que hoy usa la tienda, y nada impide escribir otro.
 *
 * Cada eje lleva además sus valores posibles. Esos valores no viajan al backend por sí solos: son
 * el material con el que se generan las combinaciones, y cada combinación sí se envía como una
 * variante con sus atributos.
 */
export function AttributeAxesEditor({
  axes,
  disabled,
  problems,
  onChange,
  newId,
}: {
  readonly axes: readonly AxisDraft[];
  readonly disabled: boolean;
  readonly problems: readonly string[];
  readonly onChange: (axes: readonly AxisDraft[]) => void;
  readonly newId: () => string;
}) {
  const fieldId = useId();
  const atLimit = axes.length >= ATTRIBUTE_MAX_AXES;

  return (
    <div>
      <p className={styles.hint}>
        Define en qué varía el producto. Máximo {ATTRIBUTE_MAX_AXES} ejes. La clave es estable y en
        minúsculas; la etiqueta es lo que se lee. Un producto sin ejes se vende por su propio SKU,
        precio e inventario.
      </p>

      {axes.length === 0 ? (
        <p className={styles.hint}>Todavía no hay ejes declarados.</p>
      ) : (
        <ul className={styles.axisList}>
          {axes.map((axis, index) => (
            <li className={styles.axisItem} key={axis.axisId}>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor={`${fieldId}-key-${axis.axisId}`}>
                    Clave del eje {index + 1}
                  </label>
                  <input
                    className={styles.input}
                    disabled={disabled}
                    id={`${fieldId}-key-${axis.axisId}`}
                    onChange={(event) =>
                      onChange(
                        replaceAxis(axes, axis.axisId, (current) => ({
                          ...current,
                          key: event.target.value,
                        })),
                      )
                    }
                    placeholder="finish"
                    type="text"
                    value={axis.key}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor={`${fieldId}-label-${axis.axisId}`}>
                    Etiqueta visible
                  </label>
                  <input
                    className={styles.input}
                    disabled={disabled}
                    id={`${fieldId}-label-${axis.axisId}`}
                    onChange={(event) =>
                      onChange(
                        replaceAxis(axes, axis.axisId, (current) => ({
                          ...current,
                          label: event.target.value,
                        })),
                      )
                    }
                    placeholder="Acabado"
                    type="text"
                    value={axis.label}
                  />
                </div>
              </div>

              <ul className={styles.valueList}>
                {axis.values.map((value) => (
                  <li className={styles.valueItem} key={value.valueId}>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor={`${fieldId}-vl-${value.valueId}`}>
                        Valor
                      </label>
                      <input
                        className={styles.input}
                        disabled={disabled}
                        id={`${fieldId}-vl-${value.valueId}`}
                        onChange={(event) =>
                          onChange(
                            setValueLabel(axes, axis.axisId, value.valueId, event.target.value),
                          )
                        }
                        placeholder="Roble natural"
                        type="text"
                        value={value.label}
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor={`${fieldId}-vv-${value.valueId}`}>
                        Valor normalizado
                      </label>
                      <input
                        className={styles.input}
                        disabled={disabled}
                        id={`${fieldId}-vv-${value.valueId}`}
                        onChange={(event) =>
                          onChange(
                            replaceAxis(axes, axis.axisId, (current) => ({
                              ...current,
                              values: current.values.map((entry) =>
                                entry.valueId === value.valueId
                                  ? { ...entry, value: event.target.value }
                                  : entry,
                              ),
                            })),
                          )
                        }
                        placeholder="roble-natural"
                        type="text"
                        value={value.value}
                      />
                    </div>
                    <button
                      className={styles.iconButton}
                      disabled={disabled}
                      onClick={() =>
                        onChange(
                          replaceAxis(axes, axis.axisId, (current) => ({
                            ...current,
                            values: current.values.filter(
                              (entry) => entry.valueId !== value.valueId,
                            ),
                          })),
                        )
                      }
                      type="button"
                    >
                      Quitar valor
                    </button>
                  </li>
                ))}
              </ul>

              <div className={styles.imageTileActions}>
                <button
                  className={styles.iconButton}
                  disabled={disabled}
                  onClick={() =>
                    onChange(
                      replaceAxis(axes, axis.axisId, (current) => ({
                        ...current,
                        values: [...current.values, { valueId: newId(), value: '', label: '' }],
                      })),
                    )
                  }
                  type="button"
                >
                  Añadir valor
                </button>
                <button
                  className={styles.iconButton}
                  disabled={disabled}
                  onClick={() => onChange(axes.filter((entry) => entry.axisId !== axis.axisId))}
                  type="button"
                >
                  Quitar eje
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.imageTileActions}>
        <button
          className={styles.iconButton}
          disabled={disabled || atLimit}
          onClick={() => onChange([...axes, emptyAxis(newId())])}
          type="button"
        >
          Añadir eje
        </button>
        {SUGGESTED_AXES.filter((suggested) => !axes.some((axis) => axis.key === suggested.key)).map(
          (suggested) => (
            <button
              className={styles.iconButton}
              disabled={disabled || atLimit}
              key={suggested.key}
              onClick={() =>
                onChange([
                  ...axes,
                  { ...emptyAxis(newId()), key: suggested.key, label: suggested.label },
                ])
              }
              type="button"
            >
              + {suggested.label} ({suggested.key})
            </button>
          ),
        )}
      </div>

      {atLimit ? (
        <p className={styles.hint}>Has llegado al límite de {ATTRIBUTE_MAX_AXES} ejes.</p>
      ) : null}

      {problems.length === 0 ? null : (
        <ul className={styles.problemList}>
          {problems.map((problem) => (
            <li className={styles.fieldError} key={problem}>
              {problem}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
