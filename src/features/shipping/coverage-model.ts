/**
 * Cobertura de una zona mientras se edita, por **código DIVIPOLA**, nunca por nombre.
 *
 * Reproduce la forma del contrato —respaldo nacional, departamentos completos, municipios sueltos y
 * exclusiones municipales— y sus reglas de coherencia, para que el borrador no pueda describir algo
 * que el backend rechazaría:
 *
 *   - el respaldo nacional no convive con departamentos ni municipios sueltos;
 *   - un municipio suelto no pertenece a un departamento incluido;
 *   - una exclusión solo existe dentro de algo incluido (un departamento o el respaldo nacional).
 *
 * Las operaciones mantienen esas reglas por construcción. La autoridad sigue siendo el backend: si
 * algo se le escapa a este módulo, la petición vuelve con `shipping_invalid`.
 *
 * Módulo puro: entra un borrador, sale otro.
 */

import type { ShippingCoverageChange, ShippingCoverageEntry } from '@/lib/api/shipping';

/** Código del país en las entradas `national`, tal como lo publica el contrato. */
export const NATIONAL_CODE = 'CO';

export type CoverageDraft = {
  readonly national: boolean;
  readonly departments: ReadonlySet<string>;
  readonly municipalities: ReadonlySet<string>;
  readonly exclusions: ReadonlySet<string>;
};

export const EMPTY_COVERAGE: CoverageDraft = {
  national: false,
  departments: new Set(),
  municipalities: new Set(),
  exclusions: new Set(),
};

const DEPARTMENT_CODE = /^\d{2}$/;
const MUNICIPALITY_CODE = /^\d{5}$/;

export function isDepartmentCode(value: string): boolean {
  return DEPARTMENT_CODE.test(value);
}

export function isMunicipalityCode(value: string): boolean {
  return MUNICIPALITY_CODE.test(value);
}

/** El departamento de un municipio: los dos primeros dígitos de su código DIVIPOLA. */
export function departmentOf(municipalityCode: string): string {
  return municipalityCode.slice(0, 2);
}

/** Borrador a partir de las entradas que devuelve el backend. Ignora códigos mal formados. */
export function coverageFromEntries(
  entries: readonly Pick<ShippingCoverageEntry, 'kind' | 'code'>[],
): CoverageDraft {
  const departments = new Set<string>();
  const municipalities = new Set<string>();
  const exclusions = new Set<string>();
  let national = false;

  for (const entry of entries) {
    if (entry.kind === 'national' && entry.code === NATIONAL_CODE) national = true;
    else if (entry.kind === 'department' && isDepartmentCode(entry.code)) {
      departments.add(entry.code);
    } else if (entry.kind === 'municipality' && isMunicipalityCode(entry.code)) {
      municipalities.add(entry.code);
    } else if (entry.kind === 'exclusion' && isMunicipalityCode(entry.code)) {
      exclusions.add(entry.code);
    }
  }

  return { national, departments, municipalities, exclusions };
}

export function isEmptyCoverage(draft: CoverageDraft): boolean {
  return !draft.national && draft.departments.size === 0 && draft.municipalities.size === 0;
}

/**
 * Estado del departamento para su casilla de tres estados.
 *
 * - `full`: el departamento entero está cubierto —completo o por respaldo nacional— sin exclusiones.
 * - `partial`: hay municipios sueltos de ese departamento, o está cubierto con alguna exclusión.
 * - `none`: nada de ese departamento.
 */
export type TriState = 'none' | 'partial' | 'full';

function someIn(codes: ReadonlySet<string>, departmentCode: string): number {
  let count = 0;

  for (const code of codes) if (departmentOf(code) === departmentCode) count += 1;

  return count;
}

export function departmentState(draft: CoverageDraft, departmentCode: string): TriState {
  const whole = draft.national || draft.departments.has(departmentCode);

  if (whole) return someIn(draft.exclusions, departmentCode) > 0 ? 'partial' : 'full';

  return someIn(draft.municipalities, departmentCode) > 0 ? 'partial' : 'none';
}

