'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';

import catalog from '@/features/panel/catalog.module.css';
import type { ShippingRule, ShippingRuleScope, ShippingZone } from '@/lib/api/shipping';

import { FailureNotice } from './failure-notice';
import {
  draftFromRate,
  EMPTY_RATE_DRAFT,
  illustrateRate,
  NAME_MAX,
  parseTransit,
  RATE_FIELD_LABELS,
  RATE_FIELDS,
  rateFromDraft,
  type RateDraft,
  type RateErrors,
} from './rate-draft';
import { archiveRule, createRule, updateRule } from './shipping-client';
import {
  describeRate,
  describeTransit,
  RATE_TYPE_HINTS,
  RATE_TYPE_LABELS,
  RATE_TYPES,
  SCOPE_LABELS,
} from './shipping-labels';
import styles from './shipping.module.css';
import { useExclusive } from './use-exclusive';
import { stepHref } from './zone-form-model';

type Failure = { readonly code: string; readonly reference?: string | undefined } | null;

/**
 * Cómo se combinan las reglas, con las palabras del contrato y del ADR 0025 del backend.
 *
 * Se muestra junto a la tarifa porque es lo que decide cuánto paga alguien con varias líneas en el
 * carrito. El panel no lo calcula: lo explica, y la vista previa lo enseña con datos reales.
 */
export function CombinationHelp() {
  return (
    <details className={styles.infoBox}>
      <summary>Cómo se combina esta tarifa con otras reglas</summary>
      <ul>
        <li>
          Cada línea del pedido recibe <strong>una sola</strong> regla: la de la zona que cubre el
          destino al nivel más específico (municipio, después departamento, después nacional) y,
          dentro del mismo nivel, la de mayor prioridad.
        </li>
        <li>
          Dentro de una zona gana la regla más específica para el producto: la asignada al producto,
          después la de su categoría y por último la de todos los productos.
        </li>
        <li>
          Las líneas que ganan la misma regla se cobran juntas sobre la suma de sus unidades: una
          tarifa fija por pedido se cobra una vez; reglas distintas se suman.
        </li>
        <li>
          El envío es gratis solo si todas las líneas ganan una regla gratuita. Si una línea es de
          cotización manual, el pedido entero lo es; si una no tiene envío, el pedido no lo tiene.
        </li>
        <li>Un empate o un destino sin cobertura nunca se convierte en costo cero.</li>
      </ul>
    </details>
  );
}

export function RulesEditor({
  zone,
  rules,
  readOnly,
}: {
  readonly zone: ShippingZone;
  readonly rules: readonly ShippingRule[];
  readonly readOnly: boolean;
}) {
  const id = useId();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(rules.length === 0 && !readOnly);
  const active = rules.filter((rule) => rule.status === 'active');
  const archived = rules.filter((rule) => rule.status === 'archived');
  const hasAll = active.some((rule) => rule.scope === 'all');

  return (
    <section aria-labelledby={`${id}-title`} className={`${catalog.card} ${catalog.cardPad}`}>
      <h2 className={catalog.sectionTitle} id={`${id}-title`}>
        Tarifas
      </h2>
      <p className={catalog.hint}>
        Cada regla tiene una tarifa y un alcance: todos los productos, categorías seleccionadas o
        productos concretos. Las categorías y productos de cada regla se eligen en el paso
        «Productos». Solo enteros en pesos colombianos.
      </p>
      <CombinationHelp />

      {active.length === 0 ? (
        <p className={catalog.notice}>
          La zona no tiene reglas activas: no se podrá activar hasta tener al menos una.
        </p>
      ) : (
        <ul className={styles.ruleList}>
          {active.map((rule) =>
            editing === rule.id ? (
              <li key={rule.id}>
                <RuleForm hasAll={hasAll} onDone={() => setEditing(null)} rule={rule} zone={zone} />
              </li>
            ) : (
              <RuleItem
                key={rule.id}
                onEdit={() => setEditing(rule.id)}
                readOnly={readOnly}
                rule={rule}
              />
            ),
          )}
        </ul>
      )}

      {archived.length > 0 ? (
        <details>
          <summary>Reglas archivadas ({archived.length})</summary>
          <ul className={styles.ruleList}>
            {archived.map((rule) => (
              <RuleItem key={rule.id} onEdit={() => undefined} readOnly rule={rule} />
            ))}
          </ul>
        </details>
      ) : null}

      {readOnly ? null : creating ? (
        <RuleForm hasAll={hasAll} onDone={() => setCreating(false)} rule={null} zone={zone} />
      ) : (
        <button className={catalog.buttonSecondary} onClick={() => setCreating(true)} type="button">
          <span aria-hidden="true">+</span> Nueva regla
        </button>
      )}

      <div className={styles.stepNav}>
        <Link className={catalog.buttonSecondary} href={stepHref(zone.id, 'cobertura')}>
          Volver a cobertura
        </Link>
        <Link className={catalog.buttonPrimary} href={stepHref(zone.id, 'productos')}>
          Seguir a productos
        </Link>
      </div>
    </section>
  );
}

