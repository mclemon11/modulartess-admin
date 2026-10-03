'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';

import catalog from '@/features/panel/catalog.module.css';
import type { CategoryOption } from '@/features/panel/category-selection';
import type { ShippingRule, ShippingZone, UnmatchedProductBehavior } from '@/lib/api/shipping';

import { applyTargets } from './apply-targets';
import { FailureNotice } from './failure-notice';
import { listTargets, newIdempotencyKey, updateZone } from './shipping-client';
import { TARGET_FAILURE_LABELS } from './shipping-errors';
import { describeRate, SCOPE_LABELS, UNMATCHED_LABELS } from './shipping-labels';
import type { PickerProduct } from './shipping-projections';
import styles from './shipping.module.css';
import { describeSummary, diffTargets, planAssignment, type ResultSummary } from './target-plan';
import { ProductPicker } from './product-picker';
import { useExclusive } from './use-exclusive';
import { stepHref } from './zone-form-model';

type Failure = { readonly code: string; readonly reference?: string | undefined } | null;

export type ProductLabel = {
  readonly name: string;
  readonly status: PickerProduct['status'] | null;
};

/**
 * Paso 4, «Productos»: a qué productos alcanza cada regla y qué recibe el que no tiene ninguna.
 *
 * - Una regla «todos los productos» no tiene asignaciones: alcanza al catálogo entero.
 * - Una regla de categorías se edita con casillas sobre el catálogo de categorías.
 * - Una regla de productos se edita con el selector paginado, con selección múltiple.
 *
 * Antes de guardar se enseña el resumen —qué se asigna, qué se retira, qué ya estaba—, y después
 * el desenlace de cada elemento tal como lo devolvió el backend.
 */
export function TargetsEditor({
  zone,
  rules,
  targets,
  categories,
  productLabels,
  readOnly,
}: {
  readonly zone: ShippingZone;
  readonly rules: readonly ShippingRule[];
  readonly targets: Readonly<
    Record<string, { readonly values: readonly string[]; readonly nextPageToken: string | null }>
  >;
  readonly categories: readonly CategoryOption[];
  readonly productLabels: Readonly<Record<string, ProductLabel>>;
  readonly readOnly: boolean;
}) {
  const id = useId();
  const active = rules.filter((rule) => rule.status === 'active');
  const allRule = active.find((rule) => rule.scope === 'all');
  const scoped = active.filter((rule) => rule.scope !== 'all');

  return (
    <section aria-labelledby={`${id}-title`} className={`${catalog.card} ${catalog.cardPad}`}>
      <h2 className={catalog.sectionTitle} id={`${id}-title`}>
        Productos
      </h2>

      <UnmatchedSetting readOnly={readOnly} zone={zone} />

      {allRule === undefined ? null : (
        <p className={catalog.notice}>
          La regla «{allRule.name}» ({describeRate(allRule.rate)}) alcanza a todos los productos.
          Las reglas de categorías y de productos de esta zona tienen preferencia sobre ella.
        </p>
      )}

      {scoped.length === 0 ? (
        <p className={catalog.hint}>
          {allRule === undefined
            ? 'Esta zona todavía no tiene reglas de categorías ni de productos.'
            : 'No hay reglas de categorías ni de productos.'}{' '}
          Para tarifas distintas por categoría o producto, crea la regla en el paso «Tarifas».
        </p>
      ) : (
        scoped.map((rule) =>
          rule.scope === 'categories' ? (
            <CategoryTargets
              categories={categories}
              key={`${rule.id}:${rule.version}`}
              readOnly={readOnly}
              rule={rule}
              saved={targets[rule.id]?.values ?? []}
              nextPageToken={targets[rule.id]?.nextPageToken ?? null}
            />
          ) : (
            <ProductTargets
              key={`${rule.id}:${rule.version}`}
              labels={productLabels}
              readOnly={readOnly}
              rule={rule}
              saved={targets[rule.id]?.values ?? []}
              nextPageToken={targets[rule.id]?.nextPageToken ?? null}
            />
          ),
        )
      )}

      <div className={styles.stepNav}>
        <Link className={catalog.buttonSecondary} href={stepHref(zone.id, 'tarifas')}>
          Volver a tarifas
        </Link>
        <Link className={catalog.buttonPrimary} href={stepHref(zone.id, 'revision')}>
          Seguir a revisión
        </Link>
      </div>
    </section>
  );
}

