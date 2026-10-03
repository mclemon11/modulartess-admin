'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import catalog from '@/features/panel/catalog.module.css';
import type {
  GeographyDepartment,
  GeographyMunicipality,
  ShippingCoverageEntry,
  ShippingZone,
} from '@/lib/api/shipping';

import {
  ariaChecked,
  batchCoverage,
  coverageFromEntries,
  departmentCounts,
  departmentState,
  diffCoverage,
  isCovered,
  isEmptyCoverage,
  isEmptyDiff,
  municipalityState,
  setNational,
  toggleDepartment,
  toggleMunicipality,
  type CoverageDraft,
  type MunicipalityState,
  type TriState,
} from './coverage-model';
import { FailureNotice } from './failure-notice';
import { changeCoverage, listMunicipalities, searchMunicipalities } from './shipping-client';
import { normaliseText } from './zone-list';
import { stepHref } from './zone-form-model';
import styles from './shipping.module.css';
import { useExclusive } from './use-exclusive';

/** Municipios que se pintan a la vez dentro de un departamento. Nunca los 1.122. */
export const MUNICIPALITY_PAGE = 50;
const CHANGES_MAX = 400;

type Failure = { readonly code: string; readonly reference?: string | undefined } | null;

type Loaded =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly code: string }
  | { readonly kind: 'ready'; readonly items: readonly GeographyMunicipality[] };

const TYPE_SUFFIX: Readonly<Record<GeographyMunicipality['type'], string>> = {
  municipality: '',
  non_municipalized_area: ' · área no municipalizada',
  island: ' · isla',
};

const MUNICIPALITY_TAGS: Readonly<Record<MunicipalityState, string | null>> = {
  individual: 'Municipio específico',
  department: 'Por departamento completo',
  national: 'Por respaldo nacional',
  excluded: 'Excluido',
  none: null,
};

const TRI_WORDS: Readonly<Record<TriState, string>> = {
  full: 'completo',
  partial: 'selección parcial',
  none: 'sin seleccionar',
};

/**
 * Paso 2, «Cobertura»: a dónde se envía, por código DIVIPOLA.
 *
 * - Respaldo nacional: todo el país, con exclusiones municipales si hacen falta.
 * - Departamentos completos, con exclusiones municipales.
 * - Municipios específicos, que conservan su código.
 *
 * Cada departamento tiene una casilla de tres estados —ninguno, selección parcial, completo— que
 * se anuncia como `mixed` cuando es parcial. Los municipios de un departamento se piden al
 * desplegarlo, uno a la vez y en páginas de {@link MUNICIPALITY_PAGE}; el buscador consulta al BFF
 * y devuelve unas decenas. Así el DOM nunca carga los 1.122 municipios.
 *
 * Los nombres son oficiales y solo se pintan: lo que viaja son los códigos.
 */
