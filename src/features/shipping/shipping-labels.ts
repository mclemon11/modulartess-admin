/**
 * Textos de las zonas de envío, uno por valor del contrato.
 *
 * Las claves son exactamente los `enum` que publica OpenAPI; una prueba lo comprueba contra la
 * copia comiteada, así que un valor nuevo en el backend falla aquí en vez de pintarse crudo.
 *
 * Módulo puro: sirve igual al servidor y al navegador.
 */

import { formatCop } from '@/features/panel/money';
import type {
  ShippingCopyState,
  ShippingCoverageKind,
  ShippingLevel,
  ShippingOutcome,
  ShippingRate,
  ShippingRateType,
  ShippingReason,
  ShippingRuleScope,
  ShippingZone,
  ShippingZoneStatus,
  UnmatchedProductBehavior,
} from '@/lib/api/shipping';

export const ZONE_STATUS_LABELS: Readonly<Record<ShippingZoneStatus, string>> = {
  draft: 'Borrador',
  active: 'Activa',
  archived: 'Archivada',
};

/** Estado técnico de la copia. `ready` no se pinta: una zona lista es una zona normal. */
export const COPY_STATE_LABELS: Readonly<Record<ShippingCopyState, string>> = {
  copying: 'Copiando',
  ready: 'Lista',
  failed: 'Copia fallida',
  discarded: 'Copia descartada',
};

export const RATE_TYPE_LABELS: Readonly<Record<ShippingRateType, string>> = {
  free: 'Gratis',
  flat_order: 'Fija por pedido',
  per_unit: 'Por unidad',
  base_plus_additional: 'Base más unidad adicional',
  manual_quote: 'Cotización manual',
};

export const RATE_TYPES: readonly ShippingRateType[] = [
  'free',
  'flat_order',
  'per_unit',
  'base_plus_additional',
  'manual_quote',
];

/** Cómo se cobra cada tipo, con las palabras de la descripción del contrato. */
export const RATE_TYPE_HINTS: Readonly<Record<ShippingRateType, string>> = {
  free: 'No se cobra envío. El costo es $ 0 y se declara de forma explícita.',
  flat_order: 'Un único monto por pedido y por regla, sin importar cuántas unidades lleve.',
  per_unit: 'El monto se multiplica por las unidades del pedido que caen en esta regla.',
  base_plus_additional:
    'La primera unidad paga el valor base y cada unidad siguiente, el valor adicional.',
  manual_quote: 'Sin monto: el envío se cotiza a mano después del pedido.',
};

export const SCOPE_LABELS: Readonly<Record<ShippingRuleScope, string>> = {
  all: 'Todos los productos',
  categories: 'Categorías seleccionadas',
  products: 'Productos concretos',
};

export const LEVEL_LABELS: Readonly<Record<ShippingLevel, string>> = {
  municipality: 'Municipio',
  department: 'Departamento',
  national: 'Nacional',
};

export const OUTCOME_LABELS: Readonly<Record<ShippingOutcome, string>> = {
  charged: 'Tarifa calculada',
  free: 'Envío gratis',
  manual_quote: 'Cotización manual',
  unavailable: 'No disponible',
};

export const REASON_LABELS: Readonly<Record<ShippingReason, string>> = {
  destination_invalid: 'El destino no es un municipio válido de la división oficial.',
  destination_not_covered: 'Ninguna zona activa cubre ese municipio.',
  ambiguous_configuration:
    'Empate: dos zonas activas con la misma prioridad cubren el municipio al mismo nivel. Nunca se resuelve como gratis.',
  product_not_covered: 'El producto no tiene una regla en la zona que cubre el destino.',
  manual_quote_rule: 'La regla que aplica es de cotización manual.',
};

export const UNMATCHED_LABELS: Readonly<Record<UnmatchedProductBehavior, string>> = {
  manual_quote: 'Cotización manual',
  unavailable: 'No disponible',
};

export const COVERAGE_KIND_LABELS: Readonly<Record<ShippingCoverageKind, string>> = {
  national: 'Respaldo nacional',
  department: 'Departamento completo',
  municipality: 'Municipio',
  exclusion: 'Exclusión',
};

/** «$ 12.000», o «—» cuando el contrato trae `null`. Nunca convierte `null` en cero. */
export function copOrDash(value: number | null): string {
  return value === null ? '—' : formatCop(value);
}