function UnmatchedSetting({
  zone,
  readOnly,
}: {
  readonly zone: ShippingZone;
  readonly readOnly: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const { busy, run } = useExclusive();
  const [value, setValue] = useState<UnmatchedProductBehavior>(zone.unmatchedProductBehavior);
  const [failure, setFailure] = useState<Failure>(null);

  async function save() {
    setFailure(null);

    const result = await run(() =>
      updateZone(zone.id, { expectedVersion: zone.version, unmatchedProductBehavior: value }),
    );

    if (result === null) return;
    if (!result.ok) {
      setFailure({ code: result.code, reference: result.reference });

      return;
    }

    router.refresh();
  }

  return (
    <fieldset className={styles.choices} disabled={readOnly}>
      <legend>Producto sin regla en esta zona</legend>
      {(['unavailable', 'manual_quote'] as const).map((option) => (
        <label className={styles.choice} key={option}>
          <input
            checked={value === option}
            name={`${id}-unmatched`}
            onChange={() => setValue(option)}
            type="radio"
          />
          <span className={styles.choiceText}>
            <span className={styles.choiceTitle}>{UNMATCHED_LABELS[option]}</span>
            <span className={styles.choiceHint}>
              {option === 'unavailable'
                ? 'No se puede comprar con envío a los destinos de esta zona.'
                : 'Se vende y el envío se cotiza a mano.'}
            </span>
          </span>
        </label>
      ))}
      <p className={catalog.hint}>
        Aplica cuando esta zona es la más específica que cubre el destino y el producto no tiene
        ninguna regla. Nunca es gratis.
      </p>
      {failure === null ? null : (
        <FailureNotice code={failure.code} reference={failure.reference} />
      )}
      {readOnly || value === zone.unmatchedProductBehavior ? null : (
        <div className={catalog.actions}>
          <button
            className={catalog.buttonPrimary}
            disabled={busy}
            onClick={() => void save()}
            type="button"
          >
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}
    </fieldset>
  );
}

/** Desenlace de un guardado de asignaciones. */
function Outcome({
  summary,
  label,
}: {
  readonly summary: ResultSummary;
  readonly label: (value: string) => string;
}) {
  return (
    <div aria-live="polite" className={summary.failed.length === 0 ? styles.ok : styles.warning}>
      <p>{describeSummary(summary)}</p>
      {summary.failed.length === 0 ? null : (
        <ul>
          {summary.failed.map((item) => (
            <li key={item.value}>
              {label(item.value)}:{' '}
              {item.code === null
                ? 'no se aplicó.'
                : (TARGET_FAILURE_LABELS[item.code as keyof typeof TARGET_FAILURE_LABELS] ??
                  'no se aplicó.')}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Guardar un cambio de asignaciones con claves estables.
 *
 * Las claves se generan al primer intento y se **conservan** mientras el desenlace sea incierto;
 * cambiar la selección es otra operación y empieza con claves nuevas.
 */
function useTargetSaver(rule: ShippingRule) {
  const router = useRouter();
  const { busy, run } = useExclusive();
  const keys = useRef<Map<number, string>>(new Map());
  const [failure, setFailure] = useState<Failure>(null);
  const [summary, setSummary] = useState<ResultSummary | null>(null);
  const [partial, setPartial] = useState<string | null>(null);

  function resetKeys() {
    keys.current = new Map();
  }

  async function save(add: readonly string[], remove: readonly string[]) {
    setFailure(null);
    setPartial(null);

    const outcome = await run(() =>
      applyTargets(rule, add, remove, (index) => {
        const existing = keys.current.get(index);

        if (existing !== undefined) return existing;

        const key = newIdempotencyKey();

        keys.current.set(index, key);

        return key;
      }),
    );

    if (outcome === null) return;
    if (!outcome.ok) {
      setFailure({ code: outcome.code, reference: outcome.reference });
      if (outcome.appliedBatches > 0) {
        setPartial(
          `Se aplicaron ${outcome.appliedBatches} de ${outcome.totalBatches} lotes antes del fallo (${describeSummary(outcome.partial)}).`,
        );
      }
      if (!['service_unavailable', 'internal_error', 'too_many_requests'].includes(outcome.code)) {
        resetKeys();
      }

      return;
    }

    resetKeys();
    setSummary(outcome.summary);
    router.refresh();
  }

  return { busy, failure, summary, partial, save, resetKeys };
}

/**
 * Asignaciones de una regla, página a página.
 *
 * El servidor pinta la primera; «Cargar más asignaciones» pide la siguiente al BFF con el cursor del
 * backend. Lo que se edita es lo cargado: nunca se supone que la regla cabe entera en memoria.
 */
function useTargetPages(rule: ShippingRule, first: readonly string[], firstNext: string | null) {
  const [values, setValues] = useState<readonly string[]>(first);
  const [next, setNext] = useState<string | null>(firstNext);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<Failure>(null);

  async function loadMore(onLoaded: (added: readonly string[]) => void) {
    if (next === null) return;

    setLoading(true);

    const result = await listTargets(rule.id, next);

    setLoading(false);

    if (!result.ok) {
      setProblem({ code: result.code, reference: result.reference });

      return;
    }

    const added = result.data.items.map((target) => target.value);

    setProblem(null);
    setValues((current) => [...current, ...added.filter((value) => !current.includes(value))]);
    setNext(result.data.nextPageToken);
    onLoaded(added);
  }

  return { values, next, loading, problem, loadMore };
}

function MoreTargets({
  pages,
  onLoaded,
}: {
  readonly pages: ReturnType<typeof useTargetPages>;
  readonly onLoaded: (added: readonly string[]) => void;
}) {
  return (
    <>
      {pages.problem === null ? null : (
        <FailureNotice code={pages.problem.code} reference={pages.problem.reference} />
      )}
      {pages.next === null ? null : (
        <button
          className={catalog.buttonSecondary}
          disabled={pages.loading}
          onClick={() => void pages.loadMore(onLoaded)}
          type="button"
        >
          {pages.loading ? 'Cargando…' : 'Cargar más asignaciones'}
        </button>
      )}
    </>
  );
}

function CategoryTargets({
  rule,
  saved: firstSaved,
  nextPageToken,
  categories,
  readOnly,
}: {
  readonly rule: ShippingRule;
  readonly saved: readonly string[];
  readonly nextPageToken: string | null;
  readonly categories: readonly CategoryOption[];
  readonly readOnly: boolean;
}) {
  const id = useId();
  const pages = useTargetPages(rule, firstSaved, nextPageToken);
  const saved = pages.values;
  const savedSet = new Set(saved);
  const [marked, setMarked] = useState<ReadonlySet<string>>(new Set(firstSaved));
  const saver = useTargetSaver(rule);
  const diff = diffTargets(savedSet, marked);
  const name = (slug: string) => categories.find((option) => option.slug === slug)?.name ?? slug;
  const known = new Set(categories.map((option) => option.slug));
  const orphans = saved.filter((slug) => !known.has(slug));

  return (
    <section aria-labelledby={`${id}-title`} className={styles.compareBox}>
      <h3 className={catalog.subTitle} id={`${id}-title`}>
        {rule.name} · {SCOPE_LABELS.categories}
      </h3>
      <p className={catalog.hint}>
        {describeRate(rule.rate)} · {rule.targetCount} categoría{rule.targetCount === 1 ? '' : 's'}{' '}
        asignada{rule.targetCount === 1 ? '' : 's'}.
      </p>
      {pages.next === null ? null : (
        <p className={catalog.hint}>
          Se muestran {saved.length} de {rule.targetCount} asignaciones. Carga las demás para
          revisarlas o retirarlas.
        </p>
      )}
      <fieldset className={styles.choices} disabled={readOnly || saver.busy}>
        <legend>Categorías</legend>
        {categories.length === 0 ? (
          <p className={catalog.hint}>No se pudo leer el catálogo de categorías.</p>
        ) : null}
        {[
          ...categories,
          ...orphans.map((slug) => ({ id: slug, slug, name: slug, status: 'archived' as const })),
        ].map((option) => {
          const archived = option.status === 'archived';

          return (
            <label className={styles.choice} key={option.slug}>
              <input
                checked={marked.has(option.slug)}
                disabled={archived && !marked.has(option.slug)}
                onChange={() => {
                  saver.resetKeys();
                  setMarked((current) => {
                    const next = new Set(current);

                    if (next.has(option.slug)) next.delete(option.slug);
                    else next.add(option.slug);

                    return next;
                  });
                }}
                type="checkbox"
              />
              <span className={styles.choiceText}>
                <span className={styles.choiceTitle}>{option.name}</span>
                <span className={styles.choiceHint}>
                  <span className={catalog.mono}>{option.slug}</span>
                  {archived ? ' · Archivada' : ''}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>
      <Comparison add={diff.add.map(name)} remove={diff.remove.map(name)} unchanged={[]} />
      {saver.failure === null ? null : (
        <FailureNotice code={saver.failure.code} reference={saver.failure.reference} />
      )}
      {saver.partial === null ? null : <p className={catalog.hint}>{saver.partial}</p>}
      {saver.summary === null ? null : <Outcome label={name} summary={saver.summary} />}
      {readOnly ? null : (
        <div className={catalog.actions}>
          <button
            className={catalog.buttonPrimary}
            disabled={saver.busy || diff.add.length + diff.remove.length === 0}
            onClick={() => void saver.save(diff.add, diff.remove)}
            type="button"
          >
            {saver.busy ? 'Guardando…' : 'Guardar categorías'}
          </button>
        </div>
      )}
    </section>
  );
}

function ProductTargets({
  rule,
  saved: firstSaved,
  nextPageToken,
  labels,
  readOnly,
}: {
  readonly rule: ShippingRule;
  readonly saved: readonly string[];
  readonly nextPageToken: string | null;
  readonly labels: Readonly<Record<string, ProductLabel>>;
  readonly readOnly: boolean;
}) {
  const id = useId();
  const pages = useTargetPages(rule, firstSaved, nextPageToken);
  const saved = pages.values;
  const savedSet = new Set(saved);
  const [keep, setKeep] = useState<ReadonlySet<string>>(new Set(firstSaved));
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [names, setNames] = useState<Readonly<Record<string, ProductLabel>>>(labels);
  const [adding, setAdding] = useState(false);
  const saver = useTargetSaver(rule);
  const plan = planAssignment([...picked], savedSet, 'add');
  const remove = saved.filter((value) => !keep.has(value));
  const label = (value: string) => {
    const known = names[value];

    if (known === undefined) return `Producto asignado (${value})`;

    return known.status === 'archived' ? `${known.name} (archivado)` : known.name;
  };

  return (
    <section aria-labelledby={`${id}-title`} className={styles.compareBox}>
      <h3 className={catalog.subTitle} id={`${id}-title`}>
        {rule.name} · {SCOPE_LABELS.products}
      </h3>
      <p className={catalog.hint}>
        {describeRate(rule.rate)} · {rule.targetCount} producto{rule.targetCount === 1 ? '' : 's'}{' '}
        asignado{rule.targetCount === 1 ? '' : 's'}.
      </p>
      {pages.next === null ? null : (
        <p className={catalog.hint}>
          Se muestran {saved.length} de {rule.targetCount} asignaciones. Carga las demás para
          revisarlas o retirarlas.
        </p>
      )}

      {saved.length === 0 ? (
        <p className={catalog.hint}>Ningún producto asignado todavía.</p>
      ) : (
        <fieldset className={styles.choices} disabled={readOnly || saver.busy}>
          <legend>Asignados (desmarca para retirar)</legend>
          {saved.map((value) => (
            <label className={styles.choice} key={value}>
              <input
                checked={keep.has(value)}
                onChange={() => {
                  saver.resetKeys();
                  setKeep((current) => {
                    const next = new Set(current);

                    if (next.has(value)) next.delete(value);
                    else next.add(value);

                    return next;
                  });
                }}
                type="checkbox"
              />
              <span className={styles.choiceText}>
                <span className={styles.choiceTitle}>{label(value)}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <MoreTargets
        onLoaded={(added) => setKeep((current) => new Set([...current, ...added]))}
        pages={pages}
      />

      {readOnly ? null : adding ? (
        <ProductPicker
          onChange={(next) => {
            saver.resetKeys();
            setPicked(next);
          }}
          onLoaded={(products) =>
            setNames((current) => {
              const next = { ...current };

              for (const product of products)
                next[product.id] = { name: product.name, status: product.status };

              return next;
            })
          }
          selected={picked}
        />
      ) : (
        <button className={catalog.buttonSecondary} onClick={() => setAdding(true)} type="button">
          Añadir productos
        </button>
      )}

      <Comparison
        add={plan.change.map(label)}
        remove={remove.map(label)}
        unchanged={plan.unchanged.map(label)}
      />
      {saver.failure === null ? null : (
        <FailureNotice code={saver.failure.code} reference={saver.failure.reference} />
      )}
      {saver.partial === null ? null : <p className={catalog.hint}>{saver.partial}</p>}
      {saver.summary === null ? null : <Outcome label={label} summary={saver.summary} />}
      {readOnly ? null : (
        <div className={catalog.actions}>
          <button
            className={catalog.buttonPrimary}
            disabled={saver.busy || plan.change.length + remove.length === 0}
            onClick={() => void saver.save(plan.change, remove)}
            type="button"
          >
            {saver.busy ? 'Guardando…' : 'Guardar productos'}
          </button>
        </div>
      )}
    </section>
  );
}

/** Resumen antes de guardar: qué se asigna, qué se retira y qué ya estaba así. */
export function Comparison({
  add,
  remove,
  unchanged,
  unchangedTitle = 'Ya estaban asignados',
}: {
  readonly add: readonly string[];
  readonly remove: readonly string[];
  readonly unchanged: readonly string[];
  readonly unchangedTitle?: string;
}) {
  if (add.length + remove.length + unchanged.length === 0) return null;

  const box = (title: string, items: readonly string[]) =>
    items.length === 0 ? null : (
      <div className={styles.compareBox}>
        <h4>
          {title} ({items.length})
        </h4>
        <ul>
          {items.slice(0, 12).map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
          {items.length > 12 ? <li>y {items.length - 12} más</li> : null}
        </ul>
      </div>
    );

  return (
    <div aria-live="polite" className={styles.compare}>
      {box('Se asignarán', add)}
      {box('Se retirarán', remove)}
      {box(unchangedTitle, unchanged)}
    </div>
  );
}
