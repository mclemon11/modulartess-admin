'use client';

import { useId } from 'react';

import { SPECIFICATION_MAX_LENGTH } from '@/lib/api/variant-limits';

import styles from './catalog.module.css';
import { CountedTextarea } from './counted-field';
import {
  withTaxonomyName,
  type EnrichmentFields,
  type EnrichmentProblems,
  type SpecificationKey,
} from './enrichment';
import { FeaturesEditor } from './features-editor';

/**
 * Clasificación del producto: categoría, tipo y destacado.
 *
 * Tiene su propia sección porque los requisitos de publicación `category` y `product_type` mandan
 * aquí a quien sigue el checklist, y porque no es contenido que se lea en la ficha: es cómo se
 * ordena el catálogo.
 *
 * Todavía **no existe un catálogo independiente de categorías**: el contrato no publica ningún
 * endpoint del que sacar una lista, así que aquí no hay desplegable. Se escriben el nombre y el
 * slug; el slug se propone desde el nombre y se puede corregir antes de guardar. Inventar una
 * lista de categorías sería pintar datos que no existen.
 */
export function ClassificationFields({
  fields,
  problems,
  disabled,
  mode,
  onChange,
}: {
  readonly fields: EnrichmentFields;
  readonly problems: readonly string[];
  readonly disabled: boolean;
  /** En el alta, un campo vacío simplemente no se envía; en la edición, vaciarlo lo borra. */
  readonly mode: 'create' | 'edit';
  readonly onChange: (fields: EnrichmentFields) => void;
}) {
  const id = useId();

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
            aria-describedby={`${id}-category-slug-hint`}
            className={styles.input}
            disabled={disabled}
            id={`${id}-category-slug`}
            onChange={(event) => set('categorySlug', event.target.value)}
            placeholder="tocadores"
            type="text"
            value={fields.categorySlug}
          />
          <span className={styles.hint} id={`${id}-category-slug-hint`}>
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

      {problems.length === 0 ? null : (
        <ul className={styles.problemList}>
          {problems.map((problem) => (
            <li className={styles.fieldError} key={problem} role="alert">
              {problem}
            </li>
          ))}
        </ul>
      )}

      <p className={styles.hint}>
        {mode === 'create'
          ? 'Lo que dejes vacío no se envía: el producto se crea sin ese dato.'
          : 'Vaciar un campo lo borra del producto.'}
      </p>
    </>
  );
}

/**
 * Contenido visible: las características destacadas de la ficha.
 *
 * La descripción corta y la detallada viven en sus propias secciones del formulario porque una es
 * requisito de publicación y la otra no; aquí queda lo que la ficha pinta como franja de
 * beneficios.
 */
export function VisibleContentFields({
  fields,
  problems,
  disabled,
  onChange,
}: {
  readonly fields: EnrichmentFields;
  readonly problems: EnrichmentProblems;
  readonly disabled: boolean;
  readonly onChange: (fields: EnrichmentFields) => void;
}) {
  return (
    <FeaturesEditor
      disabled={disabled}
      features={fields.features}
      onChange={(features) => onChange({ ...fields, features })}
      problems={problems.features}
    />
  );
}

/**
 * Ayudas de los cuatro detalles adicionales.
 *
 * Cada una dice qué se espera de verdad en ese campo, no qué campo es. Son la frontera que evita
 * que la garantía acabe dentro de la descripción o que las medidas acaben siendo características.
 */
const SPECIFICATIONS: readonly {
  readonly key: SpecificationKey;
  readonly label: string;
  readonly hint: string;
}[] = [
  {
    key: 'materials',
    label: 'Materiales',
    hint: 'Composición, herrajes y acabados comprobados.',
  },
  {
    key: 'measurements',
    label: 'Medidas',
    hint: 'Ancho, alto y profundidad con unidad.',
  },
  {
    key: 'warranty',
    label: 'Garantía',
    hint: 'Duración y alcance real.',
  },
  {
    key: 'care',
    label: 'Cuidados',
    hint: 'Limpieza y mantenimiento.',
  },
];

/**
 * Detalles adicionales: materiales, medidas, garantía y cuidados.
 *
 * Los cuatro son **opcionales** para el contrato desde que el backend los retiró de
 * `publicationReadiness.missing`, así que aquí se dice «Opcional» y no se marca como error dejar
 * uno vacío. Un campo vacío viaja vacío: el `placeholder` de la pantalla es una ayuda del
 * navegador, nunca un valor guardado.
 */
export function AdditionalDetailsFields({
  fields,
  problems,
  disabled,
  mode,
  onChange,
}: {
  readonly fields: EnrichmentFields;
  readonly problems: EnrichmentProblems;
  readonly disabled: boolean;
  /** En el alta, un campo vacío simplemente no se envía; en la edición, vaciarlo lo borra. */
  readonly mode: 'create' | 'edit';
  readonly onChange: (fields: EnrichmentFields) => void;
}) {
  return (
    <>
      {SPECIFICATIONS.map(({ key, label, hint }) => (
        <CountedTextarea
          disabled={disabled}
          error={problems.specifications[key]}
          hint={hint}
          key={key}
          label={label}
          max={SPECIFICATION_MAX_LENGTH}
          onChange={(value) => onChange({ ...fields, [key]: value })}
          requirement="opcional"
          rows={3}
          value={fields[key]}
        />
      ))}

      <p className={styles.hint}>
        {mode === 'create'
          ? 'Lo que dejes vacío no se envía: el producto se crea sin ese dato.'
          : 'Vaciar un campo lo borra del producto.'}
      </p>
    </>
  );
}
