'use client';

import { useId } from 'react';

import styles from './catalog.module.css';
import group from './commercial-section.module.css';
import {
  COMMERCIAL_LABEL_MAX_LENGTH,
  discountPercent,
  parseCompareAt,
  PREPARATION_DAYS_MAX,
  type CommercialDraft,
  type CommercialField,
  type CommercialProblems,
} from './commercial-fields';
import { formatCop } from './money';

/**
 * Precio anterior, «nuevo», promoción y preparación.
 *
 * Va debajo del precio vigente, en la misma pestaña: se leen juntos. Todo es opcional y un campo
 * vacío elimina la información. La vista previa del descuento usa la misma regla que la tienda
 * —porcentaje redondeado hacia abajo— y solo aparece con un descuento real.
 *
 * Lo que **no** hay aquí es «Envío gratis»: depende de las zonas y tarifas de envío, y se dice.
 */
export function CommercialSection({
  draft,
  onChange,
  problems,
  priceCop,
  disabled,
  sellsByVariants,
}: {
  readonly draft: CommercialDraft;
  readonly onChange: (next: CommercialDraft) => void;
  readonly problems: CommercialProblems;
  /** Precio vigente que quedará guardado, o `null` si todavía no se puede leer. */
  readonly priceCop: number | null;
  readonly disabled: boolean;
  /** Con variantes activas, el precio anterior de la base no se publica: manda cada variante. */
  readonly sellsByVariants: boolean;
}) {
  const id = useId();
  const compareAt = parseCompareAt(draft.compareAtPriceCop);
  const percent = discountPercent(priceCop, compareAt ?? null);
  const set = (field: CommercialField) => (event: { target: { value: string } }) =>
    onChange({ ...draft, [field]: event.target.value });

  return (
    <div>
      <h3 className={styles.sectionTitle}>Promoción, novedad y preparación</h3>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${id}-compare`}>
          Precio anterior <span className={styles.hint}>(opcional)</span>
        </label>
        <input
          aria-describedby={`${id}-compare-hint${problems.compareAtPriceCop ? ` ${id}-compare-error` : ''}`}
          aria-invalid={problems.compareAtPriceCop === undefined ? undefined : true}
          className={styles.input}
          disabled={disabled}
          id={`${id}-compare`}
          inputMode="numeric"
          onChange={set('compareAtPriceCop')}
          placeholder="1.690.000"
          type="text"
          value={draft.compareAtPriceCop}
        />
        <span className={styles.hint} id={`${id}-compare-hint`}>
          {sellsByVariants
            ? 'Este producto se vende por variantes: el precio anterior se define en cada variante. Este solo aplica a la opción base.'
            : 'Se muestra tachado. Tiene que ser mayor que el precio vigente; vacío quita la promoción.'}
        </span>
        {problems.compareAtPriceCop === undefined ? null : (
          <span className={styles.fieldError} id={`${id}-compare-error`}>
            {problems.compareAtPriceCop}
          </span>
        )}
      </div>

      {percent === null ||
      priceCop === null ||
      compareAt === null ||
      compareAt === undefined ? null : (
        <p className={styles.notice} aria-live="polite">
          Vista previa: <s>{formatCop(compareAt)}</s> {formatCop(priceCop)} · {percent} % de
          descuento
        </p>
      )}

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${id}-new-until`}>
            Mostrar como nuevo hasta
          </label>
          <input
            aria-describedby={`${id}-new-until-hint`}
            aria-invalid={problems.newUntil === undefined ? undefined : true}
            className={styles.input}
            disabled={disabled}
            id={`${id}-new-until`}
            onChange={set('newUntil')}
            type="datetime-local"
            value={draft.newUntil}
          />
          <span className={styles.hint} id={`${id}-new-until-hint`}>
            Hora de Colombia. Vacío: no se muestra como nuevo.
          </span>
          {problems.newUntil === undefined ? null : (
            <span className={styles.fieldError}>{problems.newUntil}</span>
          )}
        </div>
        <LabelField
          disabled={disabled}
          hint="Vacío usa la etiqueta predeterminada del catálogo."
          id={`${id}-new-label`}
          label="Etiqueta de nuevo"
          onChange={set('newLabel')}
          problem={problems.newLabel}
          value={draft.newLabel}
        />
        <LabelField
          disabled={disabled}
          hint="Solo se muestra cuando hay un descuento real."
          id={`${id}-promo-label`}
          label="Etiqueta de promoción"
          onChange={set('promotionLabel')}
          problem={problems.promotionLabel}
          value={draft.promotionLabel}
        />
      </div>

      <fieldset className={group.group} disabled={disabled}>
        <legend className={group.legend}>Preparación (días hábiles)</legend>
        <div className={styles.row}>
          <DayField
            id={`${id}-prep-min`}
            label="Mínimo"
            onChange={set('preparationMin')}
            problem={problems.preparationMin}
            value={draft.preparationMin}
          />
          <DayField
            id={`${id}-prep-max`}
            label="Máximo"
            onChange={set('preparationMax')}
            problem={problems.preparationMax}
            value={draft.preparationMax}
          />
        </div>
        <span className={styles.hint}>
          La tienda lo muestra como «Preparación estimada»: no incluye el tránsito, que depende de
          la zona de envío. Deja los dos vacíos para no mostrarlo.
        </span>
      </fieldset>

      <p className={styles.notice}>
        «Envío gratis» se administrará desde las zonas de envío y no puede declararse desde esta
        sección: solo el cálculo de envío sabe si un destino lo paga.
      </p>
    </div>
  );
}

