'use client';

import { useId } from 'react';

import styles from './catalog.module.css';
import {
  AVAILABILITY_OPTIONS,
  INVENTORY_MODES,
  INVENTORY_QUANTITY_MAX,
  describeAvailability,
  describeInventoryMode,
  describeInventoryProblem,
  inventoryModeHint,
  inventoryProblems,
  type InventoryDraft,
  type InventoryMode,
} from './inventory-control';

/**
 * Los campos del inventario, una sola vez.
 *
 * Los usan el alta del producto, cada borrador de variante, la tarjeta del detalle y el editor de
 * una variante existente. Escribirlos cuatro veces era la forma segura de que en alguna de las
 * cuatro acabara viajando un `quantity` en modo disponibilidad.
 *
 * El componente **no envía nada**: recibe un borrador y devuelve otro. Quién llama, con qué
 * versión y con qué clave de idempotencia es decisión de cada pantalla.
 *
 * La elección de modo son dos `radio` de verdad, no dos botones que parecen radios: el lector de
 * pantalla anuncia «opción 1 de 2», las flechas mueven entre ellas y el `fieldset` les da un
 * nombre común. Un `<select>` habría escondido la explicación de cada modo justo cuando hay que
 * decidir.
 */
export function InventoryFields({
  draft,
  onChange,
  disabled = false,
  legend = 'Cómo controlar el inventario',
  showProblems = true,
}: {
  readonly draft: InventoryDraft;
  readonly onChange: (next: InventoryDraft) => void;
  readonly disabled?: boolean;
  readonly legend?: string;
  /** El alta valida al enviar; el detalle, mientras se escribe. */
  readonly showProblems?: boolean;
}) {
  const fieldId = useId();
  const problems = showProblems ? inventoryProblems(draft) : [];
  const quantityProblem = problems.find((problem) => problem.startsWith('quantity_'));
  const thresholdProblem = problems.find((problem) => problem.startsWith('threshold_'));

  return (
    <div className={styles.inventoryFields}>
      <fieldset className={styles.modeFieldset}>
        <legend className={styles.modeLegend}>{legend}</legend>
        <div className={styles.modeOptions}>
          {INVENTORY_MODES.map((mode) => (
            <ModeOption
              checked={draft.mode === mode}
              disabled={disabled}
              key={mode}
              mode={mode}
              name={`${fieldId}-mode`}
              onSelect={() => onChange({ ...draft, mode })}
            />
          ))}
        </div>
      </fieldset>

      {draft.mode === 'tracked' ? (
        <div className={styles.inventoryRow}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${fieldId}-quantity`}>
              Cantidad disponible
            </label>
            <input
              aria-describedby={`${fieldId}-quantity-hint`}
              aria-invalid={quantityProblem === undefined ? undefined : true}
              className={quantityProblem === undefined ? styles.input : styles.inputInvalid}
              disabled={disabled}
              id={`${fieldId}-quantity`}
              inputMode="numeric"
              max={INVENTORY_QUANTITY_MAX}
              min={0}
              onChange={(event) => onChange({ ...draft, quantity: event.target.value })}
              step={1}
              type="number"
              value={draft.quantity}
            />
            {/*
              Es el total, no una diferencia. Se dice aquí porque la experiencia anterior pedía
              justo lo contrario y quien ya la usó llega con esa costumbre.
            */}
            <p className={styles.hint} id={`${fieldId}-quantity-hint`}>
              Escribe cuántas unidades hay en total, no cuántas entraron o salieron. Para dejarlo
              agotado, escribe 0.
            </p>
            {quantityProblem === undefined ? null : (
              <p className={styles.fieldError} role="alert">
                {describeInventoryProblem(quantityProblem)}
              </p>
            )}
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${fieldId}-threshold`}>
              Umbral de stock bajo
            </label>
            <input
              aria-describedby={`${fieldId}-threshold-hint`}
              aria-invalid={thresholdProblem === undefined ? undefined : true}
              className={thresholdProblem === undefined ? styles.input : styles.inputInvalid}
              disabled={disabled}
              id={`${fieldId}-threshold`}
              inputMode="numeric"
              min={0}
              onChange={(event) => onChange({ ...draft, lowStockThreshold: event.target.value })}
              step={1}
              type="number"
              value={draft.lowStockThreshold}
            />
            <p className={styles.hint} id={`${fieldId}-threshold-hint`}>
              Avisamos cuando queden esas unidades o menos. Con 0 no avisamos.
            </p>
            {thresholdProblem === undefined ? null : (
              <p className={styles.fieldError} role="alert">
                {describeInventoryProblem(thresholdProblem)}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${fieldId}-status`}>
            Estado
          </label>
          <select
            aria-describedby={`${fieldId}-status-hint`}
            className={styles.input}
            disabled={disabled}
            id={`${fieldId}-status`}
            onChange={(event) =>
              onChange({
                ...draft,
                // El valor sale de la lista del contrato; el `find` evita confiar en el `value`.
                status:
                  AVAILABILITY_OPTIONS.find((option) => option === event.target.value) ??
                  draft.status,
              })
            }
            value={draft.status}
          >
            {AVAILABILITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {describeAvailability(option)}
              </option>
            ))}
          </select>
          <p className={styles.hint} id={`${fieldId}-status-hint`}>
            En este modo no se guarda ninguna cantidad. El estado se cambia a mano cuando haga
            falta.
          </p>
        </div>
      )}
    </div>
  );
}

function ModeOption({
  mode,
  name,
  checked,
  disabled,
  onSelect,
}: {
  readonly mode: InventoryMode;
  readonly name: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <label className={checked ? styles.modeOptionChecked : styles.modeOption}>
      <input
        checked={checked}
        className={styles.modeRadio}
        disabled={disabled}
        name={name}
        onChange={onSelect}
        type="radio"
        value={mode}
      />
      <span className={styles.modeOptionBody}>
        <span className={styles.modeOptionTitle}>{describeInventoryMode(mode)}</span>
        <span className={styles.modeOptionHint}>{inventoryModeHint(mode)}</span>
      </span>
    </label>
  );
}
