/**
 * Advertencias y bloqueos de la revisión de una zona.
 *
 * No es la validación: esa la hace el backend al activar —cobertura, al menos una regla activa y
 * ningún empate con otra zona activa de la misma prioridad—, y el diálogo de activación vuelve a
 * pedir su análisis. Saber qué zonas comparten prioridad exigiría leerlas todas, y no se hace. Esto **anticipa** lo que se puede
 * leer sin calcular nada comercial, para que nadie pulse «Activar» a ciegas. Ninguna advertencia
 * de falta de cobertura se presenta nunca como costo cero.
 *
 * Módulo puro.
 */

import type { ShippingAnalysis, ShippingRule, ShippingZone } from '@/lib/api/shipping';

import { UNMATCHED_LABELS, validityState } from './shipping-labels';

export type ReviewSeverity = 'blocking' | 'warning' | 'info';

export type ReviewItem = { readonly severity: ReviewSeverity; readonly text: string };

export type ReviewInput = {
  readonly zone: Pick<
    ShippingZone,
    | 'status'
    | 'copy'
    | 'coverage'
    | 'unmatchedProductBehavior'
    | 'validFrom'
    | 'validUntil'
    | 'priority'
    | 'id'
  >;
  readonly rules: readonly Pick<ShippingRule, 'status' | 'scope' | 'targetCount' | 'rate'>[];
  readonly now: Date;
  readonly analysis: Pick<
    ShippingAnalysis,
    'conflicts' | 'uncoveredMunicipalityCodes' | 'totalMunicipalityCount'
  > | null;
};

function hasCoverage(zone: ReviewInput['zone']): boolean {
  const { national, departmentCodes, municipalitiesByDepartment } = zone.coverage;

  return (
    national ||
    departmentCodes.length > 0 ||
    Object.values(municipalitiesByDepartment).some((count) => count > 0)
  );
}

export function reviewZone(input: ReviewInput): ReviewItem[] {
  const { zone, rules, now, analysis } = input;
  const items: ReviewItem[] = [];
  const active = rules.filter((rule) => rule.status === 'active');

  if (zone.copy.state === 'copying') {
    items.push({
      severity: 'blocking',
      text: 'La copia de esta zona sigue en curso: no puede activarse.',
    });
  } else if (zone.copy.state === 'failed') {
    items.push({
      severity: 'blocking',
      text: 'La copia de esta zona falló: no puede activarse. Reintenta o descarta la copia desde «Copias».',
    });
  } else if (zone.copy.state === 'discarded') {
    items.push({ severity: 'blocking', text: 'Esta copia se descartó: no puede activarse.' });
  }

  if (zone.status === 'archived') {
    items.push({
      severity: 'blocking',
      text: 'La zona está archivada: restáurala como borrador para poder activarla otra vez.',
    });
  }

  if (zone.status === 'active') {
    items.push({
      severity: 'info',
      text: 'La zona ya está activa y cotiza dentro de su vigencia.',
    });
  }

  if (!hasCoverage(zone)) {
    items.push({
      severity: 'blocking',
      text: 'Sin cobertura: el backend no activa una zona que no cubre ningún destino.',
    });
  }

  if (active.length === 0) {
    items.push({
      severity: 'blocking',
      text: 'Sin reglas activas: hace falta al menos una tarifa.',
    });
  }

  if (active.length > 0 && !active.some((rule) => rule.scope === 'all')) {
    items.push({
      severity: 'warning',
      text: `No hay regla para todos los productos: un producto sin regla en esta zona recibe «${UNMATCHED_LABELS[zone.unmatchedProductBehavior]}», nunca envío gratis.`,
    });
  }

  for (const rule of active) {
    if (rule.scope !== 'all' && rule.targetCount === 0) {
      items.push({
        severity: 'warning',
        text: 'Hay una regla de categorías o productos sin nada asignado: no alcanza a ningún producto.',
      });
      break;
    }
  }

  const validity = validityState(zone, now);

  if (validity === 'expired') {
    items.push({
      severity: 'warning',
      text: 'La vigencia ya terminó: aunque se active, no cotizará.',
    });
  } else if (validity === 'scheduled') {
    items.push({
      severity: 'warning',
      text: 'La vigencia todavía no empieza: activa, cotizará desde su fecha de inicio.',
    });
  }

  if (analysis !== null) {
    if (analysis.conflicts.length > 0) {
      items.push({
        severity: 'warning',
        text: `La red activa ya tiene ${analysis.conflicts.length} empate${analysis.conflicts.length === 1 ? '' : 's'} entre zonas: en esos municipios el envío queda no disponible hasta resolverlo.`,
      });
    }

    if (analysis.uncoveredMunicipalityCodes.length > 0) {
      items.push({
        severity: 'warning',
        text: `${analysis.uncoveredMunicipalityCodes.length} de ${analysis.totalMunicipalityCount} municipios no tienen ninguna zona activa: allí el envío es cotización manual o no disponible, nunca gratis.`,
      });
    }
  }

  return items;
}

/** ¿Se puede pedir la activación? Solo un borrador sin bloqueos. El backend decide igual. */
export function canActivate(
  items: readonly ReviewItem[],
  zone: Pick<ShippingZone, 'status' | 'copy'>,
): boolean {
  return (
    zone.status === 'draft' &&
    zone.copy.state === 'ready' &&
    !items.some((item) => item.severity === 'blocking')
  );
}