function LabelField({
  id,
  label,
  hint,
  value,
  problem,
  disabled,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly value: string;
  readonly problem: string | undefined;
  readonly disabled: boolean;
  readonly onChange: (event: { target: { value: string } }) => void;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        aria-describedby={`${id}-hint`}
        aria-invalid={problem === undefined ? undefined : true}
        className={styles.input}
        disabled={disabled}
        id={id}
        maxLength={COMMERCIAL_LABEL_MAX_LENGTH}
        onChange={onChange}
        type="text"
        value={value}
      />
      <span className={styles.hint} id={`${id}-hint`}>
        {hint} {value.trim().length} de {COMMERCIAL_LABEL_MAX_LENGTH}.
      </span>
      {problem === undefined ? null : <span className={styles.fieldError}>{problem}</span>}
    </div>
  );
}

function DayField({
  id,
  label,
  value,
  problem,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly problem: string | undefined;
  readonly onChange: (event: { target: { value: string } }) => void;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        aria-invalid={problem === undefined ? undefined : true}
        className={styles.input}
        id={id}
        inputMode="numeric"
        max={PREPARATION_DAYS_MAX}
        min={1}
        onChange={onChange}
        type="number"
        value={value}
      />
      {problem === undefined ? null : <span className={styles.fieldError}>{problem}</span>}
    </div>
  );
}

/**
 * Precio anterior de **una variante**, con su descuento al lado.
 *
 * Es el mismo campo que el del producto, más compacto: vive dentro de cada fila de la matriz de
 * variantes, junto a su precio vigente. Vacío quita el precio anterior.
 */
export function CompareAtField({
  value,
  onChange,
  priceCop,
  disabled,
  label = 'Precio anterior',
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Precio vigente de la variante, o `null` si todavía no se puede leer. */
  readonly priceCop: number | null;
  readonly disabled: boolean;
  readonly label?: string;
}) {
  const id = useId();
  const compareAt = parseCompareAt(value);
  const problem =
    compareAt === undefined
      ? 'Pesos enteros, mayor que cero.'
      : compareAt !== null && priceCop !== null && compareAt <= priceCop
        ? 'Tiene que ser mayor que el precio vigente.'
        : null;
  const percent = discountPercent(priceCop, compareAt ?? null);

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label} <span className={styles.hint}>(opcional)</span>
      </label>
      <input
        aria-describedby={`${id}-hint`}
        aria-invalid={problem === null ? undefined : true}
        className={styles.input}
        disabled={disabled}
        id={id}
        inputMode="numeric"
        onChange={(event) => onChange(event.target.value)}
        type="text"
        value={value}
      />
      <span className={styles.hint} id={`${id}-hint`}>
        {percent === null ? 'Vacío: sin precio anterior.' : `${percent} % de descuento.`}
      </span>
      {problem === null ? null : <span className={styles.fieldError}>{problem}</span>}
    </div>
  );
}
