'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';

import catalog from '@/features/panel/catalog.module.css';
import type { ShippingRule } from '@/lib/api/shipping';

import { applyTargets } from './apply-targets';
import { FailureNotice } from './failure-notice';
import { listAssignableZones, listProductRelations, newIdempotencyKey } from './shipping-client';
import { TARGET_FAILURE_LABELS } from './shipping-errors';
import { describeRate, ZONE_STATUS_LABELS } from './shipping-labels';
import type { ShippingZoneWithRules } from './shipping-projections';
import styles from './shipping.module.css';
import {
  describeSummary,
  planAssignment,
  type AssignmentMode,
  type AssignmentPlan,
  type ResultSummary,
} from './target-plan';
import { useExclusive } from './use-exclusive';
import { Comparison } from './targets-editor';
import { stepHref } from './zone-form-model';

type Failure = { readonly code: string; readonly reference?: string | undefined } | null;

export type AssignableProduct = { readonly id: string; readonly name: string };

type Target = { readonly zone: ShippingZoneWithRules['zone']; readonly rule: ShippingRule };

type Stage =
  | { readonly kind: 'choose' }
  | {
      readonly kind: 'compare';
      readonly plans: readonly { target: Target; plan: AssignmentPlan }[];
    }
  | {
      readonly kind: 'done';
      readonly results: readonly {
        target: Target;
        summary: ResultSummary | null;
        failure: Failure;
      }[];
    };

/**
 * «Asignar a zonas de envío» y «Retirar de zonas de envío».
 *
 * Un producto se asigna a una **regla de productos** de una zona —la que le pone tarifa—. El
 * diálogo va en tres tiempos: elegir zona y regla, **comparar** —qué cambia y qué ya estaba así,
 * leyendo las asignaciones reales de cada regla— y confirmar. El desenlace se enseña por regla y
 * por producto, tal como lo devolvió el backend.
 */