function RuleItem({
  rule,
  readOnly,
  onEdit,
}: {
  readonly rule: ShippingRule;
  readonly readOnly: boolean;
  readonly onEdit: () => void;
}) {
  const transit = describeTransit(rule.transitDaysMin, rule.transitDaysMax);

  return (
    <li className={rule.status === 'active' ? styles.ruleItem : styles.ruleItemArchived}>
      <span className={styles.ruleText}>
        <span className={styles.cellMain}>
          {rule.name}
          {rule.status === 'archived' ? ' (archivada)' : ''}
        </span>
        <span>{describeRate(rule.rate)}</span>
        <span className={styles.cellSub}>
          {SCOPE_LABELS[rule.scope]}
          {rule.scope === 'all'
            ? ''
            : ` · ${rule.targetCount} asignad${rule.scope === 'categories' ? 'a' : 'o'}${
                rule.targetCount === 1 ? '' : 's'
              }`}
          {transit === null ? '' : ` · Tránsito: ${transit}`} · v{rule.version}
        </span>
      </span>
      {readOnly || rule.status !== 'active' ? null : (
        <span className={styles.rowActions}>
          <button className={catalog.rowAction} onClick={onEdit} type="button">
            Editar
          </button>
          <ArchiveRuleButton rule={rule} />
        </span>
      )}
    </li>
  );
}

