'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import catalog from '@/features/panel/catalog.module.css';
import type { ShippingZone } from '@/lib/api/shipping';

import { FailureNotice } from './failure-notice';
import { createZone, updateZone } from './shipping-client';
import { UNMATCHED_LABELS } from './shipping-labels';
import styles from './shipping.module.css';
import { useExclusive } from './use-exclusive';
import {
  changedFields,
  DESCRIPTION_MAX,
  draftFromZone,
  EMPTY_ZONE_DRAFT,
  parseZoneDraft,
  PRIORITY_MAX,
  PRIORITY_MIN,
  stepHref,
  type ZoneDraft,
  type ZoneFieldErrors,
} from './zone-form-model';

type Failure = { readonly code: string; readonly reference?: string | undefined } | null;

/**
 * Paso 1, «Información»: nombre, descripción, prioridad y vigencia opcional.
 *
 * Crear la zona la deja en **borrador**, sin cobertura ni reglas; después se pasa a la cobertura.
 * Editar manda solo lo que cambió, con `expectedVersion`. Ante un `409` no se dice «guardado»: se
 * explica que otro administrador cambió la zona y se ofrece recargar.
 */
export function ZoneInfoForm({
  zone,
  readOnly,
}: {
  readonly zone: ShippingZone | null;
  readonly readOnly: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const { busy, run } = useExclusive();
  const [draft, setDraft] = useState<ZoneDraft>(
    zone === null
      ? { ...EMPTY_ZONE_DRAFT, unmatchedProductBehavior: 'unavailable' }
      : draftFromZone(zone),
  );
  const [errors, setErrors] = useState<ZoneFieldErrors>({});
  const [failure, setFailure] = useState<Failure>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function set<K extends keyof ZoneDraft>(key: K, value: ZoneDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice(null);
  }

  async function save(continueToNext: boolean) {
    const parsed = parseZoneDraft(draft);

    if (!parsed.ok) {
      setErrors(parsed.errors);

      return;
    }

    setErrors({});
    setFailure(null);

    if (zone === null) {
      const result = await run(() => createZone(parsed.values));

      if (result === null) return;
      if (!result.ok) {
        setFailure({ code: result.code, reference: result.reference });

        return;
      }

      router.push(stepHref(result.data.id, 'cobertura'));

      return;
    }

    const changes = changedFields(zone, parsed.values);

    if (Object.keys(changes).length === 0) {
      if (continueToNext) router.push(stepHref(zone.id, 'cobertura'));
      else setNotice('No hay cambios que guardar.');

      return;
    }

    const result = await run(() =>
      updateZone(zone.id, { expectedVersion: zone.version, ...changes }),
    );

    if (result === null) return;
    if (!result.ok) {
      setFailure({ code: result.code, reference: result.reference });

      return;
    }

    if (continueToNext) router.push(stepHref(zone.id, 'cobertura'));
    else {
      setNotice(`Información guardada. La zona va por la versión ${result.data.version}.`);
      router.refresh();
    }
  }

  const field = (key: keyof ZoneDraft) => ({
    'aria-invalid': errors[key] === undefined ? undefined : true,
    'aria-describedby':
      errors[key] === undefined ? `${id}-${key}-hint` : `${id}-${key}-error ${id}-${key}-hint`,
  });

  return (
    <form
      className={`${catalog.card} ${catalog.cardPad}`}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save(true);
      }}
    >
      <h2 className={catalog.sectionTitle}>Información</h2>

      <div className={catalog.field}>
        <label className={catalog.label} htmlFor={`${id}-name`}>
          Nombre
        </label>
        <input
          className={catalog.input}
          disabled={readOnly}
          id={`${id}-name`}
          maxLength={80}
          onChange={(event) => set('name', event.target.value)}
          required
          value={draft.name}
          {...field('name')}
        />
        <FieldMessages
          error={errors.name}
          hint="Lo ven los administradores; no se muestra al comprador."
          id={`${id}-name`}
        />
      </div>

      <div className={catalog.field}>
        <label className={catalog.label} htmlFor={`${id}-description`}>
          Descripción (opcional)
        </label>
        <textarea
          className={catalog.textarea}
          disabled={readOnly}
          id={`${id}-description`}
          maxLength={DESCRIPTION_MAX}
          onChange={(event) => set('description', event.target.value)}
          rows={3}
          value={draft.description}
          {...field('description')}
        />
        <FieldMessages
          error={errors.description}
          hint={`Hasta ${DESCRIPTION_MAX} caracteres.`}
          id={`${id}-description`}
        />
      </div>

      <div className={styles.formRow}>
        <div className={catalog.field}>
          <label className={catalog.label} htmlFor={`${id}-priority`}>
            Prioridad
          </label>
          <input
            className={catalog.input}
            disabled={readOnly}
            id={`${id}-priority`}
            inputMode="numeric"
            onChange={(event) => set('priority', event.target.value)}
            required
            value={draft.priority}
            {...field('priority')}
          />
          <FieldMessages
            error={errors.priority}
            hint={`Entero de ${PRIORITY_MIN} a ${PRIORITY_MAX}. Gana la más alta, pero solo entre zonas que cubren un municipio al mismo nivel: un municipio específico siempre gana a un departamento, y un departamento al respaldo nacional.`}
            id={`${id}-priority`}
          />
        </div>
      </div>

      <fieldset className={styles.choices}>
        <legend>Vigencia (opcional, hora de Colombia)</legend>
        <div className={catalog.field}>
          <label className={catalog.label} htmlFor={`${id}-validFrom`}>
            Desde
          </label>
          <input
            className={catalog.input}
            disabled={readOnly}
            id={`${id}-validFrom`}
            onChange={(event) => set('validFrom', event.target.value)}
            type="datetime-local"
            value={draft.validFrom}
            {...field('validFrom')}
          />
          <FieldMessages
            error={errors.validFrom}
            hint="Vacío: sin fecha de inicio."
            id={`${id}-validFrom`}
          />
        </div>
        <div className={catalog.field}>
          <label className={catalog.label} htmlFor={`${id}-validUntil`}>
            Hasta
          </label>
          <input
            className={catalog.input}
            disabled={readOnly}
            id={`${id}-validUntil`}
            onChange={(event) => set('validUntil', event.target.value)}
            type="datetime-local"
            value={draft.validUntil}
            {...field('validUntil')}
          />
          <FieldMessages
            error={errors.validUntil}
            hint="Vacío: sin fecha de fin. Fuera de su vigencia, una zona activa no cotiza."
            id={`${id}-validUntil`}
          />
        </div>
      </fieldset>

      {zone === null ? (
        <fieldset className={styles.choices}>
          <legend>Producto sin regla en esta zona</legend>
          {(['unavailable', 'manual_quote'] as const).map((value) => (
            <label className={styles.choice} key={value}>
              <input
                checked={draft.unmatchedProductBehavior === value}
                name={`${id}-unmatched`}
                onChange={() => set('unmatchedProductBehavior', value)}
                type="radio"
                value={value}
              />
              <span className={styles.choiceText}>
                <span className={styles.choiceTitle}>{UNMATCHED_LABELS[value]}</span>
                <span className={styles.choiceHint}>
                  {value === 'unavailable'
                    ? 'No se puede comprar con envío a este destino.'
                    : 'Se vende y el envío se cotiza a mano.'}
                </span>
              </span>
            </label>
          ))}
          <p className={catalog.hint}>Nunca es gratis. Se puede cambiar en el paso «Productos».</p>
        </fieldset>
      ) : null}

      <div aria-live="polite">
        {notice === null ? null : (
          <p className={catalog.success} role="status">
            {notice}
          </p>
        )}
      </div>
      {failure === null ? null : (
        <FailureNotice code={failure.code} reference={failure.reference} />
      )}

      {readOnly ? null : (
        <div className={styles.stepNav}>
          {zone === null ? (
            <span />
          ) : (
            <button
              className={catalog.buttonSecondary}
              disabled={busy}
              onClick={() => void save(false)}
              type="button"
            >
              Guardar borrador
            </button>
          )}
          <button className={catalog.buttonPrimary} disabled={busy} type="submit">
            {busy ? 'Guardando…' : zone === null ? 'Crear borrador y seguir' : 'Guardar y seguir'}
          </button>
        </div>
      )}
    </form>
  );
}

export function FieldMessages({
  id,
  hint,
  error,
}: {
  readonly id: string;
  readonly hint: string;
  readonly error: string | undefined;
}) {
  return (
    <>
      {error === undefined ? null : (
        <span className={catalog.fieldError} id={`${id}-error`}>
          {error}
        </span>
      )}
      <span className={catalog.hint} id={`${id}-hint`}>
        {hint}
      </span>
    </>
  );
}
