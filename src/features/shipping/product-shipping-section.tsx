'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';

import catalog from '@/features/panel/catalog.module.css';
import type {
  ShippingProductRelation,
  ShippingProductRelationPage,
  ShippingRelationChangeResult,
  ShippingRule,
} from '@/lib/api/shipping';

import { FailureNotice } from './failure-notice';
import {
  changeProductRelations,
  listAssignableZones,
  listProductRelations,
  newIdempotencyKey,
} from './shipping-client';
import { keepsKey } from './shipping-errors';
import { COPY_STATE_LABELS, describeRate, RATE_TYPE_LABELS } from './shipping-labels';
import type { ShippingZoneWithRules } from './shipping-projections';
import styles from './shipping.module.css';
import { useExclusive } from './use-exclusive';
import { ZoneStatusBadge } from './zone-badges';
import { stepHref } from './zone-form-model';

type Failure = { readonly code: string; readonly reference?: string | undefined } | null;

export const ORIGIN_LABELS: Readonly<Record<ShippingProductRelation['origin'], string>> = {
  product: 'Producto',
  category: 'Categoría',
  all: 'Todos los productos',
};

export const RELATION_LABELS: Readonly<Record<ShippingProductRelation['relation'], string>> = {
  direct: 'Directa',
  inherited: 'Heredada',
};

/** Motivos por los que un cambio de relación no se aplicó, con las palabras del contrato. */
export const RELATION_FAILURE_LABELS: Readonly<Record<string, string>> = {
  rule_not_product_scope:
    'Esa regla no es de productos concretos: una relación heredada no se cambia desde el producto.',
  rule_version_conflict: 'La regla cambió mientras la mirabas. Recarga y vuelve a intentarlo.',
  rule_not_found: 'Esa regla ya no existe.',
  target_taken: 'Otra regla de productos de esa zona ya tiene este producto.',
  rule_archived: 'La regla está archivada.',
  zone_archived: 'La zona está archivada.',
  zone_copy_incomplete: 'La zona es una copia sin terminar.',
  idempotency_conflict: 'Esa operación ya se envió con otros datos.',
};

export function describeChange(result: ShippingRelationChangeResult): string {
  if (result.outcome === 'added') return 'Asignado.';
  if (result.outcome === 'removed') return 'Retirado.';
  if (result.outcome === 'unchanged') return 'Sin cambios: ya estaba así.';

  return result.code === null
    ? 'No se aplicó.'
    : (RELATION_FAILURE_LABELS[result.code] ?? 'No se aplicó.');
}

/** Por qué una relación no participa hoy en las cotizaciones, sin decir qué regla gana. */
function activity(relation: ShippingProductRelation): string {
  if (relation.active) return 'Participa en las cotizaciones de hoy.';
  if (relation.zone.copyState !== 'ready') {
    return `No participa: la zona es una copia (${COPY_STATE_LABELS[relation.zone.copyState].toLowerCase()}).`;
  }
  if (relation.zone.status === 'draft') return 'No participa: la zona está en borrador.';
  if (relation.zone.status === 'archived') return 'No participa: la zona está archivada.';

  return 'No participa: la regla está archivada.';
}

/**
 * «Cobertura y envío» en la ficha de un producto.
 *
 * Vive **aparte** del formulario del producto: no se mezcla con peso, precio, inventario ni
 * variantes. Lee el endpoint inverso del contrato —relaciones directas y heredadas, paginadas por
 * el backend— y nunca dice qué regla gana: eso depende del departamento y el municipio, y para
 * verlo está la vista previa.
 *
 * Solo las relaciones **directas** se añaden o se retiran aquí. Una heredada —por la categoría o por
 * una regla para todos los productos— se ve como tal, sin botón de retirar: vive en otra regla y se
 * cambia en su zona.
 */
