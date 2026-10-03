/**
 * Asignar y retirar categorías o productos de una regla, en bloque.
 *
 * Antes de confirmar se enseña la comparación —qué cambia y qué ya estaba así—; al confirmar, los
 * cambios viajan en lotes de como mucho 400, cada uno con su propia clave de idempotencia y la
 * versión de la regla que devolvió el anterior. Después se resume lo que el backend respondió,
 * elemento por elemento, sin suponer nada: un elemento puede fallar y los demás aplicarse.
 *
 * Módulo puro.
 */

import type { ShippingTargetItemResult } from '@/lib/api/shipping';

export const TARGET_BATCH_MAX = 400;

export type AssignmentMode = 'add' | 'remove';

export type AssignmentPlan = {
  /** Lo que el backend cambiará. */
  readonly change: readonly string[];
  /** Lo que ya está como se pide: asignado al añadir, ausente al retirar. */
  readonly unchanged: readonly string[];
};

/** Compara la selección con lo que la regla ya tiene. Sin duplicados y en el orden elegido. */
export function planAssignment(
  selected: readonly string[],
  existing: ReadonlySet<string>,
  mode: AssignmentMode,
): AssignmentPlan {
  const unique = [...new Set(selected)];

  return mode === 'add'
    ? {
        change: unique.filter((value) => !existing.has(value)),
        unchanged: unique.filter((value) => existing.has(value)),
      }
    : {
        change: unique.filter((value) => existing.has(value)),
        unchanged: unique.filter((value) => !existing.has(value)),
      };
}

/** Diferencia entre lo guardado y lo marcado, para un editor de casillas. */
export function diffTargets(
  saved: ReadonlySet<string>,
  marked: ReadonlySet<string>,
): { readonly add: readonly string[]; readonly remove: readonly string[] } {
  return {
    add: [...marked].filter((value) => !saved.has(value)).sort(),
    remove: [...saved].filter((value) => !marked.has(value)).sort(),
  };
}

export type TargetBatch = { readonly add: readonly string[]; readonly remove: readonly string[] };

/** Lotes de como mucho {@link TARGET_BATCH_MAX} altas y otras tantas bajas. */
export function batchTargets(
  add: readonly string[],
  remove: readonly string[],
  max = TARGET_BATCH_MAX,
): TargetBatch[] {
  const batches: TargetBatch[] = [];
  const length = Math.max(Math.ceil(add.length / max), Math.ceil(remove.length / max));

  for (let index = 0; index < length; index += 1) {
    batches.push({
      add: add.slice(index * max, (index + 1) * max),
      remove: remove.slice(index * max, (index + 1) * max),
    });
  }

  return batches;
}

export type ResultSummary = {
  readonly added: number;
  readonly removed: number;
  readonly unchanged: number;
  readonly failed: readonly { readonly value: string; readonly code: string | null }[];
};

export function summariseResults(results: readonly ShippingTargetItemResult[]): ResultSummary {
  return {
    added: results.filter((result) => result.outcome === 'added').length,
    removed: results.filter((result) => result.outcome === 'removed').length,
    unchanged: results.filter((result) => result.outcome === 'unchanged').length,
    failed: results
      .filter((result) => result.outcome === 'failed')
      .map((result) => ({ value: result.value, code: result.code ?? null })),
  };
}

export function mergeSummaries(summaries: readonly ResultSummary[]): ResultSummary {
  return {
    added: summaries.reduce((total, summary) => total + summary.added, 0),
    removed: summaries.reduce((total, summary) => total + summary.removed, 0),
    unchanged: summaries.reduce((total, summary) => total + summary.unchanged, 0),
    failed: summaries.flatMap((summary) => summary.failed),
  };
}

/** Frase corta con el desenlace, para anunciarla. */
export function describeSummary(summary: ResultSummary): string {
  const parts: string[] = [];

  if (summary.added > 0) parts.push(`${summary.added} asignado${summary.added === 1 ? '' : 's'}`);
  if (summary.removed > 0)
    parts.push(`${summary.removed} retirado${summary.removed === 1 ? '' : 's'}`);
  if (summary.unchanged > 0) parts.push(`${summary.unchanged} sin cambios`);
  if (summary.failed.length > 0) {
    parts.push(`${summary.failed.length} no aplicado${summary.failed.length === 1 ? '' : 's'}`);
  }

  return parts.length === 0 ? 'No hubo cambios.' : `${parts.join(', ')}.`;
}
