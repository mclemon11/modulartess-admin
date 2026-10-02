/**
 * Precio anterior, etiquetas comerciales y días de preparación, en el formulario.
 *
 * Módulo puro: no toca red, DOM ni React. Lo usan el alta y la ficha.
 *
 * Lo que se valida aquí replica el contrato para avisar al escribir —precio anterior mayor que el
 * vigente, etiquetas cortas y sin marcado, rango coherente—; el backend vuelve a validarlo todo y
 * es la autoridad. Un campo vacío **elimina** la información: se envía `null`.
 *
 * La fecha se escribe y se lee en hora de **Colombia (UTC−5, sin horario de verano)**, que es la
 * de la tienda. No se usa la zona del navegador: el servidor renderiza la ficha antes de que el
 * navegador exista, y dos zonas distintas pintarían dos fechas distintas.
 */

import { parseCop } from './money';

/** Tope del contrato para las etiquetas. `maxLength: 24` en `UpdateProductRequestDto`. */
export const COMMERCIAL_LABEL_MAX_LENGTH = 24;

/** Tope del contrato para la preparación. `maximum: 180` en `AdminProductDto`. */
export const PREPARATION_DAYS_MAX = 180;

/** Colombia no tiene horario de verano: el desfase es fijo. */
const BOGOTA_OFFSET = '-05:00';
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

export type CommercialDraft = {
  /** Texto del campo, como el precio: se convierte al validar. */
  readonly compareAtPriceCop: string;
  /** `YYYY-MM-DDTHH:mm` en hora de Colombia, el formato de `<input type="datetime-local">`. */
  readonly newUntil: string;
  readonly newLabel: string;
  readonly promotionLabel: string;
  readonly preparationMin: string;
  readonly preparationMax: string;
};

export const EMPTY_COMMERCIAL: CommercialDraft = {
  compareAtPriceCop: '',
  newUntil: '',
  newLabel: '',
  promotionLabel: '',
  preparationMin: '',
  preparationMax: '',
};

export type CommercialField = keyof CommercialDraft;

export type CommercialProblems = Partial<Record<CommercialField, string>>;

/** Lo que llega del backend, en la forma de `AdminProductDto`. */
export type CommercialSource = {
  readonly compareAtPriceCop: number | null;
  readonly newUntil: string | null;
  readonly newLabel: string | null;
  readonly promotionLabel: string | null;
  readonly preparationDaysMin: number | null;
  readonly preparationDaysMax: number | null;
};

/** Lo que se envía en el `PATCH`. `null` borra; nunca se omite en edición. */
export type CommercialBody = {
  compareAtPriceCop: number | null;
  newUntil: string | null;
  newLabel: string | null;
  promotionLabel: string | null;
  preparationDaysMin: number | null;
  preparationDaysMax: number | null;
};

/** Instante UTC del backend → valor del campo en hora de Colombia. */
export function toBogotaInput(iso: string | null): string {
  if (iso === null) return '';
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  return new Date(time - BOGOTA_OFFSET_MS).toISOString().slice(0, 16);
}

/** Valor del campo en hora de Colombia → instante con zona explícita, como pide el contrato. */
export function fromBogotaInput(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) return null;
  const candidate = `${trimmed}:00${BOGOTA_OFFSET}`;
  return Number.isNaN(Date.parse(candidate)) ? null : candidate;
}

export function commercialFromProduct(product: CommercialSource): CommercialDraft {
  return {
    compareAtPriceCop: product.compareAtPriceCop === null ? '' : String(product.compareAtPriceCop),
    newUntil: toBogotaInput(product.newUntil),
    newLabel: product.newLabel ?? '',
    promotionLabel: product.promotionLabel ?? '',
    preparationMin: product.preparationDaysMin === null ? '' : String(product.preparationDaysMin),
    preparationMax: product.preparationDaysMax === null ? '' : String(product.preparationDaysMax),
  };
}

/**
 * Descuento que mostrará la tienda: porcentaje **redondeado hacia abajo**, como lo calcula ella.
 *
 * `null` cuando no hay descuento real —sin precio anterior, o igual o inferior al vigente—: no hay
 * nada que previsualizar y no se enseña un «0 %».
 */
export function discountPercent(
  priceCop: number | null,
  compareAtPriceCop: number | null,
): number | null {
  if (priceCop === null || compareAtPriceCop === null) return null;
  if (!(compareAtPriceCop > priceCop) || compareAtPriceCop <= 0) return null;
  return Math.floor(((compareAtPriceCop - priceCop) / compareAtPriceCop) * 100);
}

