'use client';

import { useId, useState } from 'react';

import type { AdminProductVariant, ProductAttributeDefinition } from '@/lib/api/catalog';
import { ATTRIBUTE_OPTIONS_MAX } from '@/lib/api/variant-limits';

import styles from './swatches.module.css';
import {
  activateSwatch,
  canRemoveOption,
  isLightColor,
  moveOption,
  newOption,
  pickerValue,
  removeOption,
  renameOption,
  setOptionHex,
  SWATCH_AXIS_KEYS,
  toggleOptionImage,
  type SwatchAxisDraft,
  type SwatchOptionDraft,
  type SwatchValidation,
} from './swatch-draft';

/** Imagen activa del producto, con lo necesario para elegirla. */
export type SwatchImage = {
  readonly id: string;
  readonly url: string;
  readonly altText: string;
};

/**
 * Colores y acabados del producto.
 *
 * Cada opción es un nombre visible, un color en hexadecimal —campo y selector sincronizados— y,
 * cuando el producto ya existe, las imágenes que la ilustran. El color **nunca** es la única señal:
 * cada muestra lleva su nombre escrito y una descripción para lectores de pantalla.
 *
 * - `images === null`: el producto todavía no existe. No hay imágenes con identificador real y no
 *   se ofrece asociarlas; se dice que se hará después.
 * - Una opción que usan variantes activas no se puede retirar, y se dice cuáles la usan.
 * - Retirar una opción sin uso pide confirmación en la propia tarjeta.
 */