function ArchiveRuleButton({ rule }: { readonly rule: ShippingRule }) {
  const router = useRouter();
  const id = useId();
  const dialog = useRef<HTMLDialogElement | null>(null);
  const { busy, run } = useExclusive();
  const [failure, setFailure] = useState<Failure>(null);

  async function confirm() {
    const result = await run(() => archiveRule(rule.id, rule.version));

    if (result === null) return;
    if (!result.ok) {
      setFailure({ code: result.code, reference: result.reference });

      return;
    }

    dialog.current?.close();
    router.refresh();
  }

  return (
    <>
      <button
        className={catalog.rowAction}
        onClick={() => {
          setFailure(null);
          dialog.current?.showModal();
        }}
        type="button"
      >
        Archivar
      </button>
      <dialog
        aria-describedby={`${id}-text`}
        aria-labelledby={`${id}-title`}
        className={catalog.previewDialog}
        ref={dialog}
      >
        <div className={catalog.previewDialogBody}>
          <h2 className={catalog.sectionTitle} id={`${id}-title`}>
            ¿Archivar la regla «{rule.name}»?
          </h2>
          <p className={catalog.pageLead} id={`${id}-text`}>
            Es definitivo. Los productos que dependían de ella recibirán otra regla de la zona, si
            la hay, o lo que la zona indique para productos sin regla: cotización manual o no
            disponible, nunca gratis.
          </p>
          {failure === null ? null : (
            <FailureNotice code={failure.code} reference={failure.reference} />
          )}
          <div className={catalog.actions}>
            <button
              className={catalog.buttonDanger}
              disabled={busy}
              onClick={() => void confirm()}
              type="button"
            >
              {busy ? 'Archivando…' : 'Archivar regla'}
            </button>
            <button
              autoFocus
              className={catalog.buttonSecondary}
              disabled={busy}
              onClick={() => dialog.current?.close()}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

/** Formulario de una regla: alta (con alcance) o edición (el alcance es inmutable). */
export function RuleForm({
  zone,
  rule,
  hasAll,
  onDone,
}: {
  readonly zone: ShippingZone;
  readonly rule: ShippingRule | null;
  readonly hasAll: boolean;
  readonly onDone: () => void;
}) {
  const router = useRouter();
  const id = useId();
  const { busy, run } = useExclusive();
  const [name, setName] = useState(rule?.name ?? '');
  const [scope, setScope] = useState<ShippingRuleScope | ''>(rule?.scope ?? '');
  const [rate, setRate] = useState<RateDraft>(
    rule === null ? EMPTY_RATE_DRAFT : draftFromRate(rule.rate),
  );
  const [transitMin, setTransitMin] = useState(
    rule?.transitDaysMin === null || rule === null ? '' : String(rule.transitDaysMin),
  );
  const [transitMax, setTransitMax] = useState(
    rule?.transitDaysMax === null || rule === null ? '' : String(rule.transitDaysMax),
  );
  const [errors, setErrors] = useState<
    RateErrors & { name?: string; scope?: string; transit?: string }
  >({});
  const [failure, setFailure] = useState<Failure>(null);
  const preview = rateFromDraft(rate);

  async function save() {
    const parsedRate = rateFromDraft(rate);
    const transit = parseTransit(transitMin, transitMax);
    const next: typeof errors = parsedRate.ok ? {} : { ...parsedRate.errors };

    if (name.trim().length === 0) next.name = 'Escribe el nombre de la regla.';
    if (rule === null && scope === '') next.scope = 'Elige a qué productos se aplica.';
    if (!transit.ok) next.transit = transit.error;

    setErrors(next);

    if (Object.keys(next).length > 0 || !parsedRate.ok || !transit.ok) return;

    setFailure(null);

    const result = await run(() =>
      rule === null
        ? createRule(zone.id, {
            name: name.trim(),
            scope: scope as ShippingRuleScope,
            rate: parsedRate.rate,
            transitDaysMin: transit.min,
            transitDaysMax: transit.max,
          })
        : updateRule(rule.id, {
            expectedVersion: rule.version,
            name: name.trim(),
            rate: parsedRate.rate,
            transitDaysMin: transit.min,
            transitDaysMax: transit.max,
          }),
    );

    if (result === null) return;
    if (!result.ok) {
      setFailure({ code: result.code, reference: result.reference });

      return;
    }

    onDone();
    router.refresh();
  }

  return (
    <form
      aria-labelledby={`${id}-title`}
      className={styles.compareBox}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h3 className={catalog.subTitle} id={`${id}-title`}>
        {rule === null ? 'Nueva regla' : `Editar «${rule.name}»`}
      </h3>

      <div className={catalog.field}>
        <label className={catalog.label} htmlFor={`${id}-name`}>
          Nombre de la regla
        </label>
        <input
          aria-describedby={errors.name === undefined ? undefined : `${id}-name-error`}
          aria-invalid={errors.name === undefined ? undefined : true}
          className={catalog.input}
          id={`${id}-name`}
          maxLength={NAME_MAX}
          onChange={(event) => setName(event.target.value)}
          value={name}
        />
        {errors.name === undefined ? null : (
          <span className={catalog.fieldError} id={`${id}-name-error`}>
            {errors.name}
          </span>
        )}
      </div>

      {rule === null ? (
        <fieldset
          aria-describedby={errors.scope === undefined ? undefined : `${id}-scope-error`}
          className={styles.choices}
        >
          <legend>Productos a los que se aplica</legend>
          {(['all', 'categories', 'products'] as const).map((value) => (
            <label className={styles.choice} key={value}>
              <input
                checked={scope === value}
                disabled={value === 'all' && hasAll}
                name={`${id}-scope`}
                onChange={() => setScope(value)}
                type="radio"
              />
              <span className={styles.choiceText}>
                <span className={styles.choiceTitle}>{SCOPE_LABELS[value]}</span>
                <span className={styles.choiceHint}>
                  {value === 'all'
                    ? hasAll
                      ? 'Ya hay una regla activa para todos los productos en esta zona.'
                      : 'Una sola por zona.'
                    : value === 'categories'
                      ? 'Las categorías se eligen en el paso «Productos».'
                      : 'Los productos se eligen en el paso «Productos».'}
                </span>
              </span>
            </label>
          ))}
          {errors.scope === undefined ? null : (
            <span className={catalog.fieldError} id={`${id}-scope-error`}>
              {errors.scope}
            </span>
          )}
          <p className={catalog.hint}>El alcance no se puede cambiar después de crear la regla.</p>
        </fieldset>
      ) : (
        <p className={catalog.hint}>
          Alcance: {SCOPE_LABELS[rule.scope]}. No se puede cambiar; para otro alcance, crea otra
          regla.
        </p>
      )}

      <fieldset
        aria-describedby={errors.type === undefined ? undefined : `${id}-type-error`}
        className={styles.choices}
      >
        <legend>Tipo de tarifa</legend>
        {RATE_TYPES.map((type) => (
          <label className={styles.choice} key={type}>
            <input
              checked={rate.type === type}
              name={`${id}-type`}
              onChange={() => setRate((current) => ({ ...current, type }))}
              type="radio"
            />
            <span className={styles.choiceText}>
              <span className={styles.choiceTitle}>{RATE_TYPE_LABELS[type]}</span>
              <span className={styles.choiceHint}>{RATE_TYPE_HINTS[type]}</span>
            </span>
          </label>
        ))}
        {errors.type === undefined ? null : (
          <span className={catalog.fieldError} id={`${id}-type-error`}>
            {errors.type}
          </span>
        )}
      </fieldset>

      {rate.type === '' ? null : (
        <div className={styles.formRow}>
          {RATE_FIELDS[rate.type].map((field) => (
            <div className={catalog.field} key={field}>
              <label className={catalog.label} htmlFor={`${id}-${field}`}>
                {RATE_FIELD_LABELS[field]}
              </label>
              <div
                className={errors[field] === undefined ? catalog.copWrap : catalog.copWrapInvalid}
              >
                <span aria-hidden="true" className={catalog.copPrefix}>
                  $
                </span>
                <input
                  aria-describedby={`${id}-${field}-hint${errors[field] === undefined ? '' : ` ${id}-${field}-error`}`}
                  aria-invalid={errors[field] === undefined ? undefined : true}
                  className={catalog.copInput}
                  id={`${id}-${field}`}
                  inputMode="numeric"
                  onChange={(event) =>
                    setRate((current) => ({ ...current, [field]: event.target.value }))
                  }
                  value={rate[field]}
                />
              </div>
              {errors[field] === undefined ? null : (
                <span className={catalog.fieldError} id={`${id}-${field}-error`}>
                  {errors[field]}
                </span>
              )}
              <span className={catalog.hint} id={`${id}-${field}-hint`}>
                Entero en pesos, sin centavos. Ejemplo: 12.000
              </span>
            </div>
          ))}
          {RATE_FIELDS[rate.type].length === 0 ? (
            <p className={catalog.hint}>
              {rate.type === 'free'
                ? 'Costo de envío: $ 0, declarado de forma explícita.'
                : 'Sin monto: el envío se cotiza a mano.'}
            </p>
          ) : null}
        </div>
      )}

      <fieldset
        aria-describedby={
          errors.transit === undefined ? `${id}-transit-hint` : `${id}-transit-error`
        }
        className={styles.formRow}
      >
        <legend className={catalog.label}>Días de tránsito (opcional)</legend>
        <div className={catalog.field}>
          <label className={catalog.label} htmlFor={`${id}-tmin`}>
            Mínimo
          </label>
          <input
            className={catalog.input}
            id={`${id}-tmin`}
            inputMode="numeric"
            onChange={(event) => setTransitMin(event.target.value)}
            value={transitMin}
          />
        </div>
        <div className={catalog.field}>
          <label className={catalog.label} htmlFor={`${id}-tmax`}>
            Máximo
          </label>
          <input
            className={catalog.input}
            id={`${id}-tmax`}
            inputMode="numeric"
            onChange={(event) => setTransitMax(event.target.value)}
            value={transitMax}
          />
        </div>
        {errors.transit === undefined ? (
          <span className={catalog.hint} id={`${id}-transit-hint`}>
            Enteros de 0 a 90.
          </span>
        ) : (
          <span className={catalog.fieldError} id={`${id}-transit-error`}>
            {errors.transit}
          </span>
        )}
      </fieldset>

      <div aria-live="polite" className={catalog.field}>
        {preview.ok ? (
          <div className={styles.ok}>
            <p>
              <strong>{describeRate(preview.rate)}</strong>
            </p>
            <p>Ejemplo con esta regla sola: {illustrateRate(preview.rate, 1)}.</p>
            <p>{illustrateRate(preview.rate, 3)}.</p>
          </div>
        ) : null}
      </div>

      {failure === null ? null : (
        <FailureNotice code={failure.code} reference={failure.reference} />
      )}

      <div className={catalog.actions}>
        <button className={catalog.buttonPrimary} disabled={busy} type="submit">
          {busy ? 'Guardando…' : rule === null ? 'Crear regla' : 'Guardar regla'}
        </button>
        <button className={catalog.buttonSecondary} disabled={busy} onClick={onDone} type="button">
          Cancelar
        </button>
      </div>
    </form>
  );
}
