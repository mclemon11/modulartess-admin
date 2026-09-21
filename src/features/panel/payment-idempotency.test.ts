import { describe, expect, it } from 'vitest';

import {
  NO_PENDING_EVENT_IDS,
  settleEventId,
  takeEventId,
  type PendingEventIds,
} from './payment-idempotency';

/**
 * El `eventId` de una simulación de pago.
 *
 * Es la pieza que impide aplicar dos veces el mismo resultado cuando una petición se pierde de
 * vista. Las tres reglas salen del contrato: repetir el mismo identificador con el mismo resultado
 * no cambia nada, reutilizarlo con otro es un conflicto, y una respuesta que no se llegó a leer
 * **no** autoriza a generar uno nuevo.
 */

/** Generador determinista: las pruebas no dependen del azar de `crypto.randomUUID`. */
function counter(prefix = 'id'): () => string {
  let next = 0;

  return () => {
    next += 1;

    return `${prefix}-${next}`;
  };
}

describe('primera operación', () => {
  it('genera un identificador y lo deja pendiente', () => {
    const create = counter();
    const taken = takeEventId(NO_PENDING_EVENT_IDS, 'approved', create);

    expect(taken.eventId).toBe('id-1');
    expect(taken.pending).toEqual({ approved: 'id-1' });
  });

  it('no toca el mapa de entrada', () => {
    const before: PendingEventIds = {};

    takeEventId(before, 'approved', counter());

    expect(before).toEqual({});
  });

  it('cada resultado tiene el suyo: no se comparte entre eventos distintos', () => {
    const create = counter();
    const first = takeEventId(NO_PENDING_EVENT_IDS, 'approved', create);
    const second = takeEventId(first.pending, 'declined', create);

    expect(second.eventId).not.toBe(first.eventId);
    expect(second.pending).toEqual({ approved: 'id-1', declined: 'id-2' });
  });
});

describe('tras un resultado ambiguo', () => {
  /*
   * La petición pudo haberse aplicado. Generar un identificador nuevo la aplicaría otra vez; repetir
   * el mismo no puede duplicar nada.
   */
  it('conserva el identificador y lo reutiliza en el reintento', () => {
    const create = counter();
    const first = takeEventId(NO_PENDING_EVENT_IDS, 'approved', create);
    const kept = settleEventId(first.pending, 'approved', 'ambiguous');
    const retry = takeEventId(kept, 'approved', create);

    expect(kept).toEqual({ approved: 'id-1' });
    expect(retry.eventId).toBe('id-1');
  });

  it('el reintento no llama al generador', () => {
    let calls = 0;
    const create = () => {
      calls += 1;

      return `id-${calls}`;
    };

    const first = takeEventId(NO_PENDING_EVENT_IDS, 'approved', create);
    const kept = settleEventId(first.pending, 'approved', 'ambiguous');

    takeEventId(kept, 'approved', create);

    expect(calls).toBe(1);
  });

  it('varios resultados ambiguos seguidos siguen dando el mismo identificador', () => {
    const create = counter();
    let pending = takeEventId(NO_PENDING_EVENT_IDS, 'approved', create).pending;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const taken = takeEventId(pending, 'approved', create);

      expect(taken.eventId).toBe('id-1');
      pending = settleEventId(taken.pending, 'approved', 'ambiguous');
    }
  });
});

describe('cuando la operación se cierra', () => {
  it.each(['applied', 'rejected'] as const)(
    'un resultado %s descarta el identificador',
    (outcome) => {
      const create = counter();
      const first = takeEventId(NO_PENDING_EVENT_IDS, 'approved', create);
      const settled = settleEventId(first.pending, 'approved', outcome);

      expect(settled).toEqual({});
      expect(takeEventId(settled, 'approved', create).eventId).toBe('id-2');
    },
  );

  it('cerrar uno no toca los demás', () => {
    const create = counter();
    const first = takeEventId(NO_PENDING_EVENT_IDS, 'approved', create);
    const second = takeEventId(first.pending, 'declined', create);

    expect(settleEventId(second.pending, 'approved', 'applied')).toEqual({ declined: 'id-2' });
  });

  it('cerrar algo que no estaba pendiente no rompe nada', () => {
    expect(settleEventId(NO_PENDING_EVENT_IDS, 'approved', 'applied')).toEqual({});
  });
});