export function SwatchAxisEditor({
  swatch,
  onChange,
  attributes,
  variants,
  images,
  disabled,
  validation,
  newId,
}: {
  readonly swatch: SwatchAxisDraft | null;
  readonly onChange: (next: SwatchAxisDraft | null) => void;
  /** Ejes que el producto ya declara. Vacío en el alta. */
  readonly attributes: readonly ProductAttributeDefinition[];
  /** Variantes del producto, para convertir un eje existente y decir quién usa cada opción. */
  readonly variants: readonly AdminProductVariant[];
  readonly images: readonly SwatchImage[] | null;
  readonly disabled: boolean;
  readonly validation: SwatchValidation;
  readonly newId: () => string;
}) {
  const fieldId = useId();
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const [customKey, setCustomKey] = useState('');
  const skuOf = new Map(variants.map((variant) => [variant.id, variant.sku] as const));

  if (swatch === null) {
    return (
      <div className={styles.empty}>
        <p className={styles.hint}>
          Este producto no tiene colores ni acabados visuales. Actívalos cuando cada color sea un
          artículo vendible, con su propio SKU, precio e inventario.
        </p>
        <fieldset className={styles.keyChoice} disabled={disabled}>
          <legend className={styles.label}>Qué eje quieres mostrar como muestras</legend>
          <div className={styles.keyButtons}>
            {SWATCH_AXIS_KEYS.map((suggested) => (
              <button
                className={styles.button}
                key={suggested.key}
                onClick={() =>
                  onChange(activateSwatch(suggested.key, suggested.label, attributes, variants))
                }
                type="button"
              >
                Activar «{suggested.label}» ({suggested.key})
              </button>
            ))}
          </div>
          <div className={styles.customKey}>
            <label className={styles.label} htmlFor={`${fieldId}-custom`}>
              U otra clave estable
            </label>
            <input
              className={styles.input}
              id={`${fieldId}-custom`}
              onChange={(event) => setCustomKey(event.target.value.trim().toLowerCase())}
              placeholder="tapizado"
              type="text"
              value={customKey}
            />
            <button
              className={styles.button}
              disabled={!/^[a-z][a-z0-9_]{0,31}$/.test(customKey)}
              onClick={() => onChange(activateSwatch(customKey, '', attributes, variants))}
              type="button"
            >
              Activar
            </button>
          </div>
          {attributes.some((axis) => axis.presentation === 'text') ? (
            <p className={styles.hint}>
              Si eliges la clave de un eje que ya existe, se convierte en muestras sin cambiar su
              clave: sus valores en uso pasan a ser opciones y solo falta darles color.
            </p>
          ) : null}
        </fieldset>
      </div>
    );
  }

  const atLimit = swatch.options.length >= ATTRIBUTE_OPTIONS_MAX;

  return (
    <div className={styles.editor}>
      <div className={styles.axisHead}>
        <div className={styles.field}>
          <span className={styles.label}>Clave estable</span>
          <code className={styles.key}>{swatch.key}</code>
          <span className={styles.hint}>
            {swatch.persistedKey
              ? 'Ya existe: no se cambia, las variantes la usan.'
              : 'Es la que guardarán las variantes. No se podrá cambiar después.'}
          </span>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${fieldId}-axis-label`}>
            Nombre visible del eje
          </label>
          <input
            className={styles.input}
            disabled={disabled}
            id={`${fieldId}-axis-label`}
            onChange={(event) => onChange({ ...swatch, label: event.target.value })}
            placeholder="Color"
            type="text"
            value={swatch.label}
          />
        </div>
        {swatch.persistedKey ? null : (
          <button
            className={styles.button}
            disabled={disabled}
            onClick={() => onChange(null)}
            type="button"
          >
            Desactivar
          </button>
        )}
      </div>

      {validation.general.length === 0 ? null : (
        <ul className={styles.problems} role="alert">
          {validation.general.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      {swatch.options.length === 0 ? (
        <p className={styles.hint}>Todavía no hay opciones. Añade la primera con su color.</p>
      ) : (
        <ol className={styles.options} aria-label={`Opciones de ${swatch.label || 'color'}`}>
          {swatch.options.map((option, index) => (
            <OptionCard
              canMoveDown={index < swatch.options.length - 1}
              canMoveUp={index > 0}
              confirmingRemoval={pendingRemoval === option.optionId}
              disabled={disabled}
              fieldId={`${fieldId}-${option.optionId}`}
              images={images}
              key={option.optionId}
              onCancelRemoval={() => setPendingRemoval(null)}
              onChange={onChange}
              onConfirmRemoval={() => {
                setPendingRemoval(null);
                onChange(removeOption(swatch, option.optionId));
              }}
              onRequestRemoval={() => setPendingRemoval(option.optionId)}
              option={option}
              position={index + 1}
              problem={validation.byOption[option.optionId] ?? null}
              skus={option.activeVariantIds.map((id) => skuOf.get(id) ?? id)}
              swatch={swatch}
            />
          ))}
        </ol>
      )}

      <div className={styles.actions}>
        <button
          className={styles.button}
          disabled={disabled || atLimit}
          onClick={() => onChange({ ...swatch, options: [...swatch.options, newOption(newId())] })}
          type="button"
        >
          Añadir opción
        </button>
        {atLimit ? (
          <span className={styles.hint}>Límite de {ATTRIBUTE_OPTIONS_MAX} opciones.</span>
        ) : null}
      </div>
    </div>
  );
}

function OptionCard({
  swatch,
  option,
  position,
  fieldId,
  images,
  disabled,
  problem,
  skus,
  canMoveUp,
  canMoveDown,
  confirmingRemoval,
  onChange,
  onRequestRemoval,
  onConfirmRemoval,
  onCancelRemoval,
}: {
  readonly swatch: SwatchAxisDraft;
  readonly option: SwatchOptionDraft;
  readonly position: number;
  readonly fieldId: string;
  readonly images: readonly SwatchImage[] | null;
  readonly disabled: boolean;
  readonly problem: string | null;
  readonly skus: readonly string[];
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly confirmingRemoval: boolean;
  readonly onChange: (next: SwatchAxisDraft) => void;
  readonly onRequestRemoval: () => void;
  readonly onConfirmRemoval: () => void;
  readonly onCancelRemoval: () => void;
}) {
  const name = option.label.trim() === '' ? `Opción ${position}` : option.label.trim();
  const light = isLightColor(option.hex);
  const removable = canRemoveOption(option);

  return (
    <li className={styles.option} data-invalid={problem === null ? undefined : 'true'}>
      <div className={styles.optionHead}>
        <span
          aria-label={`Muestra de ${name}, ${option.hex || 'sin color'}`}
          className={`${styles.swatch} ${light ? styles.swatchLight : ''}`}
          data-testid="swatch-preview"
          role="img"
          style={{ backgroundColor: pickerValue(option.hex) }}
        />
        <span className={styles.optionName}>
          {position}. {name}
        </span>
        <span className={styles.usage}>
          {skus.length === 0
            ? 'Sin variantes'
            : `${skus.length} variante${skus.length === 1 ? '' : 's'} activa${skus.length === 1 ? '' : 's'}`}
        </span>
      </div>

      <div className={styles.optionFields}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${fieldId}-label`}>
            Nombre visible
          </label>
          <input
            className={styles.input}
            disabled={disabled}
            id={`${fieldId}-label`}
            onChange={(event) =>
              onChange(renameOption(swatch, option.optionId, event.target.value))
            }
            placeholder="Roble natural"
            type="text"
            value={option.label}
          />
          <span className={styles.hint}>
            Valor estable: <code>{option.value === '' ? '—' : option.value}</code>
            {option.persisted ? ' (guardado, no cambia)' : ''}
          </span>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${fieldId}-hex`}>
            Código hexadecimal
          </label>
          <div className={styles.hexRow}>
            <input
              aria-describedby={`${fieldId}-hex-hint`}
              className={`${styles.input} ${styles.hexInput}`}
              disabled={disabled}
              id={`${fieldId}-hex`}
              inputMode="text"
              maxLength={7}
              onChange={(event) =>
                onChange(setOptionHex(swatch, option.optionId, event.target.value))
              }
              placeholder="#C8A27A"
              spellCheck={false}
              type="text"
              value={option.hex}
            />
            <input
              aria-label={`Selector de color de ${name}`}
              className={styles.picker}
              disabled={disabled}
              onChange={(event) =>
                onChange(setOptionHex(swatch, option.optionId, event.target.value))
              }
              type="color"
              value={pickerValue(option.hex)}
            />
          </div>
          <span className={styles.hint} id={`${fieldId}-hex-hint`}>
            Seis cifras, como #C8A27A. No se admiten nombres como «blanco».
          </span>
        </div>
      </div>

      {images === null ? (
        <p className={styles.hint}>
          Podrás asociar imágenes cuando el producto exista y sus imágenes estén subidas.
        </p>
      ) : images.length === 0 ? (
        <p className={styles.hint}>El producto no tiene imágenes activas que asociar.</p>
      ) : (
        <fieldset className={styles.images} disabled={disabled}>
          <legend className={styles.label}>Imágenes de {name}</legend>
          <ul className={styles.imageList}>
            {images.map((image) => {
              const checked = option.imageIds.includes(image.id);
              return (
                <li key={image.id}>
                  <label className={`${styles.imageChoice} ${checked ? styles.imageChosen : ''}`}>
                    <input
                      checked={checked}
                      onChange={() =>
                        onChange(toggleOptionImage(swatch, option.optionId, image.id))
                      }
                      type="checkbox"
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element -- miniatura del bucket público, sin optimizar a propósito */}
                    <img alt="" className={styles.thumb} src={image.url} />
                    <span className={styles.imageAlt}>
                      {image.altText || 'Imagen sin texto alternativo'}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      {skus.length === 0 ? null : (
        <p className={styles.hint}>
          La usan: {skus.join(', ')}. Para retirarla, archiva antes esas variantes.
        </p>
      )}

      {problem === null ? null : (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      )}

      <div className={styles.actions}>
        <button
          aria-label={`Subir ${name}`}
          className={styles.button}
          disabled={disabled || !canMoveUp}
          onClick={() => onChange(moveOption(swatch, option.optionId, -1))}
          type="button"
        >
          ↑ Subir
        </button>
        <button
          aria-label={`Bajar ${name}`}
          className={styles.button}
          disabled={disabled || !canMoveDown}
          onClick={() => onChange(moveOption(swatch, option.optionId, 1))}
          type="button"
        >
          ↓ Bajar
        </button>
        {confirmingRemoval ? (
          <span
            className={styles.confirm}
            role="group"
            aria-label={`Confirmar retirada de ${name}`}
          >
            <span>¿Retirar «{name}»?</span>
            <button className={styles.danger} onClick={onConfirmRemoval} type="button">
              Sí, retirar
            </button>
            <button className={styles.button} onClick={onCancelRemoval} type="button">
              Cancelar
            </button>
          </span>
        ) : (
          <button
            className={styles.button}
            disabled={disabled || !removable}
            onClick={onRequestRemoval}
            title={removable ? undefined : 'La usan variantes activas'}
            type="button"
          >
            Retirar opción
          </button>
        )}
      </div>
    </li>
  );
}
