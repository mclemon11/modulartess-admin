/**
 * El `eventId` de una simulación de pago, y cuándo se conserva.
 *
 * Vive aparte de la pantalla porque es la pieza delicada de toda la superficie y merece probarse
 * sin React. El contrato la define así: «Replaying the same eventId with the same outcome changes
 * nothing; reusing it with a different outcome is a conflict». De ahí salen las tres reglas:
 *
 *   - se genera **una vez por operación lógica** —un resultado concreto sobre un pedido concreto—;
 *   - **se reutiliza** si hay que repetir exactamente esa misma petición tras un resultado de red
 *     ambiguo, porque la primera pudo haberse aplicado y un identificador nuevo la duplicaría;
 *   - se descarta en cuanto la operación se cierra, con éxito o con un rechazo definitivo.
 *
 * Nada de esto se guarda en `localStorage`, en `sessionStorage`, en una cookie ni en la URL: el
 * mapa vive en memoria mientras la pantalla está abierta y desaparece con ella. Un identificador
 * idempotente que sobrevive a su operación deja de proteger y empieza a estorbar.
 *
 * Módulo puro: entra un mapa, sale otro. No genera identificadores por su cuenta —quien llama pasa
 * `crypto.randomUUID`—, así que las pruebas no dependen del azar.
 */

/** Identificadores en vuelo, por resultado. Solo están los que no se han cerrado. */
export type PendingEventIds = Readonly<Record<string, string>>;

export const NO_PENDING_EVENT_IDS: PendingEventIds = {};

/**
 * Cómo terminó la petición.
 *
 *   - `applied`: el backend devolvió el pedido. La operación se cerró.
 *   - `rejected`: el backend la rechazó con un código del contrato. Tampoco hay nada en vuelo.
 *   - `ambiguous`: no se supo. **No se cierra**, porque pudo haberse aplicado.
 */
export type SimulationOutcome = 'applied' | 'rejected' | 'ambiguous';

/**
 * Identificador con el que mandar este resultado.
 *
 * Si ya hay uno pendiente para ese resultado, es **ese**: significa que la petición anterior quedó
 * en el aire y esta es la misma operación, no otra.
 */
export function takeEventId(
  pending: PendingEventIds,
  event: string,
  create: () => string,
): { readonly pending: PendingEventIds; readonly eventId: string } {
  const existing = pending[event];

  if (existing !== undefined) {
    return { pending, eventId: existing };
  }

  const eventId = create();

  return { pending: { ...pending, [event]: eventId }, eventId };
}

/**
 * Cierra —o no— el identificador de ese resultado.
 *
 * Un resultado ambiguo lo **conserva**: es justo el caso para el que existe la idempotencia.
 */
export function settleEventId(
  pending: PendingEventIds,
  event: string,
  outcome: SimulationOutcome,
): PendingEventIds {
  if (outcome === 'ambiguous') {
    return pending;
  }

  return Object.fromEntries(Object.entries(pending).filter(([key]) => key !== event));
}
