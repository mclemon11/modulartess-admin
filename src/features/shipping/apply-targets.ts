/**
 * Aplica un cambio de asignaciones en lotes, en serie.
 *
 * Cada lote lleva la versión de la regla que devolvió el anterior y su propia clave de
 * idempotencia. Quien llama decide las claves —`keyFor`— para poder repetir **los mismos** lotes con
 * **las mismas** claves si el desenlace fue incierto: un lote que ya se aplicó vuelve como
 * `replayed` en lugar de aplicarse dos veces.
 */

import type { ShippingRule } from '@/lib/api/shipping';

import { changeTargets } from './shipping-client';
import { batchTargets, mergeSummaries, summariseResults, type ResultSummary } from './target-plan';

export type ApplyOutcome =
  | {
      readonly ok: true;
      readonly summary: ResultSummary;
      /** La regla tras el último lote; `null` si no había nada que mandar. */
      readonly rule: ShippingRule | null;
    }
  | {
      readonly ok: false;
      readonly code: string;
      readonly reference?: string | undefined;
      /** Lo que sí se aplicó antes del fallo. */
      readonly partial: ResultSummary;
      readonly appliedBatches: number;
      readonly totalBatches: number;
    };

export async function applyTargets(
  rule: Pick<ShippingRule, 'id' | 'version'>,
  add: readonly string[],
  remove: readonly string[],
  keyFor: (batchIndex: number) => string,
): Promise<ApplyOutcome> {
  const batches = batchTargets(add, remove);
  const summaries: ResultSummary[] = [];
  let version = rule.version;
  let latest: ShippingRule | null = null;

  for (const [index, batch] of batches.entries()) {
    const result = await changeTargets(rule.id, {
      idempotencyKey: keyFor(index),
      expectedVersion: version,
      add: batch.add,
      remove: batch.remove,
    });

    if (!result.ok) {
      return {
        ok: false,
        code: result.code,
        reference: result.reference,
        partial: mergeSummaries(summaries),
        appliedBatches: index,
        totalBatches: batches.length,
      };
    }

    summaries.push(summariseResults(result.data.results));
    version = result.data.rule.version;
    latest = result.data.rule;
  }

  return { ok: true, summary: mergeSummaries(summaries), rule: latest };
}
