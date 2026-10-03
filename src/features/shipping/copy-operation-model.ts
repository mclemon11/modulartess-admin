/**
 * Qué se puede hacer con una operación de copia en cada estado, y cómo decirlo.
 *
 * El contrato: reanudar continúa desde el cursor guardado y, en una copia terminada, devuelve su
 * zona otra vez; descartar borra lo copiado y, en una descartada, devuelve su zona otra vez.
 * Reanudar una descartada o descartar una terminada es `409 shipping_transition_invalid`. Aquí solo
 * se ofrece lo que tiene sentido; el backend sigue siendo la autoridad.
 *
 * Módulo puro.
 */

import type { CopyAction, ShippingCopyOperation, ShippingCopyState } from '@/lib/api/shipping';

/**
 * Estados que admite cada código de éxito de una operación de copia, tal como los publica el
 * contrato: `201` lista; `202` copiando o fallida; `200` lista o descartada. Un código con un estado
 * que no le corresponde es una respuesta fuera de contrato.
 */
export const COPY_STATUS_STATES: Readonly<Record<number, readonly ShippingCopyState[]>> = {
  200: ['ready', 'discarded'],
  201: ['ready'],
  202: ['copying', 'failed'],
};

export function isPublishedCopyAnswer(status: number, state: ShippingCopyState): boolean {
  return COPY_STATUS_STATES[status]?.includes(state) ?? false;
}

export const COPY_PHASE_LABELS: Readonly<Record<ShippingCopyOperation['phase'], string>> = {
  coverage: 'cobertura',
  rules: 'reglas',
  targets: 'asignaciones',
  finish: 'cierre',
};

/**
 * Acciones de una operación según su estado.
 *
 * `copying` conserva consultar, reanudar y descartar: si el backend no consiguió marcar un fallo,
 * la copia puede quedarse en `copying` y reanudarla o descartarla es la salida. `failed` igual.
 * `ready` y `discarded` son estados finales; descartar otra vez una descartada es idempotente, pero
 * no hace falta ofrecerlo.
 */
export function copyActions(state: ShippingCopyState): readonly CopyAction[] {
  switch (state) {
    case 'copying':
    case 'failed':
      return ['resume', 'discard'];
    case 'ready':
    case 'discarded':
      return [];
  }
}

/** Códigos de fallo estables que publica el contrato, en palabras. */
export const COPY_FAILURE_LABELS: Readonly<Record<string, string>> = {
  copy_step_failed: 'Un lote de la copia no se pudo completar.',
  copy_source_changed: 'La zona original cambió durante la copia.',
  copy_abandoned: 'La copia quedó abandonada sin terminar.',
};

/**
 * El motivo del fallo a partir de `failureCode`, nunca de `message`. Un código de transición que el
 * panel no lista se nombra genéricamente; el código se muestra aparte, tal cual.
 */
export function describeCopyFailure(failureCode: string | null): string | null {
  if (failureCode === null) return null;

  return COPY_FAILURE_LABELS[failureCode] ?? 'La copia no pudo continuar en su estado actual.';
}

/** Un 409 al descartar: la copia ya terminó y su zona es un borrador normal. */
export function describeCopyActionFailure(action: CopyAction, code: string): string | null {
  if (action === 'discard' && code === 'shipping_transition_invalid') {
    return 'Esta copia ya terminó: no se descarta. Su zona es un borrador normal que puedes archivar.';
  }

  if (code === 'copy_operation_not_found') return 'Esa operación de copia no existe.';

  return null;
}

/** Resumen del progreso por fase, con los contadores publicados. */
export function describeProgress(
  operation: Pick<ShippingCopyOperation, 'copied' | 'phase' | 'state'>,
): string {
  const plural = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;
  const counts = `${plural(operation.copied.coverage, 'entrada', 'entradas')} de cobertura, ${plural(
    operation.copied.rules,
    'regla',
    'reglas',
  )} y ${plural(operation.copied.targets, 'asignación', 'asignaciones')} copiadas`;

  return operation.state === 'ready' || operation.state === 'discarded'
    ? `${counts}.`
    : `${counts} · siguiente fase: ${COPY_PHASE_LABELS[operation.phase]}.`;
}