/**
 * La tarifa en palabras: tipo y monto.
 *
 * `free` dice «$ 0» porque el contrato lo define así; ningún otro tipo produce cero a partir de un
 * campo vacío. Un monto `null` en un tipo que lo exige se pinta como «—», que es la verdad.
 */
export function describeRate(rate: ShippingRate): string {
  switch (rate.type) {
    case 'free':
      return `Gratis · ${formatCop(0)}`;
    case 'flat_order':
      return `${copOrDash(rate.amountCop)} por pedido`;
    case 'per_unit':
      return `${copOrDash(rate.unitCop)} por unidad`;
    case 'base_plus_additional':
      return `${copOrDash(rate.baseCop)} la primera unidad + ${copOrDash(rate.additionalUnitCop)} cada adicional`;
    case 'manual_quote':
      return 'Cotización manual · sin monto';
  }
}

/** Plazo de tránsito declarado en la regla, si lo hay. */
export function describeTransit(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if (min !== null && max !== null) {
    return min === max ? `${min} día${min === 1 ? '' : 's'}` : `${min} a ${max} días`;
  }
  if (min !== null) return `Desde ${min} día${min === 1 ? '' : 's'}`;
  return `Hasta ${max} día${max === 1 ? '' : 's'}`;
}

export type ValidityState = 'none' | 'scheduled' | 'current' | 'expired';

export const VALIDITY_LABELS: Readonly<Record<ValidityState, string>> = {
  none: 'Sin vigencia',
  scheduled: 'Programada',
  current: 'Vigente',
  expired: 'Vencida',
};

/**
 * Dónde cae `now` respecto de la ventana de la zona.
 *
 * Es una lectura de fechas, no una regla comercial: el backend decide si la zona cotiza. Solo se
 * usa para filtrar y para avisar.
 */
export function validityState(
  zone: Pick<ShippingZone, 'validFrom' | 'validUntil'>,
  now: Date,
): ValidityState {
  const from = zone.validFrom === null ? null : Date.parse(zone.validFrom);
  const until = zone.validUntil === null ? null : Date.parse(zone.validUntil);
  const at = now.getTime();

  if (from === null && until === null) return 'none';
  if (from !== null && at < from) return 'scheduled';
  if (until !== null && at >= until) return 'expired';

  return 'current';
}

const DATE = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'America/Bogota',
});

export function formatDay(iso: string): string {
  const time = Date.parse(iso);

  return Number.isNaN(time) ? '—' : DATE.format(new Date(time));
}

export function describeValidity(zone: Pick<ShippingZone, 'validFrom' | 'validUntil'>): string {
  if (zone.validFrom === null && zone.validUntil === null) return 'Sin vigencia definida';
  if (zone.validFrom !== null && zone.validUntil !== null) {
    return `Del ${formatDay(zone.validFrom)} al ${formatDay(zone.validUntil)}`;
  }
  if (zone.validFrom !== null) return `Desde el ${formatDay(zone.validFrom)}`;

  return `Hasta el ${formatDay(zone.validUntil as string)}`;
}

/** ¿La zona se puede usar? Solo una copia `ready` se edita, activa o cotiza. */
export function isUsable(zone: Pick<ShippingZone, 'copy'>): boolean {
  return zone.copy.state === 'ready';
}

/** Tipo de cobertura en palabras, a partir del resumen acotado de la zona. */
export function describeCoverageType(zone: Pick<ShippingZone, 'coverage'>): string {
  const { national, departmentCodes, municipalitiesByDepartment } = zone.coverage;
  const municipalities = sumCounts(municipalitiesByDepartment);

  if (national) return 'Respaldo nacional';
  if (departmentCodes.length > 0 && municipalities > 0) return 'Departamentos y municipios';
  if (departmentCodes.length > 0) return 'Departamentos completos';
  if (municipalities > 0) return 'Municipios específicos';

  return 'Sin cobertura';
}

/** Suma de un mapa de conteos por departamento, ignorando lo que no sea un entero positivo. */
export function sumCounts(counts: Readonly<Record<string, number>>): number {
  let total = 0;

  for (const value of Object.values(counts)) {
    if (Number.isInteger(value) && value > 0) total += value;
  }

  return total;
}
