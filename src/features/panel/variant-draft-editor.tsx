'use client';

import { useId } from 'react';

import { VARIANT_MAX_ACTIVE } from '@/lib/api/variant-limits';

import styles from './catalog.module.css';
import { CopField } from './cop-field';
import type { AxisDraft, VariantDraft, VariantValidation } from './variant-draft';

/**
 * Editor de las variantes que todavía no se han enviado.
 *
 * Generar combinaciones es un atajo, no una obligación: se pueden añadir a mano, quitar las que no
 * se vendan y corregir cualquiera antes de enviarla. Cada fila lleva los **ejes declarados por el
 * producto**, ni uno más ni uno menos, porque es lo que exige el contrato.
 *
 * Las variantes creadas ya no aparecen aquí: se gestionan sobre el producto, donde cada cambio es
 * una llamada al backend. Mantenerlas en esta lista haría creer que se pueden reeditar en local.
 */
export function VariantDraftEditor({
  axes,
  drafts,
  validation,
  disabled,
  activeCount,
  lockedDraftIds,
  onChange,
  onGenerate,
  onAdd,
}: {
  readonly axes: readonly AxisDraft[];
  readonly drafts: readonly VariantDraft[];
  readonly validation: VariantValidation;
  readonly disabled: boolean;
  /** Variantes activas que ya existen en el backend. Cuentan para el límite. */
  readonly activeCount: number;
  /**
   * Borradores que ya se crearon en el backend.
   *
   * Se siguen viendo para que el resumen cuadre, pero no se editan ni se quitan: existen de
   * verdad, y un reintento no los reenvía. Se gestionan desde el detalle del producto.
   */
  readonly lockedDraftIds: readonly string[];
  readonly onChange: (drafts: readonly VariantDraft[]) => void;
  readonly onGenerate: () => void;
  readonly onAdd: () => void;
}) {
  const fieldId = useId();
  const declared = axes.filter((axis) => axis.key.trim().length > 0);
  // Generar sin valores no produciría ninguna combinación: el botón lo dice antes de pulsarlo.
  const canGenerate = declared.some((axis) =>
    axis.values.some((value) => value.value.trim().length > 0),
  );
  const total = activeCount + drafts.length;
  const atLimit = total >= VARIANT_MAX_ACTIVE;

  function update(draftId: string, change: (draft: VariantDraft) => VariantDraft) {
    onChange(drafts.map((draft) => (draft.draftId === draftId ? change(draft) : draft)));
  }

  return (
    <div>
      <div className={styles.imageTileActions}>
        <button
          className={styles.iconButton}
          disabled={disabled || !canGenerate || atLimit}
          onClick={onGenerate}
          type="button"
        >
          Generar combinaciones
        </button>
        <button
          className={styles.iconButton}
          disabled={disabled || declared.length === 0 || atLimit}
          onClick={onAdd}
          type="button"
        >
          Añadir variante
        </button>
      </div>

      {declared.length > 0 && !canGenerate ? (
        <p className={styles.hint}>
          Añade valores a los ejes para poder generar sus combinaciones.
        </p>
      ) : null}

      <p className={styles.hint}>
        {total} de {VARIANT_MAX_ACTIVE} variantes activas
        {activeCount > 0 ? ` (${activeCount} ya creadas)` : ''}.
        {atLimit ? ' Has llegado al límite: archiva alguna para crear otra.' : ''}
      </p>

      {validation.general.length === 0 ? null : (
        <ul className={styles.problemList}>
          {validation.general.map((problem) => (
            <li className={styles.fieldError} key={problem}>
              {problem}
            </li>
          ))}
        </ul>
      )}

      {drafts.length === 0 ? (
        <p className={styles.hint}>
          Sin variantes preparadas. El producto se venderá por su SKU, precio e inventario base.
        </p>
      ) : (
        <ul className={styles.variantList}>
          {drafts.map((draft) => {
            const problem = validation.byDraft[draft.draftId];
            const locked = lockedDraftIds.includes(draft.draftId);

            if (locked) {
              return (
                <li className={styles.variantItemDone} key={draft.draftId}>
                  <p className={styles.variantSummary}>
                    <strong>{draft.sku}</strong> ·{' '}
                    {draft.attributes
                      .map((attribute) => `${attribute.key}: ${attribute.value}`)
                      .join(' · ')}
                  </p>
                  <p className={styles.hint}>
                    Ya creada en el producto. Para cambiarla, ábrelo y edítala desde su detalle.
                  </p>
                </li>
              );
            }

            return (
              <li
                className={problem === undefined ? styles.variantItem : styles.variantItemInvalid}
                key={draft.draftId}
              >
                <div className={styles.row}>
                  {draft.attributes.map((attribute) => (
                    <div className={styles.field} key={attribute.key}>
                      <label
                        className={styles.label}
                        htmlFor={`${fieldId}-${draft.draftId}-${attribute.key}`}
                      >
                        {axisLabel(axes, attribute.key)}
                      </label>
                      <input
                        className={styles.input}
                        disabled={disabled}
                        id={`${fieldId}-${draft.draftId}-${attribute.key}`}
                        onChange={(event) =>
                          update(draft.draftId, (current) => ({
                            ...current,
                            attributes: current.attributes.map((entry) =>
                              entry.key === attribute.key
                                ? {
                                    ...entry,
                                    value: event.target.value,
                                    // La etiqueta es lo que lee quien compra: solo se rellena sola
                                    // cuando todavía no hay ninguna.
                                    label: entry.label === '' ? event.target.value : entry.label,
                                  }
                                : entry,
                            ),
                          }))
                        }
                        type="text"
                        value={attribute.value}
                      />
                      <span className={styles.hint}>
                        {attribute.label === '' ? 'Valor normalizado.' : attribute.label}
                      </span>
                    </div>
                  ))}
                </div>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor={`${fieldId}-${draft.draftId}-sku`}>
                      SKU de la variante
                    </label>
                    <input
                      className={styles.input}
                      disabled={disabled}
                      id={`${fieldId}-${draft.draftId}-sku`}
                      onChange={(event) =>
                        update(draft.draftId, (current) => ({
                          ...current,
                          sku: event.target.value.toUpperCase(),
                        }))
                      }
                      type="text"
                      value={draft.sku}
                    />
                  </div>
                  {/* Mismo campo y mismo conversor que el precio del producto: prefijo `$`, miles
                      con punto y entero al backend. */}
                  <CopField
                    disabled={disabled}
                    hint="Pesos enteros, mayor que cero."
                    label="Precio de la variante"
                    onChange={(value) =>
                      update(draft.draftId, (current) => ({ ...current, priceCop: value }))
                    }
                    required
                    value={draft.priceCop}
                  />
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor={`${fieldId}-${draft.draftId}-stock`}>
                      Inventario inicial
                    </label>
                    <input
                      className={styles.input}
                      disabled={disabled}
                      id={`${fieldId}-${draft.draftId}-stock`}
                      min={0}
                      onChange={(event) =>
                        update(draft.draftId, (current) => ({
                          ...current,
                          stockQuantity: event.target.value,
                        }))
                      }
                      type="number"
                      value={draft.stockQuantity}
                    />
                  </div>
                </div>
                <div className={styles.imageTileActions}>
                  <button
                    className={styles.iconButton}
                    disabled={disabled}
                    onClick={() =>
                      onChange(drafts.filter((entry) => entry.draftId !== draft.draftId))
                    }
                    type="button"
                  >
                    Quitar variante
                  </button>
                </div>
                {problem === undefined ? null : (
                  <p className={styles.fieldError} role="alert">
                    {problem}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Etiqueta del eje tal y como se declaró; si no la hay, la clave, que siempre existe. */
function axisLabel(axes: readonly AxisDraft[], key: string): string {
  const axis = axes.find((entry) => entry.key.trim() === key);

  return axis === undefined || axis.label.trim() === '' ? key : axis.label.trim();
}
