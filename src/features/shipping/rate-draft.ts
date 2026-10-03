/**
 * Tarifa de una regla: de lo que se escribe a lo que viaja.
 *
 * El contrato es estricto —«Each type accepts exactly its own amounts; any other amount is
 * rejected», «Integer COP only»— y este módulo lo es igual:
 *
 *   - cada tipo produce **solo** sus montos; los demás viajan como `null`;
 *   - un campo vacío es un error, **nunca** un cero. «Envío gratis» solo existe si se elige el tipo
 *     `free`, que dice «$ 0» de forma explícita;
 *   - solo enteros en pesos y nunca negativos, con el mismo analizador del precio del producto.
 *
 * Módulo puro.
 */

import { describeCopProblem, formatCop, groupCop, parseCop } from '@/features/panel/money';
import type { ShippingRate, ShippingRateType } from '@/lib/api/shipping';

/** Tope que publica el contrato para `amountCop`. */
export const SHIPPING_AMOUNT_MAX_COP = 10_000_000;

/** Tope de los días de tránsito que publica el contrato. */
export const TRANSIT_DAYS_MAX = 90;

/** Tope del nombre de la regla y de la zona. */
export const NAME_MAX = 80;

export type RateField = 'amountCop' | 'unitCop' | 'baseCop' | 'additionalUnitCop';

export type RateDraft = {
  readonly type: ShippingRateType | '';
  readonly amountCop: string;
  readonly unitCop: string;
  readonly baseCop: string;
  readonly additionalUnitCop: string;
};

export const EMPTY_RATE_DRAFT: RateDraft = {
  type: '',
  amountCop: '',
  unitCop: '',
  baseCop: '',
  additionalUnitCop: '',
};

/** Los campos que muestra cada tipo, en orden. `free` y `manual_quote` no tienen ninguno. */
export const RATE_FIELDS: Readonly<Record<ShippingRateType, readonly RateField[]>> = {
  free: [],
  flat_order: ['amountCop'],
  per_unit: ['unitCop'],
  base_plus_additional: ['baseCop', 'additionalUnitCop'],
  manual_quote: [],
};

export const RATE_FIELD_LABELS: Readonly<Record<RateField, string>> = {
  amountCop: 'Monto por pedido (COP)',
  unitCop: 'Monto por unidad (COP)',
  baseCop: 'Valor base, primera unidad (COP)',
  additionalUnitCop: 'Valor por unidad adicional (COP)',
};

/**
 * Mínimo de cada campo.
 *
 * Un monto de cero en una tarifa de pago se rechaza: cobrar cero se dice eligiendo «Gratis», para
 * que la regla y el pedido lo llamen por su nombre. El valor adicional sí admite cero —la base
 * cubre todas las unidades—.
 */
const MINIMUM: Readonly<Record<RateField, number>> = {
  amountCop: 1,
  unitCop: 1,
  baseCop: 1,
  additionalUnitCop: 0,
};

export type RateErrors = Partial<Record<RateField | 'type', string>>;

export type RateResult =
  | { readonly ok: true; readonly rate: ShippingRate }
  | { readonly ok: false; readonly errors: RateErrors };

function amount(raw: string, field: RateField): { value: number } | { error: string } {
  if (raw.trim().length === 0) {
    return { error: 'Escribe el monto en pesos. Un campo vacío no significa envío gratis.' };
  }

  const parsed = parseCop(raw);

  if (!parsed.ok) {
    return {
      error:
        parsed.problem === 'negative'
          ? 'El monto no puede ser negativo.'
          : parsed.problem === 'too_large'
            ? `El monto no puede superar ${formatCop(SHIPPING_AMOUNT_MAX_COP)}.`
            : describeCopProblem(parsed.problem),
    };
  }

  if (parsed.value < MINIMUM[field]) {
    return { error: 'Para no cobrar envío, elige el tipo «Gratis».' };
  }

  if (parsed.value > SHIPPING_AMOUNT_MAX_COP) {
    return { error: `El monto no puede superar ${formatCop(SHIPPING_AMOUNT_MAX_COP)}.` };
  }

  return { value: parsed.value };
}

/** Convierte el borrador en la tarifa del contrato, o dice qué campo falla y por qué. */
export function rateFromDraft(draft: RateDraft): RateResult {
  if (draft.type === '') {
    return { ok: false, errors: { type: 'Elige el tipo de tarifa.' } };
  }

  const rate: {
    type: ShippingRateType;
    amountCop: number | null;
    unitCop: number | null;
    baseCop: number | null;
    additionalUnitCop: number | null;
  } = { type: draft.type, amountCop: null, unitCop: null, baseCop: null, additionalUnitCop: null };
  const errors: RateErrors = {};

  for (const field of RATE_FIELDS[draft.type]) {
    const result = amount(draft[field], field);

    if ('error' in result) errors[field] = result.error;
    else rate[field] = result.value;
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, rate };
}

/** Borrador a partir de una tarifa guardada, para editarla. */
export function draftFromRate(rate: ShippingRate): RateDraft {
  const text = (value: number | null) => (value === null ? '' : groupCop(value));

  return {
    type: rate.type,
    amountCop: text(rate.amountCop),
    unitCop: text(rate.unitCop),
    baseCop: text(rate.baseCop),
    additionalUnitCop: text(rate.additionalUnitCop),
  };
}

/**
 * Ejemplo con cantidades concretas, en formato colombiano.
 *
 * Es una **ilustración** de la fórmula que describe el contrato para una sola regla y la cantidad
 * dada. No es la cotización: el costo real lo calcula el backend con todas las reglas y el destino,
 * y la vista previa es la herramienta para verlo.
 */
export function illustrateRate(rate: ShippingRate, units: number): string {
  const label = `${units} unidad${units === 1 ? '' : 'es'}`;

  switch (rate.type) {
    case 'free':
      return `${label}: ${formatCop(0)}`;
    case 'manual_quote':
      return `${label}: se cotiza a mano`;
    case 'flat_order':
      return `${label}: ${formatCop(rate.amountCop ?? 0)} (una vez por pedido)`;
    case 'per_unit':
      return `${label}: ${units} × ${formatCop(rate.unitCop ?? 0)} = ${formatCop(units * (rate.unitCop ?? 0))}`;
    case 'base_plus_additional': {
      const base = rate.baseCop ?? 0;
      const extra = rate.additionalUnitCop ?? 0;

      return `${label}: ${formatCop(base)} + ${units - 1} × ${formatCop(extra)} = ${formatCop(base + (units - 1) * extra)}`;
    }
  }
}

export type TransitResult =
  | { readonly ok: true; readonly min: number | null; readonly max: number | null }
  | { readonly ok: false; readonly error: string };

function day(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim();

  if (trimmed.length === 0) return null;
  if (!/^\d{1,2}$/.test(trimmed)) return 'invalid';

  const value = Number(trimmed);

  return value > TRANSIT_DAYS_MAX ? 'invalid' : value;
}

/** Días de tránsito opcionales: enteros de 0 a 90, con el mínimo no mayor que el máximo. */
export function parseTransit(minRaw: string, maxRaw: string): TransitResult {
  const min = day(minRaw);
  const max = day(maxRaw);

  if (min === 'invalid' || max === 'invalid') {
    return { ok: false, error: `Los días de tránsito son enteros entre 0 y ${TRANSIT_DAYS_MAX}.` };
  }

  if (min !== null && max !== null && min > max) {
    return { ok: false, error: 'El mínimo de días no puede ser mayor que el máximo.' };
  }

  return { ok: true, min, max };
}