export function AssignDialogButton({
  products,
  mode,
  label,
  className,
}: {
  readonly products: readonly AssignableProduct[];
  readonly mode: AssignmentMode;
  readonly label: string;
  readonly className?: string | undefined;
}) {
  const router = useRouter();
  const id = useId();
  const dialog = useRef<HTMLDialogElement | null>(null);
  const { busy, run } = useExclusive();
  const [zones, setZones] = useState<readonly ShippingZoneWithRules[] | null>(null);
  const [nextZones, setNextZones] = useState<string | null>(null);
  const [zoneSearch, setZoneSearch] = useState('');
  const [loadFailure, setLoadFailure] = useState<Failure>(null);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [stage, setStage] = useState<Stage>({ kind: 'choose' });
  const [failure, setFailure] = useState<Failure>(null);
  const keys = useRef<Map<string, string>>(new Map());

  const ids = products.map((product) => product.id);
  const name = (productId: string) =>
    products.find((product) => product.id === productId)?.name ?? 'Producto';
  const targets: Target[] = (zones ?? []).flatMap(({ zone, rules }) =>
    rules.filter((rule) => rule.scope === 'products').map((rule) => ({ zone, rule })),
  );

  /** Una página de zonas asignables; con `append`, la siguiente de la misma búsqueda. */
  async function loadZones(q: string, pageToken: string | null, append: boolean) {
    setLoadFailure(null);

    const result = await listAssignableZones({ q, pageToken });

    if (!result.ok) {
      setLoadFailure({ code: result.code, reference: result.reference });

      return;
    }

    setZones((current) =>
      append ? [...(current ?? []), ...result.data.items] : result.data.items,
    );
    setNextZones(result.data.nextPageToken);
  }

  async function open() {
    setStage({ kind: 'choose' });
    setChosen(new Set());
    setFailure(null);
    setZones(null);
    setZoneSearch('');
    keys.current = new Map();
    dialog.current?.showModal();
    await loadZones('', null, false);
  }

  async function compare() {
    setFailure(null);

    const selected = targets.filter((target) => chosen.has(target.rule.id));
    const plans = await run(async () => {
      const out: { target: Target; plan: AssignmentPlan }[] = [];

      // Qué productos tiene ya cada regla, leído **por producto** con el endpoint inverso: solo
      // las relaciones directas cuentan, porque son las únicas que esta acción cambia.
      const direct = new Map<string, Set<string>>();

      for (const productId of ids) {
        const rules = new Set<string>();
        let pageToken: string | null = null;

        do {
          const page = await listProductRelations(productId, pageToken);

          if (!page.ok) return { failure: { code: page.code, reference: page.reference } };

          for (const relation of page.data.items) {
            if (relation.relation === 'direct') rules.add(relation.rule.id);
          }

          pageToken = page.data.nextPageToken;
        } while (pageToken !== null);

        direct.set(productId, rules);
      }

      for (const target of selected) {
        const existing = new Set(
          ids.filter((productId) => direct.get(productId)?.has(target.rule.id)),
        );

        out.push({ target, plan: planAssignment(ids, existing, mode) });
      }

      return { plans: out };
    });

    if (plans === null) return;
    if ('failure' in plans) {
      setFailure(plans.failure);

      return;
    }

    setStage({ kind: 'compare', plans: plans.plans });
  }

  async function confirm(plans: readonly { target: Target; plan: AssignmentPlan }[]) {
    const results = await run(async () => {
      const out: { target: Target; summary: ResultSummary | null; failure: Failure }[] = [];

      for (const { target, plan } of plans) {
        if (plan.change.length === 0) {
          out.push({ target, summary: null, failure: null });
          continue;
        }

        const outcome = await applyTargets(
          target.rule,
          mode === 'add' ? plan.change : [],
          mode === 'remove' ? plan.change : [],
          (index) => {
            const slot = `${target.rule.id}:${index}`;
            const existing = keys.current.get(slot);

            if (existing !== undefined) return existing;

            const key = newIdempotencyKey();

            keys.current.set(slot, key);

            return key;
          },
        );

        out.push(
          outcome.ok
            ? { target, summary: outcome.summary, failure: null }
            : {
                target,
                summary: outcome.partial,
                failure: { code: outcome.code, reference: outcome.reference },
              },
        );
      }

      return out;
    });

    if (results === null) return;

    setStage({ kind: 'done', results });
    router.refresh();
  }

  const verb = mode === 'add' ? 'Asignar' : 'Retirar';

  return (
    <>
      <button
        className={className ?? catalog.buttonSecondary}
        disabled={products.length === 0}
        onClick={() => void open()}
        type="button"
      >
        {label}
      </button>
      <dialog
        aria-describedby={`${id}-text`}
        aria-labelledby={`${id}-title`}
        className={`${catalog.previewDialog} ${styles.wideDialog}`}
        ref={dialog}
      >
        <div className={catalog.previewDialogBody}>
          <h2 className={catalog.sectionTitle} id={`${id}-title`}>
            {mode === 'add' ? 'Asignar a zonas de envío' : 'Retirar de zonas de envío'}
          </h2>
          <p className={catalog.pageLead} id={`${id}-text`}>
            {products.length === 1
              ? `Producto: ${products[0]?.name ?? ''}.`
              : `${products.length} productos seleccionados.`}{' '}
            {mode === 'add'
              ? 'Elige las reglas de productos donde asignarlos. Un producto tiene como mucho una regla por zona.'
              : 'Elige las reglas de productos de las que retirarlos. Después del retiro, en esa zona reciben la regla de su categoría, la de todos los productos o lo que la zona indique para productos sin regla —nunca gratis—.'}
          </p>

          {stage.kind === 'choose' ? (
            <>
              {zones === null && loadFailure === null ? (
                <p className={catalog.hint} role="status">
                  Cargando zonas…
                </p>
              ) : null}
              {loadFailure === null ? null : (
                <FailureNotice code={loadFailure.code} reference={loadFailure.reference} />
              )}
              <form
                className={catalog.field}
                onSubmit={(event) => {
                  event.preventDefault();
                  void loadZones(zoneSearch.trim(), null, false);
                }}
                role="search"
              >
                <label className={catalog.label} htmlFor={`${id}-zone-q`}>
                  Buscar zona por nombre
                </label>
                <span className={catalog.actions}>
                  <input
                    className={catalog.input}
                    id={`${id}-zone-q`}
                    minLength={2}
                    onChange={(event) => setZoneSearch(event.target.value)}
                    type="search"
                    value={zoneSearch}
                  />
                  <button className={catalog.buttonSecondary} type="submit">
                    Buscar
                  </button>
                </span>
              </form>
              {zones !== null && zones.length === 0 ? (
                <p className={catalog.hint}>Ninguna zona vigente coincide.</p>
              ) : null}
              {zones === null ? null : (
                <fieldset className={styles.choices}>
                  <legend>Zona y regla</legend>
                  {zones.map(({ zone, rules }) => {
                    const productRules = rules.filter((rule) => rule.scope === 'products');

                    return productRules.length === 0 ? (
                      <p className={catalog.hint} key={zone.id}>
                        «{zone.name}» ({ZONE_STATUS_LABELS[zone.status]}) no tiene reglas de
                        productos.{' '}
                        <Link href={stepHref(zone.id, 'tarifas')}>Crear una en Tarifas</Link>.
                      </p>
                    ) : (
                      productRules.map((rule) => (
                        <label className={styles.choice} key={rule.id}>
                          <input
                            checked={chosen.has(rule.id)}
                            onChange={() =>
                              setChosen((current) => {
                                const next = new Set(current);

                                if (next.has(rule.id)) next.delete(rule.id);
                                else next.add(rule.id);

                                return next;
                              })
                            }
                            type="checkbox"
                          />
                          <span className={styles.choiceText}>
                            <span className={styles.choiceTitle}>
                              {zone.name} → {rule.name}
                            </span>
                            <span className={styles.choiceHint}>
                              {ZONE_STATUS_LABELS[zone.status]} · {describeRate(rule.rate)} ·{' '}
                              {rule.targetCount} asignados
                            </span>
                          </span>
                        </label>
                      ))
                    );
                  })}
                </fieldset>
              )}
              {nextZones === null ? null : (
                <button
                  className={catalog.buttonSecondary}
                  onClick={() => void loadZones(zoneSearch.trim(), nextZones, true)}
                  type="button"
                >
                  Cargar más zonas
                </button>
              )}
              {failure === null ? null : (
                <FailureNotice code={failure.code} reference={failure.reference} />
              )}
              <div className={catalog.actions}>
                <button
                  className={catalog.buttonPrimary}
                  disabled={busy || chosen.size === 0}
                  onClick={() => void compare()}
                  type="button"
                >
                  {busy ? 'Comparando…' : 'Ver comparación'}
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
            </>
          ) : null}

          {stage.kind === 'compare' ? (
            <>
              {stage.plans.map(({ target, plan }) => (
                <section className={styles.compareBox} key={target.rule.id}>
                  <h3 className={catalog.subTitle}>
                    {target.zone.name} → {target.rule.name}
                  </h3>
                  <Comparison
                    add={mode === 'add' ? plan.change.map(name) : []}
                    remove={mode === 'remove' ? plan.change.map(name) : []}
                    unchanged={plan.unchanged.map(name)}
                    unchangedTitle={
                      mode === 'add' ? 'Ya estaban asignados' : 'No estaban asignados'
                    }
                  />
                </section>
              ))}
              {failure === null ? null : (
                <FailureNotice code={failure.code} reference={failure.reference} />
              )}
              <div className={catalog.actions}>
                <button
                  className={mode === 'add' ? catalog.buttonPrimary : catalog.buttonDanger}
                  disabled={busy || stage.plans.every(({ plan }) => plan.change.length === 0)}
                  onClick={() => void confirm(stage.plans)}
                  type="button"
                >
                  {busy
                    ? `${verb === 'Asignar' ? 'Asignando' : 'Retirando'}…`
                    : `Confirmar: ${verb.toLowerCase()}`}
                </button>
                <button
                  className={catalog.buttonSecondary}
                  disabled={busy}
                  onClick={() => setStage({ kind: 'choose' })}
                  type="button"
                >
                  Volver
                </button>
              </div>
            </>
          ) : null}

          {stage.kind === 'done' ? (
            <>
              <ul aria-live="polite" className={styles.warningList}>
                {stage.results.map(({ target, summary, failure: itemFailure }) => (
                  <li
                    className={
                      itemFailure === null && (summary?.failed.length ?? 0) === 0
                        ? styles.ok
                        : styles.warning
                    }
                    key={target.rule.id}
                  >
                    <strong>
                      {target.zone.name} → {target.rule.name}:
                    </strong>{' '}
                    {summary === null ? 'Nada que cambiar.' : describeSummary(summary)}
                    {summary === null || summary.failed.length === 0 ? null : (
                      <ul>
                        {summary.failed.map((item) => (
                          <li key={item.value}>
                            {name(item.value)}:{' '}
                            {item.code === null
                              ? 'no se aplicó.'
                              : (TARGET_FAILURE_LABELS[
                                  item.code as keyof typeof TARGET_FAILURE_LABELS
                                ] ?? 'no se aplicó.')}
                          </li>
                        ))}
                      </ul>
                    )}
                    {itemFailure === null ? null : (
                      <FailureNotice code={itemFailure.code} reference={itemFailure.reference} />
                    )}
                  </li>
                ))}
              </ul>
              <div className={catalog.actions}>
                <button
                  autoFocus
                  className={catalog.buttonPrimary}
                  onClick={() => dialog.current?.close()}
                  type="button"
                >
                  Cerrar
                </button>
              </div>
            </>
          ) : null}
        </div>
      </dialog>
    </>
  );
}