export function ProductShippingSection({
  product,
  initial,
  problem,
  canManage,
}: {
  readonly product: { readonly id: string; readonly name: string };
  readonly initial: ShippingProductRelationPage | null;
  readonly problem: string | null;
  readonly canManage: boolean;
}) {
  const [items, setItems] = useState<readonly ShippingProductRelation[]>(initial?.items ?? []);
  const [next, setNext] = useState<string | null>(initial?.nextPageToken ?? null);
  const [loading, setLoading] = useState(false);
  const [moreFailure, setMoreFailure] = useState<Failure>(null);

  async function loadMore() {
    if (next === null) return;

    setLoading(true);

    const result = await listProductRelations(product.id, next);

    setLoading(false);

    if (!result.ok) {
      setMoreFailure({ code: result.code, reference: result.reference });

      return;
    }

    setMoreFailure(null);
    setItems((current) => [...current, ...result.data.items]);
    setNext(result.data.nextPageToken);
  }

  const direct = new Set(
    items.filter((relation) => relation.relation === 'direct').map((relation) => relation.rule.id),
  );

  return (
    <section aria-labelledby="cobertura-envio" className={`${catalog.card} ${catalog.cardPad}`}>
      <div className={catalog.sectionHead}>
        <div className={catalog.sectionHeadText}>
          <h2 className={catalog.sectionTitle} id="cobertura-envio">
            Cobertura y envío
          </h2>
          <p className={catalog.sectionHint}>
            Reglas de envío que alcanzan a este producto, directas o heredadas. Se gestiona aparte
            del precio, el inventario y las variantes, y cubre todas sus variantes.
          </p>
        </div>
        {canManage && initial !== null ? (
          <span className={styles.rowActions}>
            <AssignRelationButton directRuleIds={direct} product={product} />
          </span>
        ) : null}
      </div>

      {problem === null ? null : <p className={catalog.error}>{problem}</p>}

      {initial === null ? null : items.length === 0 ? (
        <p className={catalog.hint}>
          Ninguna regla alcanza a este producto: donde una zona lo cubra, recibe lo que esa zona
          indique para productos sin regla —cotización manual o no disponible, nunca gratis—.
        </p>
      ) : (
        <ul className={styles.ruleList}>
          {items.map((relation) => (
            <li
              className={relation.active ? styles.ruleItem : styles.ruleItemArchived}
              key={`${relation.zone.id}:${relation.rule.id}:${relation.origin}`}
            >
              <span className={styles.ruleText}>
                <span className={styles.cellMain}>
                  <Link href={stepHref(relation.zone.id, 'productos')}>{relation.zone.name}</Link>{' '}
                  <ZoneStatusBadge status={relation.zone.status} />
                </span>
                <span>
                  {relation.rule.name} · versión {relation.rule.version} ·{' '}
                  {RATE_TYPE_LABELS[relation.rule.rateType]}
                </span>
                <span className={styles.cellSub}>
                  Origen: {ORIGIN_LABELS[relation.origin]}
                  {relation.origin === 'category' && relation.categorySlug !== null
                    ? ` «${relation.categorySlug}»`
                    : ''}{' '}
                  · Relación: <strong>{RELATION_LABELS[relation.relation]}</strong> · Zona versión{' '}
                  {relation.zone.version}
                </span>
                <span className={styles.cellSub}>{activity(relation)}</span>
              </span>
              {relation.relation === 'direct' ? (
                canManage ? (
                  <UnassignButton product={product} relation={relation} />
                ) : null
              ) : (
                <span className={styles.stateTag}>
                  Heredada: se cambia en la{' '}
                  <Link
                    href={stepHref(
                      relation.zone.id,
                      relation.origin === 'all' ? 'tarifas' : 'productos',
                    )}
                  >
                    zona
                  </Link>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {moreFailure === null ? null : (
        <FailureNotice code={moreFailure.code} reference={moreFailure.reference} />
      )}
      {next === null ? null : (
        <button
          className={catalog.buttonSecondary}
          disabled={loading}
          onClick={() => void loadMore()}
          type="button"
        >
          {loading ? 'Cargando…' : 'Cargar más relaciones'}
        </button>
      )}

      <p className={catalog.hint}>
        Esto no dice qué regla gana: depende del departamento y el municipio de destino. Para verlo,
        usa la <Link href="/panel/envios/vista-previa">vista previa de envío</Link>.
      </p>
    </section>
  );
}

/** Aplica cambios de relación directa con una clave que solo se conserva si el desenlace es incierto. */
function useRelationChanges(productId: string) {
  const router = useRouter();
  const { busy, run } = useExclusive();
  const key = useRef<string | null>(null);
  const [failure, setFailure] = useState<Failure>(null);
  const [results, setResults] = useState<readonly ShippingRelationChangeResult[] | null>(null);

  async function apply(
    changes: readonly { action: 'assign' | 'unassign'; ruleId: string; expectedVersion: number }[],
  ) {
    key.current ??= newIdempotencyKey();

    const idempotencyKey = key.current;
    const result = await run(() => changeProductRelations(productId, { idempotencyKey, changes }));

    if (result === null) return;
    if (!result.ok) {
      if (!keepsKey(result.code)) key.current = null;
      setFailure({ code: result.code, reference: result.reference });

      return;
    }

    key.current = null;
    setFailure(null);
    setResults(result.data.results);
    router.refresh();
  }

  function reset() {
    key.current = null;
    setFailure(null);
    setResults(null);
  }

  return { busy, failure, results, apply, reset };
}

function UnassignButton({
  product,
  relation,
}: {
  readonly product: { readonly id: string; readonly name: string };
  readonly relation: ShippingProductRelation;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement | null>(null);
  const changes = useRelationChanges(product.id);

  return (
    <>
      <button
        className={catalog.rowAction}
        onClick={() => {
          changes.reset();
          dialog.current?.showModal();
        }}
        type="button"
      >
        Retirar
      </button>
      <dialog
        aria-describedby={`${id}-text`}
        aria-labelledby={`${id}-title`}
        className={catalog.previewDialog}
        ref={dialog}
      >
        <div className={catalog.previewDialogBody}>
          <h2 className={catalog.sectionTitle} id={`${id}-title`}>
            ¿Retirar «{product.name}» de «{relation.rule.name}»?
          </h2>
          <p className={catalog.pageLead} id={`${id}-text`}>
            Se quita la asignación directa en la zona «{relation.zone.name}». Las relaciones
            heredadas —por su categoría o por una regla para todos— no cambian: si alguna existe en
            esa zona, el producto la seguirá recibiendo.
          </p>
          <ChangeResults results={changes.results} />
          {changes.failure === null ? null : (
            <FailureNotice code={changes.failure.code} reference={changes.failure.reference} />
          )}
          <div className={catalog.actions}>
            {changes.results === null ? (
              <button
                className={catalog.buttonDanger}
                disabled={changes.busy}
                onClick={() =>
                  void changes.apply([
                    {
                      action: 'unassign',
                      ruleId: relation.rule.id,
                      expectedVersion: relation.rule.version,
                    },
                  ])
                }
                type="button"
              >
                {changes.busy ? 'Retirando…' : 'Retirar asignación directa'}
              </button>
            ) : null}
            <button
              autoFocus
              className={catalog.buttonSecondary}
              disabled={changes.busy}
              onClick={() => dialog.current?.close()}
              type="button"
            >
              Cerrar
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

function ChangeResults({
  results,
}: {
  readonly results: readonly ShippingRelationChangeResult[] | null;
}) {
  if (results === null) return null;

  return (
    <ul aria-live="polite" className={styles.warningList}>
      {results.map((result) => (
        <li
          className={result.outcome === 'failed' ? styles.warning : styles.ok}
          key={`${result.ruleId}:${result.action}`}
        >
          {describeChange(result)}
          {result.ruleVersion === null ? '' : ` La regla va por la versión ${result.ruleVersion}.`}
        </li>
      ))}
    </ul>
  );
}

/** Máximo de cambios por petición que publica el contrato. */
const RELATION_CHANGES_MAX = 20;

function AssignRelationButton({
  product,
  directRuleIds,
}: {
  readonly product: { readonly id: string; readonly name: string };
  readonly directRuleIds: ReadonlySet<string>;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement | null>(null);
  const changes = useRelationChanges(product.id);
  const [zones, setZones] = useState<readonly ShippingZoneWithRules[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loadFailure, setLoadFailure] = useState<Failure>(null);
  const [chosen, setChosen] = useState<ReadonlyMap<string, ShippingRule>>(new Map());

  async function load(q: string, pageToken: string | null, append: boolean) {
    const result = await listAssignableZones({ q, pageToken });

    if (!result.ok) {
      setLoadFailure({ code: result.code, reference: result.reference });

      return;
    }

    setLoadFailure(null);
    setZones((current) =>
      append ? [...(current ?? []), ...result.data.items] : result.data.items,
    );
    setNext(result.data.nextPageToken);
  }

  return (
    <>
      <button
        className={catalog.buttonSecondary}
        onClick={() => {
          changes.reset();
          setChosen(new Map());
          setZones(null);
          setSearch('');
          dialog.current?.showModal();
          void load('', null, false);
        }}
        type="button"
      >
        Asignar a una regla de productos
      </button>
      <dialog
        aria-describedby={`${id}-text`}
        aria-labelledby={`${id}-title`}
        className={`${catalog.previewDialog} ${styles.wideDialog}`}
        ref={dialog}
      >
        <div className={catalog.previewDialogBody}>
          <h2 className={catalog.sectionTitle} id={`${id}-title`}>
            Asignar «{product.name}»
          </h2>
          <p className={catalog.pageLead} id={`${id}-text`}>
            Elige reglas de productos concretos. La asignación es directa y tiene preferencia,
            dentro de esa zona, sobre la de su categoría y la de todos los productos. Hasta{' '}
            {RELATION_CHANGES_MAX} a la vez.
          </p>
          <form
            className={catalog.field}
            onSubmit={(event) => {
              event.preventDefault();
              void load(search.trim(), null, false);
            }}
            role="search"
          >
            <label className={catalog.label} htmlFor={`${id}-q`}>
              Buscar zona por nombre
            </label>
            <span className={catalog.actions}>
              <input
                className={catalog.input}
                id={`${id}-q`}
                onChange={(event) => setSearch(event.target.value)}
                type="search"
                value={search}
              />
              <button className={catalog.buttonSecondary} type="submit">
                Buscar
              </button>
            </span>
          </form>
          {zones === null && loadFailure === null ? (
            <p className={catalog.hint} role="status">
              Cargando zonas…
            </p>
          ) : null}
          {loadFailure === null ? null : (
            <FailureNotice code={loadFailure.code} reference={loadFailure.reference} />
          )}
          {zones === null ? null : (
            <fieldset className={styles.choices}>
              <legend>Reglas de productos</legend>
              {zones.flatMap(({ zone, rules }) =>
                rules
                  .filter((rule) => rule.scope === 'products')
                  .map((rule) => {
                    const already = directRuleIds.has(rule.id);

                    return (
                      <label className={styles.choice} key={rule.id}>
                        <input
                          checked={already || chosen.has(rule.id)}
                          disabled={
                            already || (!chosen.has(rule.id) && chosen.size >= RELATION_CHANGES_MAX)
                          }
                          onChange={() =>
                            setChosen((current) => {
                              const nextChosen = new Map(current);

                              if (nextChosen.has(rule.id)) nextChosen.delete(rule.id);
                              else nextChosen.set(rule.id, rule);

                              return nextChosen;
                            })
                          }
                          type="checkbox"
                        />
                        <span className={styles.choiceText}>
                          <span className={styles.choiceTitle}>
                            {zone.name} → {rule.name}
                          </span>
                          <span className={styles.choiceHint}>
                            {describeRate(rule.rate)} · versión {rule.version}
                            {already ? ' · Ya asignado de forma directa' : ''}
                          </span>
                        </span>
                      </label>
                    );
                  }),
              )}
              {zones.every(({ rules }) => rules.every((rule) => rule.scope !== 'products')) ? (
                <p className={catalog.hint}>
                  Ninguna de estas zonas tiene reglas de productos concretos: créalas en el paso
                  «Tarifas» de la zona.
                </p>
              ) : null}
            </fieldset>
          )}
          {next === null ? null : (
            <button
              className={catalog.buttonSecondary}
              onClick={() => void load(search.trim(), next, true)}
              type="button"
            >
              Cargar más zonas
            </button>
          )}
          <ChangeResults results={changes.results} />
          {changes.failure === null ? null : (
            <FailureNotice code={changes.failure.code} reference={changes.failure.reference} />
          )}
          <div className={catalog.actions}>
            {changes.results === null ? (
              <button
                className={catalog.buttonPrimary}
                disabled={changes.busy || chosen.size === 0}
                onClick={() =>
                  void changes.apply(
                    [...chosen.values()].map((rule) => ({
                      action: 'assign' as const,
                      ruleId: rule.id,
                      expectedVersion: rule.version,
                    })),
                  )
                }
                type="button"
              >
                {changes.busy
                  ? 'Asignando…'
                  : `Asignar a ${chosen.size} regla${chosen.size === 1 ? '' : 's'}`}
              </button>
            ) : null}
            <button
              autoFocus
              className={catalog.buttonSecondary}
              disabled={changes.busy}
              onClick={() => dialog.current?.close()}
              type="button"
            >
              Cerrar
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