/** Precio anterior leído del campo: `null` si está vacío, `undefined` si no se puede leer. */
export function parseCompareAt(raw: string): number | null | undefined {
  if (raw.trim() === '') return null;
  const parsed = parseCop(raw);
  return parsed.ok && parsed.value > 0 ? parsed.value : undefined;
}

function labelProblem(raw: string): string | undefined {
  const label = raw.replace(/\s+/g, ' ').trim();
  if (label.length > COMMERCIAL_LABEL_MAX_LENGTH) {
    return `Máximo ${COMMERCIAL_LABEL_MAX_LENGTH} caracteres.`;
  }
  if (/[<>\u0000-\u001f\u007f]/.test(label)) {
    return 'Solo texto: sin «<», «>» ni marcado HTML.';
  }
  return undefined;
}

function dayValue(raw: string): number | null | undefined {
  if (raw.trim() === '') return null;
  if (!/^\d{1,3}$/.test(raw.trim())) return undefined;
  const value = Number(raw.trim());
  return value >= 1 && value <= PREPARATION_DAYS_MAX ? value : undefined;
}

/**
 * Problemas por campo. `priceCop` es el precio vigente que quedará guardado, o `null` si todavía
 * no se puede leer: entonces no se juzga el precio anterior contra él.
 */
export function commercialProblems(
  draft: CommercialDraft,
  priceCop: number | null,
): CommercialProblems {
  const problems: CommercialProblems = {};

  const compareAt = parseCompareAt(draft.compareAtPriceCop);
  if (compareAt === undefined) {
    problems.compareAtPriceCop = 'Escribe un precio en pesos enteros, mayor que cero.';
  } else if (compareAt !== null && priceCop !== null && compareAt <= priceCop) {
    problems.compareAtPriceCop = 'El precio anterior tiene que ser mayor que el precio vigente.';
  }

  if (draft.newUntil.trim() !== '' && fromBogotaInput(draft.newUntil) === null) {
    problems.newUntil = 'Fecha y hora no válidas.';
  }

  const newLabel = labelProblem(draft.newLabel);
  if (newLabel !== undefined) problems.newLabel = newLabel;
  const promotionLabel = labelProblem(draft.promotionLabel);
  if (promotionLabel !== undefined) problems.promotionLabel = promotionLabel;

  const min = dayValue(draft.preparationMin);
  const max = dayValue(draft.preparationMax);
  if (min === undefined) {
    problems.preparationMin = `Un número de días hábiles entre 1 y ${PREPARATION_DAYS_MAX}.`;
  }
  if (max === undefined) {
    problems.preparationMax = `Un número de días hábiles entre 1 y ${PREPARATION_DAYS_MAX}.`;
  }
  if (min !== undefined && max !== undefined) {
    if ((min === null) !== (max === null)) {
      problems[min === null ? 'preparationMin' : 'preparationMax'] =
        'Escribe los dos extremos del rango, o deja los dos vacíos.';
    } else if (min !== null && max !== null && min > max) {
      problems.preparationMax = 'El máximo no puede ser menor que el mínimo.';
    }
  }

  return problems;
}

export function hasCommercialProblems(problems: CommercialProblems): boolean {
  return Object.keys(problems).length > 0;
}

/**
 * El cuerpo que se envía. Solo se llama con un borrador sin problemas.
 *
 * Vacío es `null`: así se borra. Las etiquetas viajan recortadas; vacías, `null`, y la tienda usa
 * la predeterminada que publica el backend.
 */
export function commercialBody(draft: CommercialDraft): CommercialBody {
  const label = (raw: string) => {
    const trimmed = raw.replace(/\s+/g, ' ').trim();
    return trimmed === '' ? null : trimmed;
  };
  return {
    compareAtPriceCop: parseCompareAt(draft.compareAtPriceCop) ?? null,
    newUntil: draft.newUntil.trim() === '' ? null : fromBogotaInput(draft.newUntil),
    newLabel: label(draft.newLabel),
    promotionLabel: label(draft.promotionLabel),
    preparationDaysMin: dayValue(draft.preparationMin) ?? null,
    preparationDaysMax: dayValue(draft.preparationMax) ?? null,
  };
}

/** En el alta, solo lo que se escribió: un producto nuevo no tiene nada que borrar. */
export function commercialCreateBody(draft: CommercialDraft): Partial<CommercialBody> {
  const body = commercialBody(draft);
  return Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== null),
  ) as Partial<CommercialBody>;
}