/** `aria-checked` de la casilla: `mixed` es lo que un lector de pantalla anuncia como parcial. */
export function ariaChecked(state: TriState): 'true' | 'false' | 'mixed' {
  return state === 'full' ? 'true' : state === 'partial' ? 'mixed' : 'false';
}

/** Cuántos municipios del departamento están sueltos y cuántos excluidos. */
export function departmentCounts(
  draft: CoverageDraft,
  departmentCode: string,
): { readonly municipalities: number; readonly exclusions: number } {
  return {
    municipalities: someIn(draft.municipalities, departmentCode),
    exclusions: someIn(draft.exclusions, departmentCode),
  };
}

function without(codes: ReadonlySet<string>, departmentCode: string): Set<string> {
  return new Set([...codes].filter((code) => departmentOf(code) !== departmentCode));
}

/**
 * Pulsar la casilla del departamento.
 *
 * Ninguno o parcial pasa a completo —se quitan sus municipios sueltos y sus exclusiones, porque un
 * departamento completo los absorbe—; completo pasa a ninguno. Con respaldo nacional la casilla no
 * cambia nada: el país entero ya está cubierto y lo que se edita son exclusiones.
 */
export function toggleDepartment(draft: CoverageDraft, departmentCode: string): CoverageDraft {
  if (draft.national) return draft;

  const state = departmentState(draft, departmentCode);
  const departments = new Set(draft.departments);
  const municipalities = without(draft.municipalities, departmentCode);
  const exclusions = without(draft.exclusions, departmentCode);

  if (state === 'full') departments.delete(departmentCode);
  else departments.add(departmentCode);

  return { national: false, departments, municipalities, exclusions };
}

export type MunicipalityState =
  /** Elegido por sí mismo, como municipio específico. */
  | 'individual'
  /** Cubierto porque su departamento está completo. */
  | 'department'
  /** Cubierto por el respaldo nacional. */
  | 'national'
  /** Dentro de la cobertura, pero excluido. */
  | 'excluded'
  /** Fuera. */
  | 'none';

export function municipalityState(draft: CoverageDraft, code: string): MunicipalityState {
  if (draft.municipalities.has(code)) return 'individual';

  const inside = draft.national || draft.departments.has(departmentOf(code));

  if (!inside) return 'none';

  return draft.exclusions.has(code) ? 'excluded' : draft.national ? 'national' : 'department';
}

export function isCovered(state: MunicipalityState): boolean {
  return state === 'individual' || state === 'department' || state === 'national';
}

/**
 * Pulsar la casilla de un municipio.
 *
 * Dentro de un departamento completo o del respaldo nacional, desmarcarlo lo **excluye** y volver a
 * marcarlo quita la exclusión. Fuera de ellos, se añade o se quita como municipio específico.
 */
export function toggleMunicipality(draft: CoverageDraft, code: string): CoverageDraft {
  const state = municipalityState(draft, code);
  const municipalities = new Set(draft.municipalities);
  const exclusions = new Set(draft.exclusions);

  switch (state) {
    case 'individual':
      municipalities.delete(code);
      break;
    case 'department':
    case 'national':
      exclusions.add(code);
      break;
    case 'excluded':
      exclusions.delete(code);
      break;
    case 'none':
      municipalities.add(code);
      break;
  }

  return { ...draft, municipalities, exclusions };
}

/**
 * Activar o desactivar el respaldo nacional.
 *
 * Activarlo sustituye departamentos y municipios —no conviven— y conserva las exclusiones, que
 * siguen dentro de la cobertura. Desactivarlo deja la zona sin cobertura y sin exclusiones, que ya
 * no estarían dentro de nada.
 */
export function setNational(draft: CoverageDraft, national: boolean): CoverageDraft {
  if (national === draft.national) return draft;

  if (national) {
    const exclusions = new Set(
      [...draft.exclusions].filter((code) => draft.departments.has(departmentOf(code))),
    );

    return { national: true, departments: new Set(), municipalities: new Set(), exclusions };
  }

  return EMPTY_COVERAGE;
}

export type CoverageDiff = {
  readonly add: readonly ShippingCoverageChange[];
  readonly remove: readonly ShippingCoverageChange[];
};