export function CoverageEditor({
  zone,
  departments,
  entries,
  knownNames,
  readOnly,
}: {
  readonly zone: ShippingZone;
  readonly departments: readonly GeographyDepartment[];
  readonly entries: readonly ShippingCoverageEntry[];
  /** Nombres de los municipios que ya están en la cobertura, por código. */
  readonly knownNames: Readonly<Record<string, string>>;
  readonly readOnly: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const initial = useMemo(() => coverageFromEntries(entries), [entries]);
  const [draft, setDraft] = useState<CoverageDraft>(initial);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Readonly<Record<string, Loaded>>>({});
  const [names, setNames] = useState<Readonly<Record<string, string>>>(knownNames);
  const [failure, setFailure] = useState<Failure>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const { busy, run } = useExclusive();

  const departmentName = useMemo(
    () => new Map(departments.map((department) => [department.code, department.name])),
    [departments],
  );
  const diff = useMemo(() => diffCoverage(initial, draft), [initial, draft]);

  // Estable: el buscador lo tiene en las dependencias de su efecto.
  const remember = useCallback((items: readonly GeographyMunicipality[]) => {
    setNames((current) => {
      const next = { ...current };

      for (const item of items) next[item.code] = item.name;

      return next;
    });
  }, []);

  async function expand(code: string) {
    if (expanded === code) {
      setExpanded(null);

      return;
    }

    setExpanded(code);

    if (loaded[code]?.kind === 'ready') return;

    setLoaded((current) => ({ ...current, [code]: { kind: 'loading' } }));

    const result = await listMunicipalities(code);

    if (!result.ok) {
      setLoaded((current) => ({ ...current, [code]: { kind: 'error', code: result.code } }));

      return;
    }

    remember(result.data.items);
    setLoaded((current) => ({ ...current, [code]: { kind: 'ready', items: result.data.items } }));
  }

  async function save(continueToNext: boolean) {
    const batches = batchCoverage(diff, CHANGES_MAX);

    if (batches.length === 0) {
      if (continueToNext) router.push(stepHref(zone.id, 'tarifas'));

      return;
    }

    setFailure(null);

    const outcome = await run(async () => {
      let version = zone.version;

      for (const [index, batch] of batches.entries()) {
        if (batches.length > 1) setProgress(`Guardando lote ${index + 1} de ${batches.length}…`);

        const result = await changeCoverage(zone.id, {
          expectedVersion: version,
          add: batch.add,
          remove: batch.remove,
        });

        if (!result.ok) return { ok: false as const, result, applied: index };

        version = result.data.zone.version;
      }

      return { ok: true as const, version };
    });

    setProgress(null);

    if (outcome === null) return;
    if (!outcome.ok) {
      setFailure({ code: outcome.result.code, reference: outcome.result.reference });
      if (outcome.applied > 0) {
        setProgress(
          `Se guardaron ${outcome.applied} de ${batches.length} lotes antes del fallo. Recarga para ver la cobertura actual.`,
        );
      }

      return;
    }

    if (continueToNext) router.push(stepHref(zone.id, 'tarifas'));
    else router.refresh();
  }

  return (
    <section aria-labelledby={`${id}-title`} className={`${catalog.card} ${catalog.cardPad}`}>
      <h2 className={catalog.sectionTitle} id={`${id}-title`}>
        Cobertura
      </h2>
      <p className={catalog.hint}>
        Un destino se resuelve por el nivel más específico: municipio, después departamento y por
        último el respaldo nacional. Un municipio que ninguna zona activa cubre queda en cotización
        manual o no disponible, nunca gratis.
      </p>

      <fieldset className={styles.choices} disabled={readOnly}>
        <legend>Tipo de cobertura</legend>
        <label className={styles.choice}>
          <input
            checked={!draft.national}
            name={`${id}-mode`}
            onChange={() => setDraft((current) => setNational(current, false))}
            type="radio"
          />
          <span className={styles.choiceText}>
            <span className={styles.choiceTitle}>Departamentos y municipios</span>
            <span className={styles.choiceHint}>
              Departamentos completos, municipios específicos y exclusiones.
            </span>
          </span>
        </label>
        <label className={styles.choice}>
          <input
            checked={draft.national}
            name={`${id}-mode`}
            onChange={() => setDraft((current) => setNational(current, true))}
            type="radio"
          />
          <span className={styles.choiceText}>
            <span className={styles.choiceTitle}>Respaldo nacional</span>
            <span className={styles.choiceHint}>
              Todo el país, como último recurso. No se combina con departamentos ni municipios;
              admite exclusiones.
            </span>
          </span>
        </label>
      </fieldset>

      <GeographySearch
        departments={departments}
        departmentName={departmentName}
        draft={draft}
        onRemember={remember}
        onToggleDepartment={(code) => setDraft((current) => toggleDepartment(current, code))}
        onToggleMunicipality={(code) => setDraft((current) => toggleMunicipality(current, code))}
        readOnly={readOnly}
      />

      <h3 className={catalog.subTitle} id={`${id}-tree`}>
        Departamentos
      </h3>
      <ul aria-labelledby={`${id}-tree`} className={styles.tree}>
        {departments.map((department) => (
          <DepartmentNode
            department={department}
            draft={draft}
            expanded={expanded === department.code}
            key={department.code}
            loaded={loaded[department.code]}
            onExpand={() => void expand(department.code)}
            onToggle={() => setDraft((current) => toggleDepartment(current, department.code))}
            onToggleMunicipality={(code) =>
              setDraft((current) => toggleMunicipality(current, code))
            }
            readOnly={readOnly}
          />
        ))}
      </ul>

      <SelectedSummary departmentName={departmentName} draft={draft} names={names} />

      <div className={styles.infoBox}>
        <label className={catalog.label} htmlFor={`${id}-complement`}>
          Vereda, corregimiento o caserío
        </label>
        <input
          aria-describedby={`${id}-complement-hint`}
          className={catalog.input}
          disabled
          id={`${id}-complement`}
          placeholder="Se captura después, en la dirección"
          readOnly
        />
        <p className={catalog.hint} id={`${id}-complement-hint`}>
          Informativo: no es un nivel tarifario. El comprador lo escribe como complemento de la
          dirección; la tarifa se decide por el municipio.
        </p>
      </div>

      <div aria-live="polite">
        {isEmptyDiff(diff) ? null : (
          <p className={catalog.notice}>
            Cambios sin guardar: {diff.add.length} alta{diff.add.length === 1 ? '' : 's'} y{' '}
            {diff.remove.length} baja{diff.remove.length === 1 ? '' : 's'}.
          </p>
        )}
        {isEmptyCoverage(draft) ? (
          <p className={catalog.hint}>
            La zona no tiene cobertura: no se podrá activar hasta que cubra algún destino.
          </p>
        ) : null}
        {progress === null ? null : <p className={catalog.hint}>{progress}</p>}
      </div>
      {failure === null ? null : (
        <FailureNotice code={failure.code} reference={failure.reference} />
      )}

      {readOnly ? null : (
        <div className={styles.stepNav}>
          <span className={catalog.actions}>
            <button
              className={catalog.buttonSecondary}
              disabled={busy || isEmptyDiff(diff)}
              onClick={() => setDraft(initial)}
              type="button"
            >
              Descartar cambios
            </button>
            <button
              className={catalog.buttonSecondary}
              disabled={busy || isEmptyDiff(diff)}
              onClick={() => void save(false)}
              type="button"
            >
              Guardar borrador
            </button>
          </span>
          <button
            className={catalog.buttonPrimary}
            disabled={busy}
            onClick={() => void save(true)}
            type="button"
          >
            {busy ? 'Guardando…' : 'Guardar y seguir'}
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * Casilla de tres estados.
 *
 * `role="checkbox"` con `aria-checked` en `true`, `false` o `mixed`: así un lector de pantalla
 * anuncia «parcialmente marcada». El símbolo dentro de la caja repite el estado sin depender del
 * color. Es un `button`, así que Espacio y Enter la pulsan.
 */
export function TriCheckbox({
  state,
  label,
  disabled,
  onToggle,
}: {
  readonly state: TriState;
  readonly label: string;
  readonly disabled: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <span className={styles.triHit}>
      <button
        aria-checked={ariaChecked(state)}
        aria-label={label}
        className={styles.tri}
        disabled={disabled}
        onClick={onToggle}
        role="checkbox"
        type="button"
      >
        <span aria-hidden="true">{state === 'full' ? '✓' : state === 'partial' ? '–' : ''}</span>
      </button>
    </span>
  );
}

function departmentMeta(draft: CoverageDraft, code: string): string {
  const state = departmentState(draft, code);
  const counts = departmentCounts(draft, code);
  const whole = draft.national || draft.departments.has(code);

  if (whole) {
    const base = draft.national ? 'Por respaldo nacional' : 'Departamento completo';

    return counts.exclusions === 0
      ? base
      : `${base}, ${counts.exclusions} exclusión${counts.exclusions === 1 ? '' : 'es'}`;
  }

  if (state === 'partial') {
    return `${counts.municipalities} municipio${counts.municipalities === 1 ? '' : 's'} específico${counts.municipalities === 1 ? '' : 's'}`;
  }

  return 'Sin cobertura';
}

function DepartmentNode({
  department,
  draft,
  expanded,
  loaded,
  readOnly,
  onExpand,
  onToggle,
  onToggleMunicipality,
}: {
  readonly department: GeographyDepartment;
  readonly draft: CoverageDraft;
  readonly expanded: boolean;
  readonly loaded: Loaded | undefined;
  readonly readOnly: boolean;
  readonly onExpand: () => void;
  readonly onToggle: () => void;
  readonly onToggleMunicipality: (code: string) => void;
}) {
  const childrenId = useId();
  const state = departmentState(draft, department.code);

  return (
    <li className={styles.treeItem}>
      <div className={styles.treeRow}>
        <TriCheckbox
          disabled={readOnly || draft.national}
          label={`${department.name}: ${TRI_WORDS[state]}`}
          onToggle={onToggle}
          state={state}
        />
        <span className={styles.treeLabel}>
          <span className={styles.treeName}>{department.name}</span>
          <span className={styles.treeMeta}>
            {departmentMeta(draft, department.code)} ·{' '}
            <span className={catalog.mono}>{department.code}</span>
          </span>
        </span>
        <button
          aria-controls={childrenId}
          aria-expanded={expanded}
          className={styles.treeToggle}
          onClick={onExpand}
          type="button"
        >
          {expanded ? 'Ocultar' : 'Municipios'}
          <span className="sr-only"> de {department.name}</span>
        </button>
      </div>
      {expanded ? (
        <div id={childrenId}>
          <MunicipalityList
            departmentName={department.name}
            draft={draft}
            loaded={loaded}
            onToggle={onToggleMunicipality}
            readOnly={readOnly}
          />
        </div>
      ) : null}
    </li>
  );
}

function MunicipalityList({
  departmentName,
  draft,
  loaded,
  readOnly,
  onToggle,
}: {
  readonly departmentName: string;
  readonly draft: CoverageDraft;
  readonly loaded: Loaded | undefined;
  readonly readOnly: boolean;
  readonly onToggle: (code: string) => void;
}) {
  const filterId = useId();
  const [filter, setFilter] = useState('');
  const [visible, setVisible] = useState(MUNICIPALITY_PAGE);

  if (loaded === undefined || loaded.kind === 'loading') {
    return (
      <p className={catalog.hint} role="status">
        Cargando municipios de {departmentName}…
      </p>
    );
  }

  if (loaded.kind === 'error') {
    return <FailureNotice code={loaded.code} />;
  }

  const needle = normaliseText(filter);
  const matching = loaded.items.filter(
    (item) =>
      needle === '' || normaliseText(item.name).includes(needle) || item.code.includes(needle),
  );
  const shown = matching.slice(0, visible);

  return (
    <>
      <div className={`${catalog.field} ${styles.childFilter}`}>
        <label className={catalog.label} htmlFor={filterId}>
          Filtrar municipios de {departmentName}
        </label>
        <input
          className={catalog.input}
          id={filterId}
          onChange={(event) => {
            setFilter(event.target.value);
            setVisible(MUNICIPALITY_PAGE);
          }}
          type="search"
          value={filter}
        />
        <span className={catalog.hint} role="status">
          {matching.length} de {loaded.items.length} municipios
          {shown.length < matching.length ? `; se muestran ${shown.length}` : ''}.
        </span>
      </div>
      <ul className={styles.treeChildren}>
        {shown.map((municipality) => (
          <MunicipalityRow
            draft={draft}
            key={municipality.code}
            municipality={municipality}
            onToggle={onToggle}
            readOnly={readOnly}
          />
        ))}
      </ul>
      {shown.length < matching.length ? (
        <button
          className={catalog.buttonSecondary}
          onClick={() => setVisible((current) => current + MUNICIPALITY_PAGE)}
          type="button"
        >
          Mostrar {Math.min(MUNICIPALITY_PAGE, matching.length - shown.length)} más
        </button>
      ) : null}
    </>
  );
}

function MunicipalityRow({
  municipality,
  draft,
  readOnly,
  onToggle,
  departmentName,
}: {
  readonly municipality: GeographyMunicipality;
  readonly draft: CoverageDraft;
  readonly readOnly: boolean;
  readonly onToggle: (code: string) => void;
  readonly departmentName?: string;
}) {
  const state = municipalityState(draft, municipality.code);
  const tag = MUNICIPALITY_TAGS[state];

  return (
    <li className={styles.treeRow}>
      <TriCheckbox
        disabled={readOnly}
        label={`${municipality.name}${departmentName === undefined ? '' : `, ${departmentName}`}: ${
          state === 'excluded' ? 'excluido' : isCovered(state) ? 'incluido' : 'sin seleccionar'
        }`}
        onToggle={() => onToggle(municipality.code)}
        state={isCovered(state) ? 'full' : 'none'}
      />
      <span className={styles.treeLabel}>
        <span className={styles.treeName}>
          {municipality.name}
          {departmentName === undefined ? '' : ` — ${departmentName}`}
        </span>
        <span className={styles.treeMeta}>
          <span className={catalog.mono}>{municipality.code}</span>
          {TYPE_SUFFIX[municipality.type]}
        </span>
      </span>
      {tag === null ? null : (
        <span className={state === 'excluded' ? styles.stateTagExcluded : styles.stateTag}>
          {tag}
        </span>
      )}
    </li>
  );
}

function GeographySearch({
  departments,
  departmentName,
  draft,
  readOnly,
  onToggleDepartment,
  onToggleMunicipality,
  onRemember,
}: {
  readonly departments: readonly GeographyDepartment[];
  readonly departmentName: ReadonlyMap<string, string>;
  readonly draft: CoverageDraft;
  readonly readOnly: boolean;
  readonly onToggleDepartment: (code: string) => void;
  readonly onToggleMunicipality: (code: string) => void;
  readonly onRemember: (items: readonly GeographyMunicipality[]) => void;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [results, setResults] = useState<readonly GeographyMunicipality[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const latest = useRef(0);
  const needle = normaliseText(text);
  const departmentHits =
    needle.length < 2
      ? []
      : departments.filter((department) => normaliseText(department.name).includes(needle));

  useEffect(() => {
    if (needle.length < 2) return;

    const ticket = latest.current + 1;

    latest.current = ticket;

    const timer = setTimeout(() => {
      void searchMunicipalities(needle).then((result) => {
        if (latest.current !== ticket) return;
        if (!result.ok) {
          setProblem(result.code);
          setResults([]);

          return;
        }

        setProblem(null);
        setResults(result.data.items);
        onRemember(result.data.items);
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [needle, onRemember]);

  const visibleResults = needle.length < 2 ? [] : results;

  return (
    <div className={catalog.field}>
      <label className={catalog.label} htmlFor={`${id}-q`}>
        Buscar departamento o municipio
      </label>
      <input
        aria-controls={`${id}-results`}
        aria-describedby={`${id}-hint`}
        className={catalog.input}
        disabled={readOnly}
        id={`${id}-q`}
        onChange={(event) => setText(event.target.value)}
        placeholder="Ej.: Medellín, Boyacá, Leticia"
        type="search"
        value={text}
      />
      <span className={catalog.hint} id={`${id}-hint`} role="status">
        {needle.length < 2
          ? 'Escribe al menos dos letras. Se busca en la división oficial (DIVIPOLA).'
          : `${departmentHits.length + visibleResults.length} resultado${
              departmentHits.length + visibleResults.length === 1 ? '' : 's'
            }.`}
      </span>
      {problem === null || needle.length < 2 ? null : <FailureNotice code={problem} />}
      {departmentHits.length + visibleResults.length === 0 ? null : (
        <ul className={styles.searchResults} id={`${id}-results`}>
          {departmentHits.map((department) => {
            const state = departmentState(draft, department.code);

            return (
              <li className={styles.treeRow} key={department.code}>
                <TriCheckbox
                  disabled={readOnly || draft.national}
                  label={`${department.name}, departamento: ${TRI_WORDS[state]}`}
                  onToggle={() => onToggleDepartment(department.code)}
                  state={state}
                />
                <span className={styles.treeLabel}>
                  <span className={styles.treeName}>{department.name}</span>
                  <span className={styles.treeMeta}>
                    Departamento · <span className={catalog.mono}>{department.code}</span>
                  </span>
                </span>
              </li>
            );
          })}
          {visibleResults.map((municipality) => (
            <MunicipalityRow
              departmentName={
                departmentName.get(municipality.departmentCode) ?? municipality.departmentCode
              }
              draft={draft}
              key={municipality.code}
              municipality={municipality}
              onToggle={onToggleMunicipality}
              readOnly={readOnly}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SelectedSummary({
  draft,
  names,
  departmentName,
}: {
  readonly draft: CoverageDraft;
  readonly names: Readonly<Record<string, string>>;
  readonly departmentName: ReadonlyMap<string, string>;
}) {
  const label = (code: string) => `${names[code] ?? 'Municipio'} (${code})`;
  const municipalities = [...draft.municipalities].sort();
  const exclusions = [...draft.exclusions].sort();
  const whole = [...draft.departments].sort();

  return (
    <div className={catalog.field}>
      <h3 className={catalog.subTitle}>Selección actual</h3>
      {isEmptyCoverage(draft) ? <p className={catalog.hint}>Nada seleccionado.</p> : null}
      {draft.national ? <p>Respaldo nacional: todo el país.</p> : null}
      {whole.length > 0 ? (
        <>
          <p className={catalog.hint}>Departamentos completos ({whole.length})</p>
          <ul className={styles.chips}>
            {whole.map((code) => (
              <li className={styles.chip} key={code}>
                {departmentName.get(code) ?? code}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {municipalities.length > 0 ? (
        <>
          <p className={catalog.hint}>Municipios específicos ({municipalities.length})</p>
          <ul className={styles.chips}>
            {municipalities.map((code) => (
              <li className={styles.chip} key={code}>
                {label(code)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {exclusions.length > 0 ? (
        <>
          <p className={catalog.hint}>Exclusiones ({exclusions.length})</p>
          <ul className={styles.chips}>
            {exclusions.map((code) => (
              <li className={styles.chipExcluded} key={code}>
                <span className="sr-only">Excluido: </span>
                {label(code)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
