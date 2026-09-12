'use client';

import { useId } from 'react';

import { FEATURES_MAX_ITEMS, SPECIFICATION_MAX_LENGTH } from '@/lib/api/variant-limits';

import styles from './catalog.module.css';
import { featureList, withTaxonomyName, type EnrichmentFields } from './enrichment';

/**
 * Clasificación y contenido enriquecido, compartidos por el alta y la edición.
 *
 * Todavía **no existe un catálogo independiente de categorías**: el contrato no publica ningún
 * endpoint del que sacar una lista, así que aquí no hay desplegable. Se escriben el nombre y el
 * slug; el slug se propone desde el nombre y se puede corregir antes de guardar. Inventar una
 * lista de categorías sería pintar datos que no existen.
 */
export function EnrichmentFieldset({
  fields,
  disabled,
  mode,
  onChange,
}: {
  readonly fields: EnrichmentFields;
  readonly disabled: boolean;
  /** En el alta, un campo vacío simplemente no se envía; en la edición, vaciarlo lo borra. */
  readonly mode: 'create' | 'edit';
  readonly onChange: (fields: EnrichmentFields) => void;
}) {
  const id = useId();
  const features = featureList(fields.features);

  function set(key: keyof EnrichmentFields, value: string | boolean) {
    onChange({ ...fields, [key]: value });
  }

  return (
    <>
      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${id}-category-name`}>
            Categoría
          </label>
          <input
            className={styles.input}
            disabled={disabled}
            id={`${id}-category-name`}
            onChange={(event) => onChange(withTaxonomyName(fields, 'category', event.target.value))}
            placeholder="Tocadores"
            type="text"
            value={fields.categoryName}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${id}-category-slug`}>
            Slug de la categoría
          </label>
          <input
            className={styles.input}
            disabled={disabled}
            id={`${id}-category-slug`}
            onChange={(event) => set('categorySlug', event.target.value)}
            placeholder="tocadores"
            type="text"
            value={fields.categorySlug}
          />
          <span className={styles.hint}>
            Se propone desde el nombre y se puede corregir. El backend valida la forma.
          </span>
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${id}-type-name`}>
            Tipo de producto
          </label>
          <input
            className={styles.input}
            disabled={disabled}
            id={`${id}-type-name`}
            onChange={(event) =>
              onChange(withTaxonomyName(fields, 'productType', event.target.value))
            }
            type="text"
            value={fields.productTypeName}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${id}-type-slug`}>
            Slug del tipo
          </label>
          <input
            className={styles.input}
            disabled={disabled}
            id={`${id}-type-slug`}
            onChange={(event) => set('productTypeSlug', event.target.value)}
            type="text"
            value={fields.productTypeSlug}
          />
        </div>
      </div>

      <div className={styles.checkboxField}>
        <input
          checked={fields.featured}
          className={styles.checkbox}
          disabled={disabled}
          id={`${id}-featured`}
          onChange={(event) => set('featured', event.target.checked)}
          type="checkbox"
        />
        <label className={styles.label} htmlFor={`${id}-featured`}>
          Destacado en la tienda
        </label>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${id}-features`}>
          Características
        </label>
        <textarea
          className={styles.textarea}
          disabled={disabled}
          id={`${id}-features`}
          onChange={(event) => set('features', event.target.value)}
          value={fields.features}
        />
        <span
          className={features.length > FEATURES_MAX_ITEMS ? styles.fieldError : styles.hint}
          role={features.length > FEATURES_MAX_ITEMS ? 'alert' : undefined}
        >
          Una por línea. {features.length} de {FEATURES_MAX_ITEMS} como máximo.
        </span>
      </div>

      {(
        [
          ['materials', 'Materiales'],
          ['measurements', 'Medidas'],
          ['warranty', 'Garantía'],
          ['care', 'Cuidados'],
        ] as const
      ).map(([key, label]) => (
        <div className={styles.field} key={key}>
          <label className={styles.label} htmlFor={`${id}-${key}`}>
            {label}
          </label>
          <textarea
            className={styles.textarea}
            disabled={disabled}
            id={`${id}-${key}`}
            maxLength={SPECIFICATION_MAX_LENGTH}
            onChange={(event) => set(key, event.target.value)}
            value={fields[key]}
          />
        </div>
      ))}

      <p className={styles.hint}>
        {mode === 'create'
          ? 'Lo que dejes vacío no se envía: el producto se crea sin ese dato.'
          : 'Vaciar un campo lo borra del producto.'}
      </p>
    </>
  );
}