function entries(draft: CoverageDraft): ShippingCoverageChange[] {
  return [
    ...(draft.national ? [{ kind: 'national' as const, code: NATIONAL_CODE }] : []),
    ...[...draft.departments].sort().map((code) => ({ kind: 'department' as const, code })),
    ...[...draft.municipalities].sort().map((code) => ({ kind: 'municipality' as const, code })),
    ...[...draft.exclusions].sort().map((code) => ({ kind: 'exclusion' as const, code })),
  ];
}

const key = (change: ShippingCoverageChange) => `${change.kind}:${change.code}`;

/** Lo que hay que añadir y quitar para pasar de `before` a `after`. */
export function diffCoverage(before: CoverageDraft, after: CoverageDraft): CoverageDiff {
  const was = new Map(entries(before).map((change) => [key(change), change]));
  const will = new Map(entries(after).map((change) => [key(change), change]));

  return {
    add: [...will].filter(([id]) => !was.has(id)).map(([, change]) => change),
    remove: [...was].filter(([id]) => !will.has(id)).map(([, change]) => change),
  };
}

export function isEmptyDiff(diff: CoverageDiff): boolean {
  return diff.add.length === 0 && diff.remove.length === 0;
}

/** Orden de las bajas: las exclusiones antes que lo que las contiene. */
const REMOVE_ORDER = { exclusion: 0, municipality: 1, department: 2, national: 3 } as const;
/** Orden de las altas: lo que contiene antes que sus exclusiones. */
const ADD_ORDER = { national: 0, department: 1, municipality: 2, exclusion: 3 } as const;

export type CoverageBatch = CoverageDiff;

/**
 * Parte el cambio en peticiones de como mucho `max` altas y `max` bajas.
 *
 * Si cabe, es **una sola** petición: el backend aplica las bajas antes que las altas, así que
 * cambiar un municipio por su departamento completo cabe junto. Si no cabe, primero todas las bajas
 * —exclusiones antes que su departamento— y después todas las altas —departamentos antes que sus
 * exclusiones—, para que cada paso intermedio también sea una cobertura coherente.
 */
export function batchCoverage(diff: CoverageDiff, max: number): CoverageBatch[] {
  if (diff.add.length <= max && diff.remove.length <= max) {
    return isEmptyDiff(diff) ? [] : [diff];
  }

  const removals = [...diff.remove].sort((a, b) => REMOVE_ORDER[a.kind] - REMOVE_ORDER[b.kind]);
  const additions = [...diff.add].sort((a, b) => ADD_ORDER[a.kind] - ADD_ORDER[b.kind]);
  const batches: CoverageBatch[] = [];

  for (let index = 0; index < removals.length; index += max) {
    batches.push({ add: [], remove: removals.slice(index, index + max) });
  }

  for (let index = 0; index < additions.length; index += max) {
    batches.push({ add: additions.slice(index, index + max), remove: [] });
  }

  return batches;
}

export type CoverageSummaryLine = {
  readonly departmentCode: string;
  readonly mode: 'whole' | 'national' | 'municipalities';
  readonly municipalities: readonly string[];
  readonly exclusions: readonly string[];
};

/**
 * Resumen legible por departamento, para la revisión. Solo los departamentos con algo que decir:
 * completos, con municipios sueltos o con exclusiones.
 */
export function summariseCoverage(draft: CoverageDraft): CoverageSummaryLine[] {
  const codes = new Set<string>([
    ...draft.departments,
    ...[...draft.municipalities].map(departmentOf),
    ...[...draft.exclusions].map(departmentOf),
  ]);

  return [...codes].sort().map((departmentCode) => ({
    departmentCode,
    mode: draft.departments.has(departmentCode)
      ? 'whole'
      : draft.national
        ? 'national'
        : 'municipalities',
    municipalities: [...draft.municipalities]
      .filter((code) => departmentOf(code) === departmentCode)
      .sort(),
    exclusions: [...draft.exclusions]
      .filter((code) => departmentOf(code) === departmentCode)
      .sort(),
  }));
}
