/**
 * Paso «Información» de una zona: de lo que se escribe a lo que viaja.
 *
 * La vigencia se escribe en hora de Colombia y viaja como ISO 8601 con desfase explícito, como
 * exige el contrato («ISO 8601 with an explicit offset. Stored in UTC»). Colombia no tiene horario
 * de verano, así que el desfase es siempre `-05:00`.
 *
 * Módulo puro.
 */

import type { ShippingZone, UnmatchedProductBehavior } from '@/lib/api/shipping';

import { NAME_MAX } from './rate-draft';

export const DESCRIPTION_MAX = 300;
export const PRIORITY_MIN = 0;
export const PRIORITY_MAX = 1000;

const BOGOTA_OFFSET = '-05:00';
const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export type ZoneDraft = {
  readonly name: string;
  readonly description: string;
  readonly priority: string;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly unmatchedProductBehavior: UnmatchedProductBehavior | '';
};

export const EMPTY_ZONE_DRAFT: ZoneDraft = {
  name: '',
  description: '',
  priority: '',
  validFrom: '',
  validUntil: '',
  unmatchedProductBehavior: '',
};

/** Valor de un `<input type="datetime-local">` a ISO con desfase de Bogotá. */
export function localToIso(value: string): string | null {
  return LOCAL.test(value) ? `${value}:00${BOGOTA_OFFSET}` : null;
}

/** ISO del backend a valor de `<input type="datetime-local">`, en hora de Bogotá. */
export function isoToLocal(iso: string | null): string {
  if (iso === null) return '';

  const time = Date.parse(iso);

  if (Number.isNaN(time)) return '';

  return new Date(time + BOGOTA_OFFSET_MS).toISOString().slice(0, 16);
}

export function draftFromZone(zone: ShippingZone): ZoneDraft {
  return {
    name: zone.name,
    description: zone.description ?? '',
    priority: String(zone.priority),
    validFrom: isoToLocal(zone.validFrom),
    validUntil: isoToLocal(zone.validUntil),
    unmatchedProductBehavior: zone.unmatchedProductBehavior,
  };
}

export type ZoneFieldErrors = Partial<Record<keyof ZoneDraft, string>>;

export type ZoneValues = {
  readonly name: string;
  readonly description: string | null;
  readonly priority: number;
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  readonly unmatchedProductBehavior: UnmatchedProductBehavior;
};

export type ZoneParse =
  | { readonly ok: true; readonly values: ZoneValues }
  | { readonly ok: false; readonly errors: ZoneFieldErrors };

export function parseZoneDraft(draft: ZoneDraft): ZoneParse {
  const errors: ZoneFieldErrors = {};
  const name = draft.name.trim();
  const description = draft.description.trim();

  if (name.length === 0) errors.name = 'Escribe el nombre de la zona.';
  else if (name.length > NAME_MAX) errors.name = `Como mucho ${NAME_MAX} caracteres.`;

  if (description.length > DESCRIPTION_MAX) {
    errors.description = `Como mucho ${DESCRIPTION_MAX} caracteres.`;
  }

  const priorityText = draft.priority.trim();
  const priority = Number(priorityText);

  if (priorityText.length === 0) errors.priority = 'Escribe la prioridad.';
  else if (!/^\d{1,4}$/.test(priorityText) || priority < PRIORITY_MIN || priority > PRIORITY_MAX) {
    errors.priority = `Un entero entre ${PRIORITY_MIN} y ${PRIORITY_MAX}.`;
  }

  const validFrom = draft.validFrom === '' ? null : localToIso(draft.validFrom);
  const validUntil = draft.validUntil === '' ? null : localToIso(draft.validUntil);

  if (draft.validFrom !== '' && validFrom === null) errors.validFrom = 'Fecha y hora no válidas.';
  if (draft.validUntil !== '' && validUntil === null)
    errors.validUntil = 'Fecha y hora no válidas.';
  if (
    validFrom !== null &&
    validUntil !== null &&
    Date.parse(validFrom) >= Date.parse(validUntil)
  ) {
    errors.validUntil = 'El final de la vigencia tiene que ser posterior al inicio.';
  }

  if (draft.unmatchedProductBehavior === '') {
    errors.unmatchedProductBehavior = 'Elige qué recibe un producto sin regla en esta zona.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    values: {
      name,
      description: description.length === 0 ? null : description,
      priority,
      validFrom,
      validUntil,
      unmatchedProductBehavior: draft.unmatchedProductBehavior as UnmatchedProductBehavior,
    },
  };
}

/**
 * Solo lo que cambió respecto de la zona guardada.
 *
 * Mandar campos iguales no es inocuo: cambiar la prioridad de una zona activa se valida contra las
 * demás, y reenviar la misma prioridad haría esa comprobación sin motivo.
 */
export function changedFields(zone: ShippingZone, values: ZoneValues): Partial<ZoneValues> {
  const changes: { -readonly [K in keyof ZoneValues]?: ZoneValues[K] } = {};
  const sameInstant = (a: string | null, b: string | null) =>
    a === null || b === null ? a === b : Date.parse(a) === Date.parse(b);

  if (values.name !== zone.name) changes.name = values.name;
  if (values.description !== (zone.description ?? null)) changes.description = values.description;
  if (values.priority !== zone.priority) changes.priority = values.priority;
  if (!sameInstant(values.validFrom, zone.validFrom)) changes.validFrom = values.validFrom;
  if (!sameInstant(values.validUntil, zone.validUntil)) changes.validUntil = values.validUntil;
  if (values.unmatchedProductBehavior !== zone.unmatchedProductBehavior) {
    changes.unmatchedProductBehavior = values.unmatchedProductBehavior;
  }

  return changes;
}

export const STEPS = [
  { id: 'informacion', label: 'Información' },
  { id: 'cobertura', label: 'Cobertura' },
  { id: 'tarifas', label: 'Tarifas' },
  { id: 'productos', label: 'Productos' },
  { id: 'revision', label: 'Revisión' },
] as const;

export type StepId = (typeof STEPS)[number]['id'];

export function parseStep(value: string | string[] | undefined): StepId {
  const raw = Array.isArray(value) ? value[0] : value;

  return STEPS.find((step) => step.id === raw)?.id ?? 'informacion';
}

export function stepHref(zoneId: string, step: StepId): string {
  return `/panel/envios/${encodeURIComponent(zoneId)}?paso=${step}`;
}

export function nextStep(step: StepId): StepId | null {
  const index = STEPS.findIndex((candidate) => candidate.id === step);

  return STEPS[index + 1]?.id ?? null;
}

export function previousStep(step: StepId): StepId | null {
  const index = STEPS.findIndex((candidate) => candidate.id === step);

  return index > 0 ? (STEPS[index - 1]?.id ?? null) : null;
}

/** Por qué una zona no se puede editar, o `null` si se puede. */
export function readOnlyReason(
  zone: Pick<ShippingZone, 'status' | 'copy'>,
  canManage: boolean,
): string | null {
  if (!canManage) return 'Tu rol consulta envíos en modo de solo lectura.';
  if (zone.copy.state !== 'ready') {
    return 'Esta zona es una copia que no está lista: no se puede editar ni activar.';
  }
  if (zone.status === 'archived') {
    return 'Esta zona está archivada: no se edita. Restáurala como borrador para cambiarla y volver a activarla, o duplícala.';
  }

  return null;
}
